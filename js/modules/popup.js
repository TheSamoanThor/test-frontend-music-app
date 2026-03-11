var PopupManager = class PopupManager {
    constructor(ui, player, fileHandler, db) {
        this.ui = ui;
        this.player = player;
        this.fileHandler = fileHandler;
        this.db = db;
        this.isOpen = false;
        this.isOpenForCurrent = false;
        this.currentTrackId = null;
        this.pictureUrl = null;
        this.visualizerCallback = null;

        this.initDOM();
        this.initEvents();
    }

    initDOM() {
        this.popup = document.getElementById('track-popup');
        this.coverImg = document.getElementById('popup-cover-img');
        this.visualizerCanvas = document.getElementById('popup-visualizer');
        this.noCoverDiv = this.popup.querySelector('.popup-no-cover');
        this.titleEl = document.getElementById('popup-track-title');
        this.artistEl = document.getElementById('popup-track-artist');
        this.tagsEl = document.getElementById('popup-tags');
        this.progressInput = document.getElementById('popup-progress');
        this.timeSpan = document.getElementById('popup-time');
        this.volumeInput = document.getElementById('popup-volume');
        this.playPauseBtn = document.getElementById('popup-play-pause');
        this.addToQueueBtn = document.getElementById('popup-add-to-queue');
        this.addToPlaylistBtn = document.getElementById('popup-add-to-playlist');
        this.closeBtn = this.popup.querySelector('.close-popup');
        
        // Новые элементы
        this.durationSpan = document.getElementById('popup-duration');
        this.pathSpan = document.getElementById('popup-path');
        this.newTagInput = document.getElementById('popup-new-tag');
        this.addTagBtn = document.getElementById('popup-add-tag');
        this.toggleExcludeBtn = document.getElementById('popup-toggle-exclude');
        this.playbackControls = document.getElementById('popup-playback-controls');
    }

    initEvents() {
        this.closeBtn.addEventListener('click', () => this.hide());
        this.popup.addEventListener('click', (e) => {
            if (e.target === this.popup) this.hide();
        });

        this.progressInput.addEventListener('input', (e) => {
            if (this.isOpenForCurrent && this.player.currentTrack) {
                this.player.seek(e.target.value);
            }
        });

        this.volumeInput.addEventListener('input', (e) => {
            if (this.isOpenForCurrent) {
                this.player.setVolume(e.target.value);
            }
        });

        this.playPauseBtn.addEventListener('click', () => {
            if (this.isOpenForCurrent) {
                this.player.togglePlay();
            } else if (this.currentTrackId) {
                // Если трек не текущий, при нажатии play добавляем в очередь и начинаем воспроизведение
                this.player.addToQueue([this.currentTrackId]).then(() => {
                    if (this.player.queue.length === 1) {
                        this.player.currentIndex = 0;
                        this.player.loadTrack(this.currentTrackId).then(() => this.player.play());
                    }
                });
            }
        });

        this.addToQueueBtn.addEventListener('click', () => {
            if (this.currentTrackId) {
                this.player.addToQueue([this.currentTrackId]);
            }
        });

        this.addToPlaylistBtn.addEventListener('click', async () => {
            if (!this.currentTrackId) return;
            const playlists = await this.db.getAllPlaylists();
            if (playlists.length === 0) {
                alert('Сначала создайте плейлист');
                return;
            }
            const listStr = playlists.map((p, i) => `${i+1}: ${p.name}`).join('\n');
            const choice = prompt(`Выберите плейлист (введите номер):\n${listStr}`);
            if (choice) {
                const index = parseInt(choice) - 1;
                if (index >= 0 && index < playlists.length) {
                    const playlist = playlists[index];
                    if (!playlist.tracks.includes(this.currentTrackId)) {
                        playlist.tracks.push(this.currentTrackId);
                        await this.db.updatePlaylist(playlist);
                        alert('Трек добавлен в плейлист');
                    } else {
                        alert('Трек уже есть в плейлисте');
                    }
                }
            }
        });

        // Новые обработчики
        this.addTagBtn.addEventListener('click', async () => {
            if (!this.currentTrackId) return;
            const newTag = this.newTagInput.value.trim();
            if (newTag) {
                const tags = await this.db.getTags(this.currentTrackId);
                if (!tags.includes(newTag)) {
                    tags.push(newTag);
                    await this.db.setTags(this.currentTrackId, tags);
                    // Обновить отображение тегов
                    this.tagsEl.innerHTML = tags.map(t => `<span class="tag-badge">${t}</span>`).join(' ');
                    this.newTagInput.value = '';
                    // Если это текущий трек, обновить громкость
                    if (this.isOpenForCurrent && this.player.currentTrack && this.player.currentTrack.id === this.currentTrackId) {
                        await this.player.updateEffectiveVolume();
                    }
                }
            }
        });

        this.toggleExcludeBtn.addEventListener('click', async () => {
            if (!this.currentTrackId) return;
            const tags = await this.db.getTags(this.currentTrackId);
            const excludedTag = '🚫 excluded';
            if (tags.includes(excludedTag)) {
                const newTags = tags.filter(t => t !== excludedTag);
                await this.db.setTags(this.currentTrackId, newTags);
                this.toggleExcludeBtn.textContent = '🚫 Исключить';
            } else {
                tags.push(excludedTag);
                await this.db.setTags(this.currentTrackId, tags);
                this.toggleExcludeBtn.textContent = '✅ Вернуть в случайный выбор';
            }
            // Обновить теги в попапе
            const updatedTags = await this.db.getTags(this.currentTrackId);
            this.tagsEl.innerHTML = updatedTags.map(t => `<span class="tag-badge">${t}</span>`).join(' ');
            if (this.isOpenForCurrent && this.player.currentTrack && this.player.currentTrack.id === this.currentTrackId) {
                await this.player.updateEffectiveVolume();
            }
        });
    }

    async showForTrack(trackId, isCurrent = false) {
        const track = await this.db.getTrack(trackId);
        if (!track) return;

        this.currentTrackId = trackId;
        this.isOpenForCurrent = isCurrent;
        this.isOpen = true;

        // Загружаем обложку
        const file = await this.fileHandler.getFileForTrack(track);
        let pictureUrl = null;
        if (file) {
            pictureUrl = await this.fileHandler.getPictureBlobUrl(file);
        }

        this.updateForTrack(track, pictureUrl, isCurrent);

        // Управление видимостью элементов воспроизведения
        if (isCurrent) {
            this.playbackControls.classList.remove('hidden');
            this.progressInput.disabled = false;
            this.volumeInput.disabled = false;
            this.playPauseBtn.disabled = false;
            this.volumeInput.value = this.player.baseVolume;
            this.updatePlayPauseIcon(this.player.isPlaying);
            // Регистрируем визуализатор, если нет обложки
            if (!pictureUrl) {
                this.startVisualizer();
            }
        } else {
            this.playbackControls.classList.add('hidden');
            this.progressInput.disabled = true;
            this.volumeInput.disabled = true;
            this.playPauseBtn.disabled = false;
            this.playPauseBtn.textContent = '▶️ Воспроизвести';
            if (this.visualizerCallback) {
                this.player.unregisterVisualizerCallback(this.visualizerCallback);
                this.visualizerCallback = null;
            }
            this.visualizerCanvas.style.display = 'none';
            this.coverImg.style.display = pictureUrl ? 'block' : 'none';
            this.noCoverDiv.style.display = pictureUrl ? 'none' : 'flex';
        }

        this.popup.classList.remove('hidden');
    }

    async showForCurrentTrack() {
        if (!this.player.currentTrack) return;
        await this.showForTrack(this.player.currentTrack.id, true);
    }

    updateForTrack(track, pictureUrl, isCurrent) {
        this.titleEl.textContent = track.name;
        this.artistEl.textContent = '';
        this.durationSpan.textContent = utils.formatTime(track.duration);
        this.pathSpan.textContent = track.path || 'неизвестно';

        this.db.getTags(track.id).then(tags => {
            this.tagsEl.innerHTML = tags.map(t => `<span class="tag-badge">${t}</span>`).join(' ');
            const isExcluded = tags.includes('🚫 excluded');
            this.toggleExcludeBtn.textContent = isExcluded ? '✅ Вернуть в случайный выбор' : '🚫 Исключить';
        });

        if (pictureUrl) {
            this.coverImg.src = pictureUrl;
            this.coverImg.style.display = 'block';
            this.visualizerCanvas.style.display = 'none';
            this.noCoverDiv.style.display = 'none';
            if (this.pictureUrl) URL.revokeObjectURL(this.pictureUrl);
            this.pictureUrl = pictureUrl;
        } else {
            this.coverImg.style.display = 'none';
            this.visualizerCanvas.style.display = 'block';
            this.noCoverDiv.style.display = 'none';
            if (isCurrent && this.player.isPlaying) {
                this.startVisualizer();
            }
        }

        if (isCurrent) {
            this.updateProgress(this.player.audio.currentTime, this.player.audio.duration);
        } else {
            this.progressInput.value = 0;
            this.timeSpan.textContent = '0:00 / ' + utils.formatTime(track.duration);
        }
    }

    updateProgress(current, duration) {
        if (!duration) return;
        const percent = (current / duration) * 100;
        this.progressInput.value = percent;
        this.timeSpan.textContent = `${utils.formatTime(current)} / ${utils.formatTime(duration)}`;
    }

    updatePlayPauseIcon(playing) {
        this.playPauseBtn.textContent = playing ? '⏸️' : '▶️';
    }

    startVisualizer() {
        if (this.visualizerCallback) return;
        this.visualizerCallback = (dataArray) => {
            if (!dataArray) {
                const ctx = this.visualizerCanvas.getContext('2d');
                ctx.clearRect(0, 0, this.visualizerCanvas.width, this.visualizerCanvas.height);
                return;
            }
            this.drawVisualizer(dataArray);
        };
        this.player.registerVisualizerCallback(this.visualizerCallback);
    }

    // Улучшенный визуализатор с частотным спектром
    drawVisualizer(dataArray) {
        const canvas = this.visualizerCanvas;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        if (!dataArray) return;

        const barCount = 30; // количество столбцов
        const barWidth = width / barCount;
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#4a90e2';

        for (let i = 0; i < barCount; i++) {
            // Пропорциональный индекс в массиве данных
            const dataIndex = Math.floor(i * dataArray.length / barCount);
            const value = dataArray[dataIndex] / 255; // нормализация от 0 до 1
            const barHeight = value * height * 0.8; // оставляем отступ сверху
            const x = i * barWidth;
            const y = height - barHeight;

            ctx.fillStyle = primaryColor;
            // Немного прозрачности для красоты
            ctx.globalAlpha = 0.7 + 0.3 * value;
            ctx.fillRect(x, y, barWidth - 1, barHeight);
        }
        ctx.globalAlpha = 1.0; // сброс
    }

    hide() {
        this.popup.classList.add('hidden');
        this.isOpen = false;
        if (this.visualizerCallback) {
            this.player.unregisterVisualizerCallback(this.visualizerCallback);
            this.visualizerCallback = null;
        }
        if (this.pictureUrl) {
            URL.revokeObjectURL(this.pictureUrl);
            this.pictureUrl = null;
        }
        // Очистить поле ввода тега
        if (this.newTagInput) this.newTagInput.value = '';
    }
};