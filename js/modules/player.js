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

        // Для визуализатора
        this.audioCtx = null;
        this.analyser = null;
        this.source = null;
        this.visualizerCallbacks = [];
        this.visualizerActive = false;
        this.rafId = null;

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
            if (this.ui && this.ui.popup && this.ui.popup.isOpenForCurrent) {
                this.ui.popup.updateProgress(this.audio.currentTime, this.audio.duration);
            }
        });
        this.audio.addEventListener('ended', () => this.next());
        this.audio.addEventListener('error', () => this.next());
        this.audio.addEventListener('play', () => {
            this.isPlaying = true;
            if (this.ui) this.ui.setPlayPauseIcon(true);
            this.startVisualizer();
        });
        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            if (this.ui) this.ui.setPlayPauseIcon(false);
            this.stopVisualizer();
        });
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

        if (this.ui && this.ui.popup && this.ui.popup.isOpenForCurrent) {
            this.ui.popup.updateForTrack(track, pictureUrl, true);
        }

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
        }
    }

    pause() {
        this.audio.pause();
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
        await this.addRandomTracks(1);
    }

    async addRandomTracks(count) {
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
        const shuffled = this.shuffleArray([...availableTracks]);
        const selected = shuffled.slice(0, count).map(t => t.id);
        await this.addToQueue(selected);
    }

    setVolume(percent) {
        this.baseVolume = Math.min(100, Math.max(0, percent));
        if (this.currentTrack) {
            this.updateEffectiveVolume();
        } else {
            this.audio.volume = this.baseVolume / 100;
        }
        if (this.ui && this.ui.popup && this.ui.popup.isOpenForCurrent) {
            document.getElementById('popup-volume').value = percent;
        }
    }

    seek(percent) {
        if (this.audio.duration) {
            this.audio.currentTime = (percent / 100) * this.audio.duration;
        }
    }

    // ---- Новый метод для немедленного воспроизведения ----
    async playNow(trackId) {
        // Очищаем очередь и устанавливаем текущий трек
        this.queue = [trackId];
        this.currentIndex = 0;
        await this.db.setQueue(this.queue);
        if (this.ui) this.ui.renderQueue(this.queue);
        
        // Загружаем и начинаем воспроизведение
        await this.loadTrack(trackId);
        this.play();
    }

    // ---- Визуализатор ----
    initAudioContext() {
        if (this.audioCtx) return;
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 256;
            this.source = this.audioCtx.createMediaElementSource(this.audio);
            this.source.connect(this.analyser);
            this.analyser.connect(this.audioCtx.destination);
        } catch (e) {
            console.error('Web Audio API not supported', e);
        }
    }

    startVisualizer() {
        if (!this.analyser) {
            this.initAudioContext();
        }
        if (this.visualizerActive || !this.analyser) return;
        this.visualizerActive = true;
        this.updateVisualizer();
    }

    stopVisualizer() {
        this.visualizerActive = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.visualizerCallbacks.forEach(cb => cb(null));
    }

    updateVisualizer() {
        if (!this.visualizerActive) return;
        if (!this.analyser) return;

        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);

        this.visualizerCallbacks.forEach(cb => cb(dataArray));

        this.rafId = requestAnimationFrame(() => this.updateVisualizer());
    }

    registerVisualizerCallback(callback) {
        this.visualizerCallbacks.push(callback);
    }

    unregisterVisualizerCallback(callback) {
        const index = this.visualizerCallbacks.indexOf(callback);
        if (index !== -1) this.visualizerCallbacks.splice(index, 1);
    }
};