var Player = class Player {
    constructor(db, fileHandler) {
        if (!db) throw new Error('Database instance required');
        if (!fileHandler) throw new Error('FileHandler instance required');
        this.db = db;
        this.fileHandler = fileHandler;
        this.audio = new Audio();
        this.audio.crossOrigin = "anonymous";
        this.currentTrack = null;
        this.queue = [];
        this.currentIndex = -1;
        this.isPlaying = false;
        this.ui = null;
        this.baseVolume = 80;
        this.currentObjectUrl = null;

        this.audioCtx = null;
        this.analyser = null;
        this.source = null;
        this.visualizerCallbacks = [];
        this.visualizerActive = false;
        this.rafId = null;

        this.visualizerType = 'bars';
        this.visualizerSensitivity = 1.0;
        this.visualizerBarCount = 16;
        this.visualizerSmoothing = 0.5;
        this.visualizerEnabled = true;
        this.visualizerBarSymX = false;
        this.visualizerBarSymY = false;
        this.visualizerWaveSymX = false;

        this.initAudioEvents();
    }

    setUI(ui) {
        this.ui = ui;
    }

    initAudioEvents() {
        this.audio.addEventListener('timeupdate', () => {
            if (!this.audio.duration) return;
            if (this.ui) {
                this.ui.updateAllProgressBars(this.audio.currentTime, this.audio.duration);
            }
        });

        this.audio.addEventListener('ended', () => this.next(true));
        this.audio.addEventListener('error', (e) => {
            console.error('Audio error', e);
            this.next(true);
        });

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
        try {
            const queueIds = await this.db.getQueue() || [];
            this.queue = [];
            for (let id of queueIds) {
                const track = await this.db.getTrack(id);
                if (track) this.queue.push(track);
            }
            if (this.ui) this.ui.renderQueue(this.queue);
            if (this.queue.length > 0 && this.currentIndex === -1) {
                this.currentIndex = 0;
                await this.loadTrack(this.queue[0]);
            }
        } catch (err) {
            console.error('Failed to load queue', err);
        }
    }

    async loadTrack(track) {
        if (!track) return false;

        if (track.streamUrl) {
            if (this.currentObjectUrl) {
                URL.revokeObjectURL(this.currentObjectUrl);
                this.currentObjectUrl = null;
            }
            this.currentTrack = track;
            this.audio.src = track.streamUrl;
            return new Promise((resolve) => {
                let resolved = false;
                let timeoutId = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        cleanup();
                        console.error(`Timeout loading stream for ${track.name}`);
                        resolve(false);
                    }
                }, 30000);

                const onCanPlay = () => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeoutId);
                    cleanup();
                    this.updateEffectiveVolume().then(() => {
                        if (this.isPlaying) {
                            this.audio.play().catch(e => console.warn('Auto-play failed', e));
                        }
                        if (this.ui) this.ui.updateCurrentTrack(track, null);
                        resolve(true);
                    }).catch(() => resolve(false));
                };
                const onError = () => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeoutId);
                    cleanup();
                    console.error(`Failed to load stream for ${track.name}`);
                    const index = this.queue.findIndex(t => t.id === track.id && t.streamUrl === track.streamUrl);
                    if (index !== -1) {
                        this.removeFromQueue(index).then(() => resolve(false));
                    } else {
                        resolve(false);
                    }
                };
                const cleanup = () => {
                    this.audio.removeEventListener('canplaythrough', onCanPlay);
                    this.audio.removeEventListener('error', onError);
                };
                this.audio.addEventListener('canplaythrough', onCanPlay);
                this.audio.addEventListener('error', onError);
                this.audio.load();
            });
        }

        if (this.currentObjectUrl) {
            URL.revokeObjectURL(this.currentObjectUrl);
            this.currentObjectUrl = null;
        }

        const file = await this.fileHandler.getFileForTrack(track);
        if (!file) {
            console.warn(`File not accessible for track: ${track.name}`);
            const index = this.queue.findIndex(t => t.id === track.id);
            if (index !== -1) {
                await this.removeFromQueue(index);
            }
            return false;
        }

        this.currentTrack = track;
        const url = URL.createObjectURL(file);
        this.currentObjectUrl = url;
        this.audio.src = url;
        this.audio.load();

        await this.updateEffectiveVolume();

        if (this.isPlaying) {
            try {
                await this.audio.play();
            } catch (e) {
                console.warn('Auto-play failed', e);
            }
        }

        const pictureUrl = await this.fileHandler.getPictureBlobUrl(file);
        if (this.ui) this.ui.updateCurrentTrack(track, pictureUrl);

        return true;
    }

    async updateEffectiveVolume() {
        if (!this.currentTrack) return;
        try {
            let tags = [];
            if (this.currentTrack.id) {
                tags = await this.db.getTags(this.currentTrack.id) || [];
            }
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
        } catch (err) {
            console.error('Error updating volume', err);
        }
    }

    async play() {
        if (!this.currentTrack && this.queue.length > 0) {
            this.currentIndex = 0;
            await this.loadTrack(this.queue[0]);
        }
        if (this.currentTrack) {
            try {
                await this.audio.play();
            } catch (e) {
                console.warn('Play failed', e);
            }
        }
    }

    pause() {
        this.audio.pause();
    }

    togglePlay() {
        this.isPlaying ? this.pause() : this.play();
    }

    async next(autoplay = false) {
        if (this.queue.length === 0) return;

        let attempts = 0;
        const maxAttempts = this.queue.length;

        while (attempts < maxAttempts) {
            const nextIndex = (this.currentIndex + 1) % this.queue.length;
            const nextTrack = this.queue[nextIndex];
            const success = await this.loadTrack(nextTrack);
            if (success) {
                this.currentIndex = nextIndex;
                if (autoplay) {
                    try {
                        await this.audio.play();
                    } catch (e) {}
                }
                return;
            } else {
                await this.removeFromQueue(nextIndex);
                attempts++;
            }
        }

        console.error('Все треки в очереди недоступны');
        this.pause();
        if (this.ui) {
            this.ui.updateCurrentTrack(null);
        }
    }

    async prev(autoplay = false) {
        if (this.queue.length === 0) return;

        let attempts = 0;
        const maxAttempts = this.queue.length;

        while (attempts < maxAttempts) {
            const prevIndex = (this.currentIndex - 1 + this.queue.length) % this.queue.length;
            const prevTrack = this.queue[prevIndex];
            const success = await this.loadTrack(prevTrack);
            if (success) {
                this.currentIndex = prevIndex;
                if (autoplay) {
                    try {
                        await this.audio.play();
                    } catch (e) {}
                }
                return;
            } else {
                await this.removeFromQueue(prevIndex);
                attempts++;
            }
        }

        console.error('Все треки в очереди недоступны');
        this.pause();
        if (this.ui) {
            this.ui.updateCurrentTrack(null);
        }
    }

    async addToQueue(tracks) {
        const trackObjects = [];
        for (let item of tracks) {
            if (typeof item === 'string') {
                const track = await this.db.getTrack(item);
                if (track) trackObjects.push(track);
            } else {
                trackObjects.push(item);
            }
        }
        this.queue.push(...trackObjects);
        await this.saveQueue();
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
        await this.saveQueue();
        if (this.ui) this.ui.renderQueue(this.queue);
    }

    async clearQueue() {
        this.queue = [];
        this.currentIndex = -1;
        this.currentTrack = null;
        this.audio.pause();
        this.isPlaying = false;
        await this.saveQueue();
        if (this.ui) {
            this.ui.renderQueue([]);
            this.ui.updateCurrentTrack(null);
            this.ui.setPlayPauseIcon(false);
        }
    }

    async shuffleQueue() {
        this.queue = this.shuffleArray(this.queue);
        await this.saveQueue();
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

    async addRandomTracks(count, allowDuplicates = true) {
        const allTracks = await this.db.getAllTracks();
        const availableTracks = [];
        for (let track of allTracks) {
            const tags = await this.db.getTags(track.id);
            if (!tags.includes('excluded')) {
                availableTracks.push(track);
            }
        }
        if (availableTracks.length === 0) {
            alert('Нет доступных треков (все исключены)');
            return;
        }

        const selected = [];
        if (allowDuplicates) {
            for (let i = 0; i < count; i++) {
                const randomIndex = Math.floor(Math.random() * availableTracks.length);
                selected.push(availableTracks[randomIndex]);
            }
        } else {
            if (count > availableTracks.length) {
                count = availableTracks.length;
            }
            const shuffled = this.shuffleArray([...availableTracks]);
            for (let i = 0; i < count; i++) {
                selected.push(shuffled[i]);
            }
        }

        await this.addToQueue(selected);
    }

    setVolume(percent) {
        this.baseVolume = Math.min(100, Math.max(0, percent));
        if (this.currentTrack) {
            this.updateEffectiveVolume();
        } else {
            this.audio.volume = this.baseVolume / 100;
        }
        if (this.ui) {
            this.ui.syncVolumeSliders(percent);
        }
    }

    seek(percent) {
        if (this.audio.duration) {
            this.audio.currentTime = (percent / 100) * this.audio.duration;
        }
    }

    async playNow(track) {
        if (typeof track === 'string') {
            track = await this.db.getTrack(track);
            if (!track) return;
        }

        let currentIndex = this.currentIndex;
        if (currentIndex >= 0 && currentIndex < this.queue.length) {
            this.queue[currentIndex] = track;
        } else {
            this.queue.unshift(track);
            currentIndex = 0;
        }

        this.currentIndex = currentIndex;
        
        if (track.id) {
            await this.saveQueue();
        }

        const success = await this.loadTrack(track);
        if (success) {
            this.play();
        } else {
            alert('Не удалось воспроизвести трек. Возможно, файл недоступен.');
            this.queue.splice(currentIndex, 1);
            if (this.queue.length === 0) {
                this.currentTrack = null;
                if (this.ui) this.ui.updateCurrentTrack(null);
            } else {
                await this.loadTrack(this.queue[this.currentIndex]);
            }
        }
    }

    async saveQueue() {
        const queueIds = this.queue.filter(t => t.id).map(t => t.id);
        await this.db.setQueue(queueIds);
    }

    addStreamTracks(tracks) {
        this.queue.push(...tracks);
        if (this.ui) this.ui.renderQueue(this.queue);
    }

    initAudioContext() {
        if (this.audioCtx) return;
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = this.visualizerSmoothing;
            this.source = this.audioCtx.createMediaElementSource(this.audio);
            this.source.connect(this.analyser);
            this.analyser.connect(this.audioCtx.destination);
        } catch (e) {
            console.error('Web Audio API not supported', e);
        }
    }

    startVisualizer() {
        if (!this.visualizerEnabled) return;
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
        if (!this.visualizerActive || !this.analyser) return;

        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);

        this.visualizerCallbacks.forEach(cb => cb(dataArray));

        this.rafId = requestAnimationFrame(() => this.updateVisualizer());
    }

    registerVisualizerCallback(callback) {
        if (typeof callback === 'function') {
            this.visualizerCallbacks.push(callback);
        }
    }

    unregisterVisualizerCallback(callback) {
        const index = this.visualizerCallbacks.indexOf(callback);
        if (index !== -1) this.visualizerCallbacks.splice(index, 1);
    }

    async loadVisualizerSettings() {
        this.visualizerEnabled = await this.db.getSetting('visualizer_enabled') !== false;
        this.visualizerType = await this.db.getSetting('visualizer_type') || 'bars';
        this.visualizerSensitivity = parseFloat(await this.db.getSetting('visualizer_sensitivity') || '1.0');
        this.visualizerBarCount = parseInt(await this.db.getSetting('visualizer_bar_count') || '16');
        this.visualizerSmoothing = parseFloat(await this.db.getSetting('visualizer_smoothing') || '0.5');
        this.visualizerBarSymX = await this.db.getSetting('visualizer_bar_sym_x') === true;
        this.visualizerBarSymY = await this.db.getSetting('visualizer_bar_sym_y') === true;
        this.visualizerWaveSymX = await this.db.getSetting('visualizer_wave_sym_x') === true;
        if (this.analyser) {
            this.analyser.smoothingTimeConstant = this.visualizerSmoothing;
        }
    }

    async saveVisualizerSettings() {
        await this.db.setSetting('visualizer_enabled', this.visualizerEnabled);
        await this.db.setSetting('visualizer_type', this.visualizerType);
        await this.db.setSetting('visualizer_sensitivity', this.visualizerSensitivity);
        await this.db.setSetting('visualizer_bar_count', this.visualizerBarCount);
        await this.db.setSetting('visualizer_smoothing', this.visualizerSmoothing);
        await this.db.setSetting('visualizer_bar_sym_x', this.visualizerBarSymX);
        await this.db.setSetting('visualizer_bar_sym_y', this.visualizerBarSymY);
        await this.db.setSetting('visualizer_wave_sym_x', this.visualizerWaveSymX);
    }
};