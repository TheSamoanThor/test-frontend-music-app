var Player = class Player {
    constructor(db, fileHandler) {
        this.db = db;
        this.fileHandler = fileHandler;
        this.audio = new Audio();
        this.currentTrack = null;
        this.queue = [];
        this.currentIndex = -1;
        this.isPlaying = false;
        this.ui = null;
        this.baseVolume = 80;

        this.initAudioEvents();
    }

    setUI(ui) {
        this.ui = ui;
    }

    initAudioEvents() {
        this.audio.addEventListener('timeupdate', () => {
            if (!this.audio.duration) return;
            const progress = (this.audio.currentTime / this.audio.duration) * 100;
            document.getElementById('progress').value = progress;
        });
        this.audio.addEventListener('ended', () => this.next());
        this.audio.addEventListener('error', () => this.next());
    }

    async loadQueue() {
        this.queue = await this.db.getQueue();
        if (this.ui) this.ui.renderQueue(this.queue);
        if (this.queue.length > 0 && this.currentIndex === -1) {
            this.currentIndex = 0;
            await this.loadTrack(this.queue[0]);
        }
    }

    async loadTrack(trackId) {
        const track = await this.db.getTrack(trackId);
        if (!track) return false;

        const file = await this.fileHandler.getFileForTrack(track);
        if (!file) {
            alert(`Не удалось загрузить файл: ${track.name}. Он будет удалён из очереди.`);
            const index = this.queue.indexOf(trackId);
            if (index !== -1) {
                await this.removeFromQueue(index);
            }
            if (this.queue.length > 0) {
                if (this.currentIndex >= this.queue.length) this.currentIndex = 0;
                return this.loadTrack(this.queue[this.currentIndex]);
            }
            return false;
        }

        this.currentTrack = track;
        const url = URL.createObjectURL(file);
        this.audio.src = url;
        this.audio.load();

        await this.updateEffectiveVolume();

        if (this.isPlaying) this.audio.play();

        const pictureUrl = await this.fileHandler.getPictureBlobUrl(file);
        if (this.ui) this.ui.updateCurrentTrack(track, pictureUrl);

        return true;
    }

    async updateEffectiveVolume() {
        if (!this.currentTrack) return;
        const tags = await this.db.getTags(this.currentTrack.id);
        let factor;
        const volFactor = utils.extractVolumeFactorFromTags(tags);
        if (volFactor !== null) {
            factor = volFactor;
        } else {
            factor = 1.0;
            for (let tag of tags) {
                const vol = await this.db.getTagVolume(tag);
                factor *= vol;
            }
            factor = Math.min(2.0, Math.max(0.1, factor));
        }
        const effective = (this.baseVolume / 100) * factor;
        this.audio.volume = Math.min(1, Math.max(0, effective));
    }

    async play() {
        if (!this.currentTrack && this.queue.length > 0) {
            this.currentIndex = 0;
            await this.loadTrack(this.queue[0]);
        }
        if (this.currentTrack) {
            this.audio.play();
            this.isPlaying = true;
            if (this.ui) this.ui.setPlayPauseIcon(true);
        }
    }

    pause() {
        this.audio.pause();
        this.isPlaying = false;
        if (this.ui) this.ui.setPlayPauseIcon(false);
    }

    togglePlay() {
        this.isPlaying ? this.pause() : this.play();
    }

    async next() {
        if (this.queue.length === 0) return;
        this.currentIndex = (this.currentIndex + 1) % this.queue.length;
        await this.loadTrack(this.queue[this.currentIndex]);
        if (this.isPlaying) this.audio.play();
    }

    async prev() {
        if (this.queue.length === 0) return;
        this.currentIndex = (this.currentIndex - 1 + this.queue.length) % this.queue.length;
        await this.loadTrack(this.queue[this.currentIndex]);
        if (this.isPlaying) this.audio.play();
    }

    async addToQueue(trackIds) {
        this.queue.push(...trackIds);
        await this.db.setQueue(this.queue);
        if (this.ui) this.ui.renderQueue(this.queue);
    }

    async removeFromQueue(index) {
        this.queue.splice(index, 1);
        if (index === this.currentIndex) {
            if (this.queue.length > 0) {
                if (this.currentIndex >= this.queue.length) this.currentIndex = 0;
                await this.loadTrack(this.queue[this.currentIndex]);
            } else {
                this.currentIndex = -1;
                this.currentTrack = null;
                this.audio.pause();
                this.isPlaying = false;
                if (this.ui) {
                    this.ui.updateCurrentTrack(null);
                    this.ui.setPlayPauseIcon(false);
                }
            }
        } else if (index < this.currentIndex) {
            this.currentIndex--;
        }
        await this.db.setQueue(this.queue);
        if (this.ui) this.ui.renderQueue(this.queue);
    }

    async clearQueue() {
        this.queue = [];
        this.currentIndex = -1;
        this.currentTrack = null;
        this.audio.pause();
        this.isPlaying = false;
        await this.db.setQueue([]);
        if (this.ui) {
            this.ui.renderQueue([]);
            this.ui.updateCurrentTrack(null);
            this.ui.setPlayPauseIcon(false);
        }
    }

    async shuffleQueue() {
        this.queue = this.shuffleArray(this.queue);
        await this.db.setQueue(this.queue);
        if (this.ui) this.ui.renderQueue(this.queue);
    }

    shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    async addRandomFromLibrary() {
        const allTracks = await this.db.getAllTracks();
        const availableTracks = [];
        for (let track of allTracks) {
            const tags = await this.db.getTags(track.id);
            if (!tags.includes('🚫 excluded')) {
                availableTracks.push(track);
            }
        }
        if (availableTracks.length === 0) {
            alert('Нет доступных треков (все исключены)');
            return;
        }
        const randomIndex = Math.floor(Math.random() * availableTracks.length);
        await this.addToQueue([availableTracks[randomIndex].id]);
    }

    setVolume(percent) {
        this.baseVolume = Math.min(100, Math.max(0, percent));
        if (this.currentTrack) {
            this.updateEffectiveVolume();
        } else {
            this.audio.volume = this.baseVolume / 100;
        }
    }

    seek(percent) {
        if (this.audio.duration) {
            this.audio.currentTime = (percent / 100) * this.audio.duration;
        }
    }
};