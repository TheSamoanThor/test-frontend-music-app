var UI = class UI {
    constructor(db, player, fileHandler, themeManager) {
        this.db = db;
        this.player = player;
        this.fileHandler = fileHandler;
        this.themeManager = themeManager;
        this.currentFilterTags = [];
        this.searchTerm = '';
        this.currentPictureUrl = null;
        this.detailPictureUrl = null;
        this.playerVisualizerCallback = null;
        this.trackProgressHandler = null;
        this.trackDetailVisualizerCallback = null;
        this.playlistOpenState = {};

        this.fileHandler.onAccessLost = this.handleFileAccessLost.bind(this);

        this.initEventListeners();

        // Настройка видимости опций навигации в зависимости от ширины
        this.initNavPositionOptions();
        window.addEventListener('resize', utils.debounce(() => this.adjustNavPositionOptions(), 200));

        this.initLibraryClickBehavior();

        window.addEventListener('resize', utils.debounce(() => {
            this.applyMarqueeIfNeeded();
        }, 200));
    }

    initEventListeners() {
        document.getElementById('select-music-btn').addEventListener('click', async () => {
            const tracks = await this.fileHandler.pickDirectory();
            if (tracks.length) this.renderLibrary();
        });

        document.getElementById('export-btn').addEventListener('click', () => this.exportData());
        document.getElementById('import-btn').addEventListener('click', () => this.importData());

        document.getElementById('theme-select').addEventListener('change', (e) => {
            this.themeManager.applyPreset(e.target.value);
            this.themeManager.saveToDB(this.db);
            const settingsSelect = document.getElementById('theme-select-settings');
            if (settingsSelect) settingsSelect.value = e.target.value;
            this.renderThemeFineTuning();
        });

        const tagFilterInput = document.getElementById('tag-filter');
        if (tagFilterInput) {
            tagFilterInput.addEventListener('input', utils.debounce((e) => {
                this.currentFilterTags = utils.parseTags(e.target.value);
                this.renderLibrary();
            }, 300));
        }

        const searchInput = document.getElementById('search-name');
        if (searchInput) {
            searchInput.addEventListener('input', utils.debounce((e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.renderLibrary();
            }, 300));
        }

        // Кнопки управления плеером
        document.getElementById('play-pause').addEventListener('click', (e) => {
            e.stopPropagation();
            this.player.togglePlay();
        });

        document.getElementById('prev').addEventListener('click', (e) => {
            e.stopPropagation();
            this.player.prev();
        });

        document.getElementById('next').addEventListener('click', (e) => {
            e.stopPropagation();
            this.player.next();
        });

        document.getElementById('skip-back-10').addEventListener('click', (e) => {
            e.stopPropagation();
            this.player.skip(-10);
        });

        document.getElementById('skip-forward-10').addEventListener('click', (e) => {
            e.stopPropagation();
            this.player.skip(10);
        });

        document.getElementById('repeat-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.player.toggleRepeat();
        });
        document.getElementById('volume').addEventListener('input', (e) => this.player.setVolume(e.target.value));
        document.getElementById('progress').addEventListener('input', (e) => this.player.seek(e.target.value));

        document.getElementById('shuffle-queue').addEventListener('click', () => this.player.shuffleQueue());
        document.getElementById('clear-queue').addEventListener('click', () => this.player.clearQueue());
        document.getElementById('add-random').addEventListener('click', () => this.player.addRandomFromLibrary());
        document.getElementById('add-random-10').addEventListener('click', () => this.player.addRandomTracks(10));
        document.getElementById('save-queue-as-playlist')?.addEventListener('click', () => this.saveQueueAsPlaylist());

        document.addEventListener('click', async (e) => {
            if (e.target.classList.contains('remove-tag-btn') || e.target.closest('.remove-tag-btn')) {
                const btn = e.target.closest('.remove-tag-btn');
                e.stopPropagation();
                const trackId = btn.dataset.trackId;
                const tagToRemove = btn.dataset.tag;
                const tags = await this.db.getTags(trackId);
                const newTags = tags.filter(t => t !== tagToRemove);
                await this.db.setTags(trackId, newTags);
                this.renderLibrary();
                if (window.location.hash.includes(`track/${trackId}`)) {
                    this.loadTrackDetail(trackId);
                }
                if (this.player.currentTrack && this.player.currentTrack.id === trackId) {
                    await this.player.updateEffectiveVolume();
                }
            }
        });

        // Делегированный обработчик Enter для поля ввода тега в библиотеке
        const trackList = document.getElementById('track-list');
        if (trackList) {
            trackList.addEventListener('keypress', async (e) => {
                if (e.target.classList.contains('tag-input') && e.key === 'Enter') {
                    e.stopPropagation();
                    const input = e.target;
                    const id = input.dataset.id;
                    const newTag = input.value.trim();
                    if (newTag) {
                        const currentTags = await this.db.getTags(id);
                        if (!currentTags.includes(newTag)) {
                            currentTags.push(newTag);
                            await this.db.setTags(id, currentTags);
                            this.renderLibrary();
                            if (this.player.currentTrack && this.player.currentTrack.id === id) {
                                await this.player.updateEffectiveVolume();
                            }
                        } else {
                            Modal.alert('Такой тег уже есть у трека', 'Внимание');
                        }
                        input.value = '';
                    }
                }
            });
        }

        const queueList = document.getElementById('queue-list');
        if (queueList) {
            queueList.addEventListener('dragover', (e) => e.preventDefault());
            let dropPending = false;
            queueList.addEventListener('drop', async (e) => {
                e.preventDefault();
                if (dropPending) return;
                dropPending = true;
                const trackId = e.dataTransfer.getData('text/plain');
                if (trackId) {
                    if (!this.player.queue.includes(trackId)) {
                        await this.player.addToQueue([trackId]);
                    } else {
                        console.log('Трек уже в очереди, дубликат не добавлен');
                    }
                }
                setTimeout(() => { dropPending = false; }, 300);
            });
        }

        document.getElementById('player-bar').addEventListener('click', (e) => {
            if (e.target.closest('button') || e.target.closest('input')) return;
            if (this.player.currentTrack) {
                if (this.player.currentTrack.id) {
                    Router.navigate('track', this.player.currentTrack.id);
                } else if (this.player.currentTrack.archiveId) {
                    Router.navigate('track', `archive:${this.player.currentTrack.archiveId}`);
                }
            }
        });

        document.getElementById('create-playlist')?.addEventListener('click', () => {
            this.createPlaylistDialog();
        });

        const trackPlayPause = document.getElementById('track-play-pause');
        if (trackPlayPause) {
            trackPlayPause.addEventListener('click', () => this.player.togglePlay());
        }
        const trackPrev = document.getElementById('track-prev');
        if (trackPrev) {
            trackPrev.addEventListener('click', () => this.player.prev());
        }
        const trackNext = document.getElementById('track-next');
        if (trackNext) {
            trackNext.addEventListener('click', () => this.player.next());
        }
        const trackProgress = document.getElementById('track-progress');
        if (trackProgress) {
            trackProgress.addEventListener('input', (e) => this.player.seek(e.target.value));
        }
        const trackVolume = document.getElementById('track-volume');
        if (trackVolume) {
            trackVolume.addEventListener('input', (e) => this.player.setVolume(e.target.value));
        }

        document.getElementById('switch-to-file-picker')?.addEventListener('click', () => this.switchToFilePickerMode());
        document.getElementById('switch-to-folder-picker')?.addEventListener('click', () => this.switchToFolderPickerMode());
    }

    async initLibraryClickBehavior() {
        const checkbox = document.getElementById('details-library-click-enabled');
        if (!checkbox) return;

        const savedValue = await this.db.getSetting('library_click_behavior');
        const isDetailMode = savedValue !== undefined ? savedValue : false;
        checkbox.checked = isDetailMode;

        if (this._checkboxChangeHandler) {
            checkbox.removeEventListener('change', this._checkboxChangeHandler);
        }
        this._checkboxChangeHandler = async (e) => {
            await this.db.setSetting('library_click_behavior', e.target.checked);
        };
        checkbox.addEventListener('change', this._checkboxChangeHandler);

        if (this.libraryClickHandler) {
            document.removeEventListener('click', this.libraryClickHandler);
        }

        this.libraryClickHandler = async (e) => {
            const trackItem = e.target.closest('.track-item');
            if (!trackItem) return;
            if (e.target.closest('button') || e.target.closest('input') || 
                e.target.closest('select') || e.target.closest('textarea')) {
                return;
            }
            const trackId = trackItem.querySelector('.add-tag-btn')?.dataset.id;
            if (!trackId) return;

            const cb = document.getElementById('details-library-click-enabled');
            const isDetail = cb ? cb.checked : true;

            if (isDetail) {
                Router.navigate('track', trackId);
            } else {
                const track = await this.db.getTrack(trackId);
                if (track) {
                    await this.player.playNow(track);
                } else {
                    this.showToast('Трек не найден в библиотеке', 'error');
                }
            }
        };
        document.addEventListener('click', this.libraryClickHandler);
    }

    async handleFileAccessLost(track) {
        if (track === null) {
            const ok = await Modal.confirm(
                'Не удалось получить доступ к папке. Хотите переключиться на выбор отдельных файлов? (Текущая библиотека будет очищена)',
                'Доступ к папке потерян'
            );
            if (ok) {
                await this.switchToFilePickerMode();
            }
        } else {
            const ok = await Modal.confirm(
                `Доступ к файлу "${track.name}" потерян. Хотите переключиться на выбор отдельных файлов? (Текущая библиотека будет очищена)`,
                'Доступ к файлу потерян'
            );
            if (ok) {
                await this.switchToFilePickerMode();
            }
        }
    }

    async switchToFilePickerMode() {
        const ok = await Modal.confirm(
            'Переключение в режим выбора файлов очистит всю текущую библиотеку и настройки треков. Продолжить?',
            'Подтверждение'
        );
        if (!ok) return;

        await this.db.clearAllData();
        await this.player.clearQueue();
        this.fileHandler.setFallbackMode(true);
        await this.fileHandler.pickFiles();
        await this.renderLibrary();
        Router.handleRoute();
    }

    async switchToFolderPickerMode() {
        if (!this.fileHandler.isFileSystemAccessSupported) {
            Modal.alert('Ваш браузер не поддерживает выбор папки.', 'Ошибка');
            return;
        }
        const ok = await Modal.confirm(
            'Переключение в режим выбора папки очистит всю текущую библиотеку и настройки треков. Продолжить?',
            'Подтверждение'
        );
        if (!ok) return;

        await this.db.clearAllData();
        await this.player.clearQueue();
        this.fileHandler.setFallbackMode(false);
        await this.fileHandler.pickDirectory();
        await this.renderLibrary();
        Router.handleRoute();
    }

    registerPlayerVisualizer() {
        if (this.player) {
            this.playerVisualizerCallback = (dataArray) => {
                this.drawPlayerVisualizer(dataArray);
            };
            this.player.registerVisualizerCallback(this.playerVisualizerCallback);
        }
    }

    drawPlayerVisualizer(dataArray) {
        const canvas = document.getElementById('player-visualizer');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        if (!dataArray) return;

        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#212529';
        const player = this.player;
        const type = player.visualizerType;
        const sensitivity = player.visualizerSensitivity;
        const barCount = player.visualizerBarCount;
        const barSymX = player.visualizerBarSymX;
        const barSymY = player.visualizerBarSymY;
        const waveSymX = player.visualizerWaveSymX;

        const amplifiedData = dataArray.map(val => Math.min(255, val * sensitivity));

        if (type === 'bars') {
            const actualBars = Math.min(barCount, amplifiedData.length);
            let heights = [];
            for (let i = 0; i < actualBars; i++) {
                const start = Math.floor(i * amplifiedData.length / actualBars);
                const end = Math.floor((i + 1) * amplifiedData.length / actualBars);
                let sum = 0;
                for (let j = start; j < end; j++) sum += amplifiedData[j];
                heights.push(sum / (end - start) / 255);
            }

            if (barSymX) {
                const half = Math.floor(actualBars / 2);
                const left = heights.slice(0, half);
                const right = [...left].reverse();
                heights = [...right, ...left];
                if (actualBars % 2 === 1) {
                    heights.splice(half, 1, heights[half]);
                }
            }

            const barWidth = width / heights.length;
            const centerY = height / 2;

            for (let i = 0; i < heights.length; i++) {
                const avg = heights[i];
                const barHeight = avg * height;
                const x = i * barWidth;

                if (barSymY) {
                    const halfHeight = barHeight / 2;
                    const y = centerY - halfHeight;
                    ctx.fillStyle = textColor;
                    ctx.globalAlpha = 0.7 + 0.3 * avg;
                    ctx.fillRect(x, y, barWidth - 1, barHeight);
                } else {
                    ctx.fillStyle = textColor;
                    ctx.globalAlpha = 0.7 + 0.3 * avg;
                    ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
                }
            }
        } else if (type === 'waveform') {
            ctx.strokeStyle = textColor;
            ctx.lineWidth = 2;
            ctx.beginPath();

            const step = amplifiedData.length / width;
            const getY = (x) => {
                const index = Math.floor(x * step);
                const value = amplifiedData[index] / 255;
                return height - value * height;
            };

            if (waveSymX) {
                let rightPoints = [];
                for (let x = width / 2; x <= width; x++) {
                    const y = getY(x);
                    rightPoints.push({ x, y });
                }
                let allPoints = [];
                for (let i = rightPoints.length - 1; i >= 0; i--) {
                    const mirrorX = width - rightPoints[i].x;
                    allPoints.push({ x: mirrorX, y: rightPoints[i].y });
                }
                for (let i = 1; i < rightPoints.length; i++) {
                    allPoints.push(rightPoints[i]);
                }
                for (let i = 0; i < allPoints.length; i++) {
                    if (i === 0) ctx.moveTo(allPoints[i].x, allPoints[i].y);
                    else ctx.lineTo(allPoints[i].x, allPoints[i].y);
                }
            } else {
                for (let x = 0; x < width; x++) {
                    const y = getY(x);
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        } else if (type === 'circle') {
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.min(width, height) * 0.4;
            ctx.strokeStyle = textColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            const points = amplifiedData.length;
            for (let i = 0; i < points; i++) {
                const angle = (i / points) * Math.PI * 2;
                const value = amplifiedData[i] / 255;
                const r = radius + value * radius * 0.5;
                const x = centerX + Math.cos(angle) * r;
                const y = centerY + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
        } else if (type === 'fire') {
            const actualBars = Math.min(barCount, amplifiedData.length);
            const barWidth = width / actualBars;
            for (let i = 0; i < actualBars; i++) {
                const start = Math.floor(i * amplifiedData.length / actualBars);
                const end = Math.floor((i + 1) * amplifiedData.length / actualBars);
                let sum = 0;
                for (let j = start; j < end; j++) sum += amplifiedData[j];
                const avg = sum / (end - start) / 255;
                const barHeight = avg * height;
                const x = i * barWidth;
                const y = height - barHeight;

                const gradient = ctx.createLinearGradient(x, y, x + barWidth, height);
                gradient.addColorStop(0, 'yellow');
                gradient.addColorStop(1, 'red');
                ctx.fillStyle = gradient;
                ctx.globalAlpha = 0.8;
                ctx.fillRect(x, y, barWidth - 1, barHeight);
            }
        }

        ctx.globalAlpha = 1.0;
    }

    registerTrackDetailVisualizer() {
        if (this.trackDetailVisualizerCallback) return;
        this.trackDetailVisualizerCallback = (dataArray) => {
            this.drawTrackDetailVisualizer(dataArray);
        };
        this.player.registerVisualizerCallback(this.trackDetailVisualizerCallback);
    }

    unregisterTrackDetailVisualizer() {
        if (this.trackDetailVisualizerCallback) {
            this.player.unregisterVisualizerCallback(this.trackDetailVisualizerCallback);
            this.trackDetailVisualizerCallback = null;
        }
    }

    drawTrackDetailVisualizer(dataArray) {
        const canvas = document.getElementById('track-detail-visualizer');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        if (!dataArray) return;

        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim() || '#212529';
        const player = this.player;
        const type = player.visualizerType;
        const sensitivity = player.visualizerSensitivity;
        const barCount = player.visualizerBarCount;
        const barSymX = player.visualizerBarSymX;
        const barSymY = player.visualizerBarSymY;
        const waveSymX = player.visualizerWaveSymX;

        const amplifiedData = dataArray.map(val => Math.min(255, val * sensitivity));

        if (type === 'bars') {
            const actualBars = Math.min(barCount, amplifiedData.length);
            let heights = [];
            for (let i = 0; i < actualBars; i++) {
                const start = Math.floor(i * amplifiedData.length / actualBars);
                const end = Math.floor((i + 1) * amplifiedData.length / actualBars);
                let sum = 0;
                for (let j = start; j < end; j++) sum += amplifiedData[j];
                heights.push(sum / (end - start) / 255);
            }

            if (barSymX) {
                const half = Math.floor(actualBars / 2);
                const left = heights.slice(0, half);
                const right = [...left].reverse();
                heights = [...right, ...left];
                if (actualBars % 2 === 1) {
                    heights.splice(half, 1, heights[half]);
                }
            }

            const barWidth = width / heights.length;
            const centerY = height / 2;

            for (let i = 0; i < heights.length; i++) {
                const avg = heights[i];
                const barHeight = avg * height;
                const x = i * barWidth;

                if (barSymY) {
                    const halfHeight = barHeight / 2;
                    const y = centerY - halfHeight;
                    ctx.fillStyle = textColor;
                    ctx.globalAlpha = 0.7 + 0.3 * avg;
                    ctx.fillRect(x, y, barWidth - 1, barHeight);
                } else {
                    ctx.fillStyle = textColor;
                    ctx.globalAlpha = 0.7 + 0.3 * avg;
                    ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
                }
            }
        } else if (type === 'waveform') {
            ctx.strokeStyle = textColor;
            ctx.lineWidth = 2;
            ctx.beginPath();

            const step = amplifiedData.length / width;
            const getY = (x) => {
                const index = Math.floor(x * step);
                const value = amplifiedData[index] / 255;
                return height - value * height;
            };

            if (waveSymX) {
                let rightPoints = [];
                for (let x = width / 2; x <= width; x++) {
                    const y = getY(x);
                    rightPoints.push({ x, y });
                }
                let allPoints = [];
                for (let i = rightPoints.length - 1; i >= 0; i--) {
                    const mirrorX = width - rightPoints[i].x;
                    allPoints.push({ x: mirrorX, y: rightPoints[i].y });
                }
                for (let i = 1; i < rightPoints.length; i++) {
                    allPoints.push(rightPoints[i]);
                }
                for (let i = 0; i < allPoints.length; i++) {
                    if (i === 0) ctx.moveTo(allPoints[i].x, allPoints[i].y);
                    else ctx.lineTo(allPoints[i].x, allPoints[i].y);
                }
            } else {
                for (let x = 0; x < width; x++) {
                    const y = getY(x);
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        } else if (type === 'circle') {
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.min(width, height) * 0.4;
            ctx.strokeStyle = textColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            const points = amplifiedData.length;
            for (let i = 0; i < points; i++) {
                const angle = (i / points) * Math.PI * 2;
                const value = amplifiedData[i] / 255;
                const r = radius + value * radius * 0.5;
                const x = centerX + Math.cos(angle) * r;
                const y = centerY + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
        } else if (type === 'fire') {
            const actualBars = Math.min(barCount, amplifiedData.length);
            const barWidth = width / actualBars;
            for (let i = 0; i < actualBars; i++) {
                const start = Math.floor(i * amplifiedData.length / actualBars);
                const end = Math.floor((i + 1) * amplifiedData.length / actualBars);
                let sum = 0;
                for (let j = start; j < end; j++) sum += amplifiedData[j];
                const avg = sum / (end - start) / 255;
                const barHeight = avg * height;
                const x = i * barWidth;
                const y = height - barHeight;

                const gradient = ctx.createLinearGradient(x, y, x + barWidth, height);
                gradient.addColorStop(0, 'yellow');
                gradient.addColorStop(1, 'red');
                ctx.fillStyle = gradient;
                ctx.globalAlpha = 0.8;
                ctx.fillRect(x, y, barWidth - 1, barHeight);
            }
        }

        ctx.globalAlpha = 1.0;
    }

    syncFilterInput() {
        const input = document.getElementById('tag-filter');
        if (input) {
            input.value = this.currentFilterTags.join(', ');
        }
    }

    async renderLibrary() {
        this.syncFilterInput();
        this.showSkeleton('track-list', 10);
        const allTracks = await this.db.getAllTracks();
        let filtered = allTracks;

        if (this.currentFilterTags.length > 0) {
            const trackTagPromises = allTracks.map(async track => ({
                track,
                tags: await this.db.getTags(track.id)
            }));
            const trackTags = await Promise.all(trackTagPromises);
            filtered = trackTags
                .filter(item => {
                    return this.currentFilterTags.every(filterTag => {
                        const lowerFilter = filterTag.toLowerCase();
                        return item.tags.some(tag => tag.toLowerCase().startsWith(lowerFilter));
                    });
                })
                .map(item => item.track);
        }

        if (this.searchTerm) {
            filtered = filtered.filter(track => track.name.toLowerCase().includes(this.searchTerm));
        }

        const listEl = document.getElementById('track-list');
        listEl.innerHTML = '';

        for (let track of filtered) {
            const tags = await this.db.getTags(track.id);
            const isExcluded = tags.includes('excluded');
            const li = document.createElement('li');
            li.className = 'track-item';
            li.setAttribute('draggable', 'true');
            li.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', track.id);
            });
            const tagsHtml = tags.length > 0 
                ? tags.map(t => `<span class="tag-badge">${t} <button class="remove-tag-btn" data-track-id="${track.id}" data-tag="${t}"><svg class="icon"><use href="#icon-close"></use></svg></button></span>`).join(' ')
                : 'без тегов';
            li.innerHTML = `
                <span><strong>${track.name}</strong> (${utils.formatTime(track.duration)})</span>
                <div class="track-tags"><svg class="icon"><use href="#icon-tag"></use></svg> ${tagsHtml}</div>
                <div>
                    <button class="add-tag-btn" data-id="${track.id}"><svg class="icon"><use href="#icon-plus"></use></svg> Добавить</button>
                    <input type="text" placeholder="новый тег" class="tag-input" data-id="${track.id}">
                    <button class="exclude-btn" data-id="${track.id}">${isExcluded ? '<svg class="icon"><use href="#icon-check"></use></svg> Включить' : '<svg class="icon"><use href="#icon-ban"></use></svg> Исключить'}</button>
                    <button class="play-now-btn" data-id="${track.id}"><svg class="icon"><use href="#icon-play"></use></svg> В очередь</button>
                    <button class="play-immediate-btn" data-id="${track.id}"><svg class="icon"><use href="#icon-play"></use></svg>Воспроизвести</button>
                    <button class="add-to-playlist-btn" data-id="${track.id}"><svg class="icon"><use href="#icon-playlist"></use></svg> В плейлист</button>
                    <button class="details-btn" data-id="${track.id}"><svg class="icon"><use href="#icon-info"></use></svg> Подробнее</button>
                </div>
            `;
            listEl.appendChild(li);
        }

        document.querySelectorAll('.add-tag-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const input = btn.closest('.track-item').querySelector('.tag-input');
                if (!input) return;
                const newTag = input.value.trim();
                if (newTag) {
                    const currentTags = await this.db.getTags(id);
                    if (!currentTags.includes(newTag)) {
                        currentTags.push(newTag);
                        await this.db.setTags(id, currentTags);
                        this.renderLibrary();
                        if (this.player.currentTrack && this.player.currentTrack.id === id) {
                            await this.player.updateEffectiveVolume();
                        }
                        input.value = '';
                    } else {
                        Modal.alert('Такой тег уже есть у трека', 'Внимание');
                    }
                }
            });
        });

        // Обработчик исключения/включения
        document.querySelectorAll('.exclude-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.target.closest('button').dataset.id;
                const tags = await this.db.getTags(id);
                const excludedTag = 'excluded';
                if (tags.includes(excludedTag)) {
                    const newTags = tags.filter(t => t !== excludedTag);
                    await this.db.setTags(id, newTags);
                } else {
                    tags.push(excludedTag);
                    await this.db.setTags(id, tags);
                }
                this.renderLibrary();
                if (this.player.currentTrack && this.player.currentTrack.id === id) {
                    await this.player.updateEffectiveVolume();
                }
            });
        });

        // Обработчик "В очередь"
        document.querySelectorAll('.play-now-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.target.closest('button').dataset.id;
                await this.player.addToQueue([id]);
                if (this.player.queue.length === 1) {
                    this.player.currentIndex = 0;
                    await this.player.loadTrack(id);
                    this.player.play();
                }
            });
        });

        // Обработчик "Воспроизвести сейчас"
        document.querySelectorAll('.play-immediate-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.target.closest('button').dataset.id;
                await this.player.playNow(id);
            });
        });

        // Обработчик добавления в плейлист (с выбором из списка)
        document.querySelectorAll('.add-to-playlist-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const trackId = btn.dataset.id;
                const playlists = await this.db.getAllPlaylists();
                if (playlists.length === 0) {
                    Modal.alert('Сначала создайте плейлист', 'Нет плейлистов');
                    return;
                }
                const items = playlists.map(p => ({ label: p.name, value: p.id }));
                const selectedId = await Modal.select(items, 'Выберите плейлист');
                if (selectedId) {
                    const playlist = playlists.find(p => p.id === selectedId);
                    if (!playlist.tracks.includes(trackId)) {
                        playlist.tracks.push(trackId);
                        await this.db.updatePlaylist(playlist);
                        this.showToast('Трек добавлен в плейлист');
                        this.refreshPlaylist(playlist.id);
                    } else {
                        Modal.alert('Трек уже есть в этом плейлисте', 'Дубликат');
                    }
                }
            });
        });

        // Обработчик кнопки "Подробнее"
        document.querySelectorAll('.details-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.target.closest('button').dataset.id;
                Router.navigate('track', id);
            });
        });
    }

    attachQueueHandlers() {
        document.querySelectorAll('.queue-play-now').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = parseInt(e.target.closest('button').dataset.index);
                await this.player.playFromQueue(index);
            });
        });

        document.querySelectorAll('.queue-up').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = parseInt(e.target.closest('button').dataset.index);
                if (index > 0) {
                    [this.player.queue[index-1], this.player.queue[index]] = [this.player.queue[index], this.player.queue[index-1]];
                    if (this.player.currentIndex === index) this.player.currentIndex--;
                    else if (this.player.currentIndex === index-1) this.player.currentIndex++;
                    await this.db.setQueue(this.player.queue.filter(t => t.id).map(t => t.id));
                    this.renderQueue(this.player.queue);
                }
            });
        });

        document.querySelectorAll('.queue-down').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = parseInt(e.target.closest('button').dataset.index);
                if (index < this.player.queue.length - 1) {
                    [this.player.queue[index], this.player.queue[index+1]] = [this.player.queue[index+1], this.player.queue[index]];
                    if (this.player.currentIndex === index) this.player.currentIndex++;
                    else if (this.player.currentIndex === index+1) this.player.currentIndex--;
                    await this.db.setQueue(this.player.queue.filter(t => t.id).map(t => t.id));
                    this.renderQueue(this.player.queue);
                }
            });
        });

        document.querySelectorAll('.queue-remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = parseInt(e.target.closest('button').dataset.index);
                await this.player.removeFromQueue(index);
            });
        });
    }

    async renderQueue(queue) {
        const listEl = document.getElementById('queue-list');
        listEl.innerHTML = '';

        for (let i = 0; i < queue.length; i++) {
            let track = queue[i];
            if (typeof track === 'string') {
                track = await this.db.getTrack(track);
                if (!track) continue;
            }

            const li = document.createElement('li');
            li.className = 'queue-item';
            li.dataset.id = track.id || `temp-${i}`;
            const isCurrent = this.player.currentTrack && (
                (track.id && this.player.currentTrack.id === track.id) ||
                (track.archiveId && this.player.currentTrack.archiveId === track.archiveId)
            );
            if (isCurrent) li.classList.add('current-track');

            li.innerHTML = `
                <span><strong>${i+1}.</strong> ${track.name}</span>
                <div class="queue-controls">
                    <button class="queue-play-now" data-index="${i}" title="Воспроизвести сейчас"><svg class="icon"><use href="#icon-play"></use></svg></button>
                    <button class="queue-up" data-index="${i}" ${i === 0 ? 'disabled' : ''}><svg class="icon"><use href="#icon-arrow-up"></use></svg></button>
                    <button class="queue-down" data-index="${i}" ${i === queue.length-1 ? 'disabled' : ''}><svg class="icon"><use href="#icon-arrow-down"></use></svg></button>
                    <button class="queue-remove" data-index="${i}"><svg class="icon"><use href="#icon-close"></use></svg></button>
                </div>
            `;
            listEl.appendChild(li);
        }

        this.attachQueueHandlers();
        DragDrop.initQueue(this);
    }

    updateCurrentTrack(track, pictureUrl) {
        const nameEl = document.getElementById('current-track-name');
        nameEl.innerHTML = track ? `<svg class="icon"><use href="#icon-note"></use></svg> ${track.name}` : '<svg class="icon"><use href="#icon-note"></use></svg> Не выбрано';
        nameEl.removeAttribute('data-original-html');
        this.applyMarqueeIfNeeded();

        const coverImg = document.getElementById('current-track-cover');
        const visualizerCanvas = document.getElementById('player-visualizer');
        const noCoverSpan = document.querySelector('.player-cover .no-cover');

        if (this.currentPictureUrl) {
            URL.revokeObjectURL(this.currentPictureUrl);
            this.currentPictureUrl = null;
        }

        if (pictureUrl) {
            coverImg.src = pictureUrl;
            coverImg.style.display = 'block';
            visualizerCanvas.style.display = 'none';
            noCoverSpan.style.display = 'none';
            this.currentPictureUrl = pictureUrl;
            if (this.player) {
                this.player.stopVisualizer();
            }
            coverImg.onerror = () => {
                coverImg.style.display = 'none';
                visualizerCanvas.style.display = 'block';
                noCoverSpan.style.display = 'none';
                if (this.currentPictureUrl) {
                    URL.revokeObjectURL(this.currentPictureUrl);
                    this.currentPictureUrl = null;
                }
                if (this.player && this.player.isPlaying) {
                    this.player.startVisualizer();
                }
            };
        } else {
            coverImg.src = '';
            coverImg.style.display = 'none';
            visualizerCanvas.style.display = 'block';
            noCoverSpan.style.display = 'none';
            if (this.player && this.player.isPlaying) {
                this.player.startVisualizer();
            }
        }

        if (window.location.hash.startsWith('#track/')) {
            const currentTrackIdInHash = window.location.hash.split('/')[1];
            if (track && ((track.id && currentTrackIdInHash === track.id) || 
                (track.archiveId && currentTrackIdInHash === `archive:${track.archiveId}`))) {
                this.loadTrackDetail(currentTrackIdInHash);
            } else if (track && track.id) {
                Router.navigate('track', track.id);
            } else if (track && track.archiveId) {
                Router.navigate('track', `archive:${track.archiveId}`);
            }
        } else {
            this.updateTrackPlaybackControls();
        }
        this.renderQueue(this.player.queue);
        this.renderPlaylists();
    }

    setPlayPauseIcon(playing) {
        const playPauseBtn = document.getElementById('play-pause');
        if (playPauseBtn) {
            playPauseBtn.innerHTML = playing ? '<svg class="icon"><use href="#icon-pause"></use></svg>' : '<svg class="icon"><use href="#icon-play"></use></svg>';
        }
        const trackPlayPause = document.getElementById('track-play-pause');
        if (trackPlayPause) {
            trackPlayPause.innerHTML = playing ? '<svg class="icon"><use href="#icon-pause"></use></svg>' : '<svg class="icon"><use href="#icon-play"></use></svg>';
        }
    }

    updateTrackPlaybackControls() {
        const controls = document.getElementById('track-playback-controls');
        if (!controls) return;
        const currentTrack = this.player.currentTrack;
        const hash = window.location.hash;
        if (currentTrack && (
            (currentTrack.id && hash.includes(`track/${currentTrack.id}`)) ||
            (currentTrack.archiveId && hash.includes(`track/archive:${currentTrack.archiveId}`))
        )) {
            controls.classList.remove('hidden');
            document.getElementById('track-volume').value = this.player.baseVolume;
            this.setPlayPauseIcon(this.player.isPlaying);
            const updateProgress = () => {
                if (this.player.audio.duration) {
                    const progress = (this.player.audio.currentTime / this.player.audio.duration) * 100;
                    document.getElementById('track-progress').value = progress;
                    document.getElementById('track-time').textContent = 
                        `${utils.formatTime(this.player.audio.currentTime)} / ${utils.formatTime(this.player.audio.duration)}`;
                }
            };
            this.player.audio.addEventListener('timeupdate', updateProgress);
            if (this.trackProgressHandler) {
                this.player.audio.removeEventListener('timeupdate', this.trackProgressHandler);
            }
            this.trackProgressHandler = updateProgress;
            this.player.audio.addEventListener('timeupdate', this.trackProgressHandler);
        } else {
            controls.classList.add('hidden');
            if (this.trackProgressHandler) {
                this.player.audio.removeEventListener('timeupdate', this.trackProgressHandler);
                this.trackProgressHandler = null;
            }
        }
    }

    updateAllProgressBars(currentTime, duration) {
        if (!duration) return;
        const percent = (currentTime / duration) * 100;

        const bottomProgress = document.getElementById('progress');
        if (bottomProgress) {
            bottomProgress.value = percent;
            if (window.updateRangeFill) window.updateRangeFill(bottomProgress);
        }

        const trackProgress = document.getElementById('track-progress');
        if (trackProgress) {
            trackProgress.value = percent;
            if (window.updateRangeFill) window.updateRangeFill(trackProgress);
        }

        const popupProgress = document.getElementById('popup-progress');
        if (popupProgress) {
            popupProgress.value = percent;
            if (window.updateRangeFill) window.updateRangeFill(popupProgress);
        }

        const trackTime = document.getElementById('track-time');
        if (trackTime) {
            trackTime.textContent = `${utils.formatTime(currentTime)} / ${utils.formatTime(duration)}`;
        }

        if (this.popup && typeof this.popup.updateProgress === 'function') {
            this.popup.updateProgress(currentTime, duration);
        }
    }

    async exportData() {
        const data = await this.db.exportData();
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'music-player-backup.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    async importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            const text = await file.text();
            const data = JSON.parse(text);
            await this.db.importData(data);
            await this.player.loadQueue();
            this.renderLibrary();
            this.themeManager.loadFromDB(this.db);
            this.syncSettingsPage();
            await this.initLibraryClickBehavior();
            await Modal.alert(
                'Внимание: при экспорте были удалены ссылки на файлы. После импорта необходимо заново выбрать папку с музыкой, чтобы восстановить доступ.',
                'Импорт данных'
            );
        };
        input.click();
    }

    async syncSettingsPage() {
        const preset = await this.db.getSetting('theme-preset') || 'light';
        const color = await this.db.getSetting('theme-custom-color') || '#4a90e2';

        const themeSelect = document.getElementById('theme-select-settings');
        const colorInput = document.getElementById('custom-color-settings');
        if (themeSelect) themeSelect.value = preset;
        if (colorInput) colorInput.value = color;

        const navSelect = document.getElementById('nav-position-select');
        if (navSelect) {
            const savedPos = await this.db.getSetting('nav_position') || 'top';
            if (navSelect.value !== savedPos) {
                navSelect.value = savedPos;
            }
            // Удаляем старый обработчик, чтобы не вешать несколько
            if (navSelect._navChangeHandler) {
                navSelect.removeEventListener('change', navSelect._navChangeHandler);
            }
            const handler = async (e) => {
                this.applyNavPosition(e.target.value);
                this.adjustNavPositionOptions();
            };
            navSelect.addEventListener('change', handler);
            navSelect._navChangeHandler = handler;
            this.adjustNavPositionOptions();
        }


        const libraryClickCheckbox = document.getElementById('details-library-click-enabled');
        if (libraryClickCheckbox) {
            const saved = await this.db.getSetting('library_click_behavior');
            libraryClickCheckbox.checked = saved !== undefined ? saved : false;
            if (this._checkboxChangeHandler) {
                libraryClickCheckbox.removeEventListener('change', this._checkboxChangeHandler);
                libraryClickCheckbox.addEventListener('change', this._checkboxChangeHandler);
            }
        }

        const allTracks = await this.db.getAllTracks();
        const excludedList = document.getElementById('excluded-tracks-list');
        excludedList.innerHTML = '';

        for (let track of allTracks) {
            const tags = await this.db.getTags(track.id);
            if (tags.includes('excluded')) {
                const li = document.createElement('li');
                li.className = 'excluded-item';
                li.innerHTML = `
                    <span>${track.name}</span>
                    <button class="remove-exclusion" data-id="${track.id}"><svg class="icon"><use href="#icon-close"></use></svg> Убрать исключение</button>
                `;
                excludedList.appendChild(li);
            }
        }

        document.querySelectorAll('.remove-exclusion').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.closest('button').dataset.id;
                const tags = await this.db.getTags(id);
                const newTags = tags.filter(t => t !== 'excluded');
                await this.db.setTags(id, newTags);
                this.syncSettingsPage();
            });
        });

        await this.renderThemeFineTuning();

        const enabledCheck = document.getElementById('visualizer-enabled');
        const typeSelect = document.getElementById('visualizer-type');
        const sensitivityRange = document.getElementById('visualizer-sensitivity');
        const barCountRange = document.getElementById('visualizer-bar-count');
        const smoothingRange = document.getElementById('visualizer-smoothing');
        const barSymX = document.getElementById('visualizer-bar-sym-x');
        const barSymY = document.getElementById('visualizer-bar-sym-y');
        const waveSymX = document.getElementById('visualizer-wave-sym-x');

        if (enabledCheck) {
            enabledCheck.checked = this.player.visualizerEnabled;
            const newCheck = enabledCheck.cloneNode(true);
            enabledCheck.parentNode.replaceChild(newCheck, enabledCheck);
            newCheck.addEventListener('change', async (e) => {
                this.player.visualizerEnabled = e.target.checked;
                await this.player.saveVisualizerSettings();
                if (!this.player.visualizerEnabled) {
                    this.player.stopVisualizer();
                } else if (this.player.isPlaying) {
                    this.player.startVisualizer();
                }
            });
        }

        if (typeSelect) {
            const currentType = this.player.visualizerType;
            typeSelect.value = currentType;
            const newSelect = typeSelect.cloneNode(true);
            typeSelect.parentNode.replaceChild(newSelect, typeSelect);
            newSelect.value = currentType;
            newSelect.addEventListener('change', async (e) => {
                this.player.visualizerType = e.target.value;
                await this.player.saveVisualizerSettings();
            });
        }

        if (sensitivityRange) {
            sensitivityRange.value = this.player.visualizerSensitivity;
            const newRange = sensitivityRange.cloneNode(true);
            sensitivityRange.parentNode.replaceChild(newRange, sensitivityRange);
            newRange.addEventListener('input', async (e) => {
                this.player.visualizerSensitivity = parseFloat(e.target.value);
                await this.player.saveVisualizerSettings();
            });
        }

        if (barCountRange) {
            barCountRange.value = this.player.visualizerBarCount;
            const newRange = barCountRange.cloneNode(true);
            barCountRange.parentNode.replaceChild(newRange, barCountRange);
            newRange.addEventListener('input', async (e) => {
                this.player.visualizerBarCount = parseInt(e.target.value);
                await this.player.saveVisualizerSettings();
            });
        }

        if (smoothingRange) {
            smoothingRange.value = this.player.visualizerSmoothing;
            const newRange = smoothingRange.cloneNode(true);
            smoothingRange.parentNode.replaceChild(newRange, smoothingRange);
            newRange.addEventListener('input', async (e) => {
                this.player.visualizerSmoothing = parseFloat(e.target.value);
                if (this.player.analyser) {
                    this.player.analyser.smoothingTimeConstant = this.player.visualizerSmoothing;
                }
                await this.player.saveVisualizerSettings();
            });
        }

        if (barSymX) {
            barSymX.checked = this.player.visualizerBarSymX;
            const newBarSymX = barSymX.cloneNode(true);
            barSymX.parentNode.replaceChild(newBarSymX, barSymX);
            newBarSymX.addEventListener('change', async (e) => {
                this.player.visualizerBarSymX = e.target.checked;
                await this.player.saveVisualizerSettings();
            });
        }

        if (barSymY) {
            barSymY.checked = this.player.visualizerBarSymY;
            const newBarSymY = barSymY.cloneNode(true);
            barSymY.parentNode.replaceChild(newBarSymY, barSymY);
            newBarSymY.addEventListener('change', async (e) => {
                this.player.visualizerBarSymY = e.target.checked;
                await this.player.saveVisualizerSettings();
            });
        }

        if (waveSymX) {
            waveSymX.checked = this.player.visualizerWaveSymX;
            const newWaveSymX = waveSymX.cloneNode(true);
            waveSymX.parentNode.replaceChild(newWaveSymX, waveSymX);
            newWaveSymX.addEventListener('change', async (e) => {
                this.player.visualizerWaveSymX = e.target.checked;
                await this.player.saveVisualizerSettings();
            });
        }
    }

    async renderThemeFineTuning() {
        const container = document.getElementById('theme-fine-tuning');
        if (!container) return;
        const vars = [
            { css: '--bg-color', label: 'Фон' },
            { css: '--text-color', label: 'Текст' },
            { css: '--primary-color', label: 'Основной цвет' },
            { css: '--secondary-bg', label: 'Фон второстепенный' },
            { css: '--border-color', label: 'Цвет границ' },
            { css: '--player-bg', label: 'Фон плеера' },
            { css: '--hover-bg', label: 'Фон при наведении' }
        ];
        let html = '<div class="theme-fine-grid">';
        for (let v of vars) {
            const currentValue = getComputedStyle(this.themeManager.root).getPropertyValue(v.css).trim();
            html += `
                <div class="theme-fine-item">
                    <label>${v.label}</label>
                    <input type="color" class="theme-var-input" data-var="${v.css}" value="${utils.rgbToHex(currentValue)}">
                </div>
            `;
        }
        html += '</div>';
        container.innerHTML = html;

        container.querySelectorAll('.theme-var-input').forEach(input => {
            input.addEventListener('input', utils.debounce(async (e) => {
                const varName = e.target.dataset.var;
                const value = e.target.value;
                this.themeManager.root.style.setProperty(varName, value);
                await this.db.setSetting('theme:var:' + varName, value);

                if (window.initAllRanges) window.initAllRanges();
            }, 200));
        });

        const resetBtn = document.getElementById('reset-theme-overrides');
        if (resetBtn) {
            resetBtn.onclick = async () => {
                for (let v of vars) {
                    await this.db.deleteSetting('theme:var:' + v.css);
                }
                this.themeManager.applyPreset(this.themeManager.currentPreset);
                this.renderThemeFineTuning();

                if (window.initAllRanges) window.initAllRanges();
            };
        }
    }

    async loadThemeOverrides() {
        const vars = [
            '--bg-color', '--text-color', '--primary-color',
            '--secondary-bg', '--border-color', '--player-bg', '--hover-bg'
        ];
        for (let cssVar of vars) {
            const value = await this.db.getSetting('theme:var:' + cssVar);
            if (value) {
                this.themeManager.root.style.setProperty(cssVar, value);
            }
        }
    }

    async loadTrackDetail(param) {
        const isArchive = param.startsWith('archive:');
        const identifier = isArchive ? param.substring(8) : param;

        if (isArchive) {
            const details = await ArchiveApi.getTrackDetails(identifier);
            if (!details) {
                Router.navigate('archive');
                return;
            }
            const track = {
                id: null,
                name: `${details.title} - ${details.creator}`,
                duration: details.duration,
                streamUrl: details.streamUrl,
                source: 'archive',
                archiveId: identifier
            };

            const existingTracks = await this.db.getAllTracks();
            const existing = existingTracks.find(t => t.archiveId === identifier);
            const isInLibrary = !!existing;

            const container = document.getElementById('track-detail-container');
            container.innerHTML = `
                <div class="track-detail">
                    <div class="track-detail-media">
                        <img src="" alt="cover" class="track-detail-cover" style="display:none;">
                        <canvas id="track-detail-visualizer" width="150" height="150" style="display:block;"></canvas>
                        <div class="track-detail-cover no-cover" style="display:none;"><svg class="icon"><use href="#icon-note"></use></svg></div>
                    </div>
                    <h3>${utils.escapeHtml(track.name)}</h3>
                    <p><strong>Длительность:</strong> ${utils.formatTime(track.duration)}</p>
                    <p><strong>Ссылка:</strong> <a href="${track.streamUrl}" target="_blank">${track.streamUrl}</a></p>
                    <div class="track-detail-actions">
                        <button id="detail-add-to-queue"><svg class="icon"><use href="#icon-play"></use></svg> В очередь</button>
                        <button id="detail-play-now"><svg class="icon"><use href="#icon-play"></use></svg>Воспроизвести</button>
                        ${isInLibrary ? 
                            `<button id="detail-delete-from-library" class="delete-btn"><svg class="icon"><use href="#icon-trash"></use></svg> Удалить из библиотеки</button>` :
                            `<button id="detail-add-to-library"><svg class="icon"><use href="#icon-plus"></use></svg> Добавить в библиотеку</button>`
                        }
                    </div>
                </div>
            `;

            document.getElementById('detail-add-to-queue').addEventListener('click', async () => {
                const trackObj = { ...track, id: null };
                await this.player.addToQueue([trackObj]);
            });
            document.getElementById('detail-play-now').addEventListener('click', async () => {
                const trackObj = { ...track, id: null };
                await this.player.playNow(trackObj);
            });

            if (isInLibrary) {
                const deleteBtn = document.getElementById('detail-delete-from-library');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', async () => {
                        await this.deleteTrack(existing.id);
                        Router.navigate('archive');
                    });
                }
            } else {
                const addBtn = document.getElementById('detail-add-to-library');
                if (addBtn) {
                    addBtn.addEventListener('click', async () => {
                        const trackObj = { ...track, id: utils.generateId() };
                        await this.db.addTrack(trackObj);
                        this.showToast('Трек добавлен в библиотеку');
                        this.loadTrackDetail(`archive:${identifier}`);
                    });
                }
            }

            if (this.player.isPlaying && this.player.currentTrack && this.player.currentTrack.archiveId === identifier) {
                this.registerTrackDetailVisualizer();
            } else {
                this.unregisterTrackDetailVisualizer();
            }
        } else {
            const track = await this.db.getTrack(identifier);
            if (!track) {
                Router.navigate('library');
                return;
            }

            const tags = await this.db.getTags(track.id);
            const isExcluded = tags.includes('excluded');

            const file = await this.fileHandler.getFileForTrack(track);
            let pictureUrl = null;
            if (file) {
                pictureUrl = await this.fileHandler.getPictureBlobUrl(file);
            }

            const container = document.getElementById('track-detail-container');
            const tagsHtml = tags.length > 0 
                ? tags.map(t => `<span class="tag-badge">${t} <button class="remove-tag-btn" data-track-id="${track.id}" data-tag="${t}"><svg class="icon"><use href="#icon-close"></use></svg></button></span>`).join(' ')
                : 'нет';

            let mediaHtml;
            if (pictureUrl) {
                mediaHtml = `
                    <div class="track-detail-media">
                        <img id="track-detail-cover" src="${pictureUrl}" alt="cover" class="track-detail-cover" style="max-width:200px; max-height:200px; border-radius:8px;">
                        <canvas id="track-detail-visualizer" width="150" height="150" style="display:none;"></canvas>
                        <div class="track-detail-cover no-cover" style="display:none;"><svg class="icon"><use href="#icon-note"></use></svg></div>
                    </div>
                `;
            } else {
                mediaHtml = `
                    <div class="track-detail-media">
                        <img id="track-detail-cover" src="" alt="cover" class="track-detail-cover" style="display:none;">
                        <canvas id="track-detail-visualizer" width="150" height="150" style="display:block;"></canvas>
                        <div class="track-detail-cover no-cover" style="display:none;"><svg class="icon"><use href="#icon-note"></use></svg></div>
                    </div>
                `;
            }

            container.innerHTML = `
                <div class="track-detail">
                    ${mediaHtml}
                    <h3>${track.name}</h3>
                    <!-- <p><strong>Длительность:</strong> ${utils.formatTime(track.duration)}</p> -->
                    <!-- <p><strong>Путь:</strong> ${track.path || 'неизвестно'}</p> -->
                    <p><strong>Теги:</strong> ${tagsHtml}</p>
                    <p><strong>Исключён:</strong> ${isExcluded ? 'да' : 'нет'}</p>
                    <div class="track-detail-actions">
                        <button id="detail-add-tag"><svg class="icon"><use href="#icon-plus"></use></svg> Добавить тег</button>
                        <input type="text" id="detail-new-tag" placeholder="новый тег">
                        <button id="detail-toggle-exclude">${isExcluded ? '<svg class="icon"><use href="#icon-check"></use></svg> Вернуть в случайный выбор' : '<svg class="icon"><use href="#icon-ban"></use></svg> Исключить из случайного выбора'}</button>
                        <button id="detail-add-to-queue"><svg class="icon"><use href="#icon-play"></use></svg> В очередь</button>
                        <button id="detail-play-now"><svg class="icon"><use href="#icon-play"></use></svg>Воспроизвести</button>
                        <button id="detail-add-to-playlist"><svg class="icon"><use href="#icon-playlist"></use></svg> В плейлист</button>
                        <button id="detail-delete-from-library" class="delete-btn"><svg class="icon"><use href="#icon-trash"></use></svg> Удалить из библиотеки</button>
                        <button id="detail-edit-volume-intervals"><svg class="icon"><use href="#icon-settings"></use></svg> Интервалы громкости</button>
                    </div>
                </div>
            `;

            if (this.detailPictureUrl) {
                URL.revokeObjectURL(this.detailPictureUrl);
                this.detailPictureUrl = null;
            }
            if (pictureUrl) {
                this.detailPictureUrl = pictureUrl;
            }

            const img = document.getElementById('track-detail-cover');
            const canvas = document.getElementById('track-detail-visualizer');
            const noCoverDiv = document.querySelector('.track-detail-media .no-cover');

            if (pictureUrl) {
                img.onload = () => {
                    img.style.display = 'block';
                    if (canvas) canvas.style.display = 'none';
                    if (noCoverDiv) noCoverDiv.style.display = 'none';
                    this.unregisterTrackDetailVisualizer();
                };
                img.onerror = () => {
                    img.style.display = 'none';
                    if (canvas) canvas.style.display = 'block';
                    if (noCoverDiv) noCoverDiv.style.display = 'none';
                    if (this.player.isPlaying && this.player.currentTrack && this.player.currentTrack.id === track.id) {
                        this.registerTrackDetailVisualizer();
                    }
                };
                if (img.complete) {
                    if (img.naturalWidth > 0) {
                        img.style.display = 'block';
                        if (canvas) canvas.style.display = 'none';
                        if (noCoverDiv) noCoverDiv.style.display = 'none';
                    } else {
                        img.style.display = 'none';
                        if (canvas) canvas.style.display = 'block';
                        if (noCoverDiv) noCoverDiv.style.display = 'none';
                        if (this.player.isPlaying && this.player.currentTrack && this.player.currentTrack.id === track.id) {
                            this.registerTrackDetailVisualizer();
                        }
                    }
                }
            } else {
                if (img) img.style.display = 'none';
                if (canvas) canvas.style.display = 'block';
                if (noCoverDiv) noCoverDiv.style.display = 'none';
                if (this.player.isPlaying && this.player.currentTrack && this.player.currentTrack.id === track.id) {
                    this.registerTrackDetailVisualizer();
                }
            }

            // Обработчик добавления тега (кнопка)
            document.getElementById('detail-add-tag').addEventListener('click', async () => {
                const input = document.getElementById('detail-new-tag');
                const newTag = input.value.trim();
                if (newTag && !tags.includes(newTag)) {
                    tags.push(newTag);
                    await this.db.setTags(track.id, tags);
                    this.loadTrackDetail(track.id);
                    if (this.player.currentTrack && this.player.currentTrack.id === track.id) {
                        await this.player.updateEffectiveVolume();
                    }
                    input.value = '';
                } else if (newTag && tags.includes(newTag)) {
                    Modal.alert('Такой тег уже есть у трека', 'Внимание');
                }
            });

            // Обработчик Enter для поля ввода тега в деталях
            const newTagInput = document.getElementById('detail-new-tag');
            if (newTagInput) {
                newTagInput.addEventListener('keypress', async (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const newTag = newTagInput.value.trim();
                        if (newTag && !tags.includes(newTag)) {
                            tags.push(newTag);
                            await this.db.setTags(track.id, tags);
                            this.loadTrackDetail(track.id);
                            if (this.player.currentTrack && this.player.currentTrack.id === track.id) {
                                await this.player.updateEffectiveVolume();
                            }
                            newTagInput.value = '';
                        } else if (newTag && tags.includes(newTag)) {
                            Modal.alert('Такой тег уже есть у трека', 'Внимание');
                        }
                    }
                });
            }

            // Обработчик исключения/включения
            document.getElementById('detail-toggle-exclude').addEventListener('click', async () => {
                const excludedTag = 'excluded';
                if (tags.includes(excludedTag)) {
                    const newTags = tags.filter(t => t !== excludedTag);
                    await this.db.setTags(track.id, newTags);
                } else {
                    tags.push(excludedTag);
                    await this.db.setTags(track.id, tags);
                }
                this.loadTrackDetail(track.id);
                if (this.player.currentTrack && this.player.currentTrack.id === track.id) {
                    await this.player.updateEffectiveVolume();
                }
            });

            // В очередь
            document.getElementById('detail-add-to-queue').addEventListener('click', async () => {
                await this.player.addToQueue([track.id]);
            });

            // Воспроизвести сейчас
            document.getElementById('detail-play-now').addEventListener('click', async () => {
                await this.player.playNow(track.id);
            });

            // Добавить в плейлист
            document.getElementById('detail-add-to-playlist').addEventListener('click', async () => {
                const playlists = await this.db.getAllPlaylists();
                if (playlists.length === 0) {
                    Modal.alert('Сначала создайте плейлист', 'Нет плейлистов');
                    return;
                }
                const items = playlists.map(p => ({ label: p.name, value: p.id }));
                const selectedId = await Modal.select(items, 'Выберите плейлист');
                if (selectedId) {
                    const playlist = playlists.find(p => p.id === selectedId);
                    if (!playlist.tracks.includes(track.id)) {
                        playlist.tracks.push(track.id);
                        await this.db.updatePlaylist(playlist);
                        this.showToast('Трек добавлен в плейлист');
                        this.refreshPlaylist(playlist.id);
                    } else {
                        Modal.alert('Трек уже есть в этом плейлисте', 'Дубликат');
                    }
                }
            });

            // Удалить из библиотеки
            document.getElementById('detail-delete-from-library').addEventListener('click', async () => {
                await this.deleteTrack(track.id);
                Router.navigate('library');
            });

            document.getElementById('detail-edit-volume-intervals').addEventListener('click', () => {
                this.openVolumeIntervalEditor(track);
            });
        }

        this.updateTrackPlaybackControls();
    }

    async renderPlaylists() {
        const container = document.getElementById('playlists-list');
        if (!container) return;
        
        const playlists = await this.db.getAllPlaylists();
        console.log('Рендеринг плейлистов, получено:', playlists.length);

        const currentStates = {};
        document.querySelectorAll('.playlist-item').forEach(item => {
            const id = item.querySelector('.playlist-load')?.dataset.id;
            if (id) {
                const tracksDiv = item.querySelector(`#playlist-tracks-${id}`);
                if (tracksDiv) {
                    currentStates[id] = tracksDiv.style.display !== 'none';
                }
            }
        });
        Object.assign(this.playlistOpenState, currentStates);

        container.innerHTML = '';
        for (let pl of playlists) {
            const plDiv = document.createElement('div');
            plDiv.className = 'playlist-item';
            plDiv.innerHTML = `
                <div class="playlist-header">
                    <strong>${utils.escapeHtml(pl.name)}</strong>
                    <div class="playlist-actions">
                        <button class="playlist-load" data-id="${pl.id}"><svg class="icon"><use href="#icon-play"></use></svg> Загрузить в очередь</button>
                        <button class="playlist-delete" data-id="${pl.id}"><svg class="icon"><use href="#icon-trash"></use></svg> Удалить</button>
                    </div>
                </div>
                <div class="playlist-tracks" id="playlist-tracks-${pl.id}" style="${this.playlistOpenState[pl.id] ? 'display:block;' : 'display:none;'}"></div>
            `;
            container.appendChild(plDiv);

            plDiv.querySelector('.playlist-header').addEventListener('click', async (e) => {
                if (e.target.closest('button')) return;
                const tracksDiv = plDiv.querySelector('.playlist-tracks');
                const isVisible = tracksDiv.style.display !== 'none';
                if (isVisible) {
                    tracksDiv.style.display = 'none';
                    this.playlistOpenState[pl.id] = false;
                } else {
                    tracksDiv.style.display = 'block';
                    await this.renderPlaylistTracks(pl.id, tracksDiv);
                    this.playlistOpenState[pl.id] = true;
                }
            });

            plDiv.querySelector('.playlist-load').addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.target.closest('button').dataset.id;
                const playlist = await this.db.getPlaylist(id);
                if (playlist && playlist.tracks.length) {
                    await this.player.addToQueue(playlist.tracks);
                    this.showToast(`Плейлист "${playlist.name}" загружен в очередь`, 'success');
                }
            });

            plDiv.querySelector('.playlist-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                const confirmed = await Modal.confirm(`Удалить плейлист "${pl.name}"?`, 'Подтверждение');
                if (confirmed) {
                    try {
                        await this.db.deletePlaylist(pl.id);
                        delete this.playlistOpenState[pl.id];
                        this.showToast(`Плейлист "${pl.name}" удалён`, 'success');
                        await this.renderPlaylists();
                    } catch (error) {
                        console.error('Ошибка удаления плейлиста:', error);
                        Modal.alert('Не удалось удалить плейлист', 'Ошибка');
                    }
                }
            });

            if (this.playlistOpenState[pl.id]) {
                const tracksDiv = plDiv.querySelector('.playlist-tracks');
                await this.renderPlaylistTracks(pl.id, tracksDiv);
            }
        }
    }

    async refreshPlaylist(playlistId) {
        const container = document.getElementById(`playlist-tracks-${playlistId}`);
        if (!container) return;
        await this.renderPlaylistTracks(playlistId, container);
    }

    async renderPlaylistTracks(playlistId, container) {
        const playlist = await this.db.getPlaylist(playlistId);
        if (!playlist) return;
        container.innerHTML = '';
        for (let i = 0; i < playlist.tracks.length; i++) {
            const trackId = playlist.tracks[i];
            const track = await this.db.getTrack(trackId);
            if (!track) continue;
            const trackDiv = document.createElement('div');
            trackDiv.className = 'playlist-track-item';
            const isCurrent = this.player.currentTrack && this.player.currentTrack.id === track.id;
            if (isCurrent) trackDiv.classList.add('current-track');
            trackDiv.innerHTML = `
                <span><strong>${i+1}.</strong> ${track.name}</span>
                <div class="playlist-track-controls">
                    <button class="playlist-track-up" data-playlist="${playlistId}" data-index="${i}" ${i === 0 ? 'disabled' : ''}><svg class="icon"><use href="#icon-arrow-up"></use></svg></button>
                    <button class="playlist-track-down" data-playlist="${playlistId}" data-index="${i}" ${i === playlist.tracks.length-1 ? 'disabled' : ''}><svg class="icon"><use href="#icon-arrow-down"></use></svg></button>
                    <button class="playlist-track-remove" data-playlist="${playlistId}" data-index="${i}"><svg class="icon"><use href="#icon-close"></use></svg></button>
                </div>
            `;
            container.appendChild(trackDiv);
        }

        container.querySelectorAll('.playlist-track-up').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const playlistId = e.target.closest('button').dataset.playlist;
                const index = parseInt(e.target.closest('button').dataset.index);
                if (index > 0) {
                    const playlist = await this.db.getPlaylist(playlistId);
                    [playlist.tracks[index-1], playlist.tracks[index]] = [playlist.tracks[index], playlist.tracks[index-1]];
                    await this.db.updatePlaylist(playlist);
                    this.refreshPlaylist(playlistId);
                }
            });
        });

        container.querySelectorAll('.playlist-track-down').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const playlistId = e.target.closest('button').dataset.playlist;
                const index = parseInt(e.target.closest('button').dataset.index);
                const playlist = await this.db.getPlaylist(playlistId);
                if (index < playlist.tracks.length - 1) {
                    [playlist.tracks[index], playlist.tracks[index+1]] = [playlist.tracks[index+1], playlist.tracks[index]];
                    await this.db.updatePlaylist(playlist);
                    this.refreshPlaylist(playlistId);
                }
            });
        });

        container.querySelectorAll('.playlist-track-remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const playlistId = e.target.closest('button').dataset.playlist;
                const index = parseInt(e.target.closest('button').dataset.index);
                const playlist = await this.db.getPlaylist(playlistId);
                playlist.tracks.splice(index, 1);
                await this.db.updatePlaylist(playlist);
                this.refreshPlaylist(playlistId);
            });
        });
    }

    async createPlaylistDialog() {
        console.log("ЗАПУСК: создание плейлиста");
        try {
            const name = await Modal.prompt(
                'Введите название плейлиста:',
                '',
                'Название',
                'Создание плейлиста'
            );
            
            if (name && name.trim()) {
                const newPlaylist = { 
                    name: name.trim(), 
                    tracks: [] 
                };
                const playlistId = await this.db.addPlaylist(newPlaylist);
                console.log('Плейлист создан, ID:', playlistId);
                this.showToast(`Плейлист "${name.trim()}" создан`, 'success');
                await this.renderPlaylists();
            } else if (name === '') {
                this.showToast('Название плейлиста не может быть пустым', 'error');
            }
            console.log("ЗАВЕРШЕНО: создание плейлиста"); 
        } catch (error) {
            console.error('Ошибка при создании плейлиста:', error);
            Modal.alert('Не удалось создать плейлист: ' + error.message, 'Ошибка');
            console.error("ОШИБКА:", error);
        }
    }

    syncVolumeSliders(percent) {
        const volumeSlider = document.getElementById('volume');
        if (volumeSlider) {
            volumeSlider.value = percent;
            if (window.updateRangeFill) window.updateRangeFill(volumeSlider);
        }

        const trackVolume = document.getElementById('track-volume');
        if (trackVolume) {
            trackVolume.value = percent;
            if (window.updateRangeFill) window.updateRangeFill(trackVolume);
        }

        const popupVolume = document.getElementById('popup-volume');
        if (popupVolume) {
            popupVolume.value = percent;
            if (window.updateRangeFill) window.updateRangeFill(popupVolume);
        }
    }

    applyMarqueeIfNeeded() {
        const el = document.getElementById('current-track-name');
        if (!el) return;

        let originalHtml = el.getAttribute('data-original-html');
        if (!originalHtml) {
            originalHtml = el.innerHTML;
            el.setAttribute('data-original-html', originalHtml);
        }

        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.visibility = 'hidden';
        tempDiv.style.whiteSpace = 'nowrap';
        const styles = getComputedStyle(el);
        tempDiv.style.font = styles.font;
        tempDiv.style.fontSize = styles.fontSize;
        tempDiv.style.fontFamily = styles.fontFamily;
        tempDiv.style.fontWeight = styles.fontWeight;
        tempDiv.style.letterSpacing = styles.letterSpacing;
        tempDiv.innerHTML = originalHtml;
        document.body.appendChild(tempDiv);
        const fullWidth = tempDiv.offsetWidth;
        document.body.removeChild(tempDiv);

        const containerWidth = el.parentElement ? el.parentElement.clientWidth : el.clientWidth;

        const needsMarquee = fullWidth > containerWidth;

        if (needsMarquee && !el.classList.contains('marquee-ready')) {
            const tempDiv2 = document.createElement('div');
            tempDiv2.innerHTML = originalHtml;
            const originalIcon = tempDiv2.querySelector('.icon');
            let clonedIcon = null;
            if (originalIcon) {
                clonedIcon = originalIcon.cloneNode(true);
            }
            let text = '';
            for (let node of tempDiv2.childNodes) {
                if (node.nodeType === Node.TEXT_NODE) {
                    text += node.textContent;
                } else if (node !== originalIcon && node.nodeType === Node.ELEMENT_NODE) {
                    text += node.textContent;
                }
            }
            text = text.trim();

            el.innerHTML = '';
            if (clonedIcon) el.appendChild(clonedIcon);
            const span1 = document.createElement('span');
            span1.className = 'marquee-text';
            span1.textContent = text;
            const span2 = document.createElement('span');
            span2.className = 'marquee-text';
            span2.textContent = text;
            el.appendChild(span1);
            el.appendChild(span2);
            el.classList.add('marquee-ready');
            setTimeout(() => {
                el.classList.add('marquee-animate');
            }, 10);
        } else if (!needsMarquee && el.classList.contains('marquee-ready')) {
            el.innerHTML = originalHtml;
            el.classList.remove('marquee-ready', 'marquee-animate');
        }
    }

    async renderArchivePage() {
        const container = document.getElementById('archive-results');
        container.innerHTML = '<div>Введите запрос для поиска музыки в Internet Archive.</div>';
        const searchBtn = document.getElementById('archive-search-btn');
        const radioBtn = document.getElementById('archive-radio-btn');
        const searchInput = document.getElementById('archive-search-input');

        if (!this.archiveHandlersAttached) {
            this.archiveHandlersAttached = true;
            searchBtn.addEventListener('click', () => this.searchArchive());
            radioBtn.addEventListener('click', () => this.startRadio());
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.searchArchive();
            });
        }
    }

    async searchArchive() {
        const searchBtn = document.getElementById('archive-search-btn');
        const radioBtn = document.getElementById('archive-radio-btn');
        const container = document.getElementById('archive-results');
        const query = document.getElementById('archive-search-input').value.trim();
        if (!query) return;

        searchBtn.disabled = true;
        radioBtn.disabled = true;
        container.innerHTML = '<div>Поиск...</div>';

        const results = await ArchiveApi.search(query, 30);
        this.archiveResults = results;
        this.renderArchiveResults(results);

        searchBtn.disabled = false;
        radioBtn.disabled = false;
    }

    renderArchiveResults(results) {
        const container = document.getElementById('archive-results');
        if (!results.length) {
            container.innerHTML = '<div>Ничего не найдено.</div>';
            return;
        }
        container.innerHTML = '';
        for (let item of results) {
            const li = document.createElement('li');
            li.className = 'track-item';
            const title = item.title || 'Без названия';
            const creator = item.creator || 'Неизвестный автор';
            li.innerHTML = `
                <span><strong>${utils.escapeHtml(title)}</strong> - ${utils.escapeHtml(creator)}</span>
                <div class="track-tags">Скачиваний: ${item.downloads || 0}</div>
                <div>
                    <button class="archive-add-to-queue" data-identifier="${item.identifier}" data-title="${utils.escapeHtml(title)}" data-creator="${utils.escapeHtml(creator)}"><svg class="icon"><use href="#icon-play"></use></svg> В очередь</button>
                    <button class="archive-play-now" data-identifier="${item.identifier}" data-title="${utils.escapeHtml(title)}" data-creator="${utils.escapeHtml(creator)}"><svg class="icon"><use href="#icon-play"></use></svg>Воспроизвести</button>
                    <button class="archive-add-to-library" data-identifier="${item.identifier}" data-title="${utils.escapeHtml(title)}" data-creator="${utils.escapeHtml(creator)}"><svg class="icon"><use href="#icon-plus"></use></svg> В библиотеку</button>
                    <button class="archive-details-btn" data-identifier="${item.identifier}" data-title="${utils.escapeHtml(title)}" data-creator="${utils.escapeHtml(creator)}"><svg class="icon"><use href="#icon-info"></use></svg> Подробнее</button>
                </div>
            `;
            container.appendChild(li);
        }

        container.querySelectorAll('.archive-add-to-queue').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const identifier = btn.dataset.identifier;
                const title = btn.dataset.title;
                const creator = btn.dataset.creator;
                await this.addArchiveTrack(identifier, title, creator, false);
            });
        });
        container.querySelectorAll('.archive-play-now').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const identifier = btn.dataset.identifier;
                const title = btn.dataset.title;
                const creator = btn.dataset.creator;
                await this.addArchiveTrack(identifier, title, creator, true);
            });
        });
        container.querySelectorAll('.archive-add-to-library').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const identifier = btn.dataset.identifier;
                const title = btn.dataset.title;
                const creator = btn.dataset.creator;
                await this.addArchiveTrackToLibrary(identifier, title, creator);
            });
        });
        container.querySelectorAll('.archive-details-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const identifier = btn.dataset.identifier;
                Router.navigate('track', `archive:${identifier}`);
            });
        });
    }

    async addArchiveTrack(identifier, title, creator, playNow = false) {
        const trackDetails = await ArchiveApi.getTrackDetails(identifier);
        if (!trackDetails || !trackDetails.streamUrl) {
            this.showToast('Не удалось получить ссылку на трек.');
            return;
        }
        const track = {
            id: null,
            name: `${trackDetails.title} - ${trackDetails.creator}`,
            duration: trackDetails.duration,
            streamUrl: trackDetails.streamUrl,
            source: 'archive',
            archiveId: identifier
        };
        if (playNow) {
            await this.player.playNow(track);
        } else {
            await this.player.addToQueue([track]);
        }
    }

    async addArchiveTrackToLibrary(identifier, title, creator) {
        const trackDetails = await ArchiveApi.getTrackDetails(identifier);
        if (!trackDetails || !trackDetails.streamUrl) {
            this.showToast('Не удалось получить ссылку на трек.');
            return;
        }
        const track = {
            id: utils.generateId(),
            name: `${trackDetails.title} - ${trackDetails.creator}`,
            duration: trackDetails.duration,
            streamUrl: trackDetails.streamUrl,
            source: 'archive',
            archiveId: identifier
        };
        await this.db.addTrack(track);
        this.showToast('Трек добавлен в библиотеку');
    }

    async startRadio() {
        const radioKeywords = ['rock', 'jazz', 'classical', 'electronic', 'pop', 'folk', 'blues', 'ambient', 'instrumental', 'piano', 'guitar'];
        const randomKeyword = radioKeywords[Math.floor(Math.random() * radioKeywords.length)];
        const container = document.getElementById('archive-results');
        container.innerHTML = '<div>Загрузка радио...</div>';

        const results = await ArchiveApi.search(randomKeyword, 10);
        if (!results.length) {
            this.showToast('Не удалось найти треки для радио, попробуйте позже.');
            container.innerHTML = '<div>Ничего не найдено.</div>';
            return;
        }

        const trackPromises = results.map(item => ArchiveApi.getTrackDetails(item.identifier));
        const tracksDetails = await Promise.all(trackPromises);

        const tracks = tracksDetails
            .filter(details => details && details.streamUrl)
            .map(details => ({
                id: null,
                name: `${details.title} - ${details.creator}`,
                duration: details.duration,
                streamUrl: details.streamUrl,
                source: 'archive',
                archiveId: details.identifier
            }));

        if (tracks.length === 0) {
            this.showToast('Не удалось получить ссылки на треки.');
            container.innerHTML = '<div>Не удалось загрузить радио.</div>';
            return;
        }

        await this.player.clearQueue();
        this.player.addStreamTracks(tracks);
        await this.player.loadTrack(tracks[0]);
        this.player.play();

        container.innerHTML = '<div>Радио запущено! Треки добавлены в очередь.</div>';
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    showSkeleton(containerId, count = 8) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const skeletonHtml = '<div class="skeleton-item"><div class="skeleton-line" style="width: 60%"></div><div class="skeleton-line" style="width: 80%"></div><div class="skeleton-line" style="width: 40%"></div></div>'.repeat(count);
        container.innerHTML = skeletonHtml;
    }

    updateRepeatButton(mode) {
        const btn = document.getElementById('repeat-btn');
        if (!btn) return;
        const icons = {
            0: '<svg class="icon"><use href="#icon-repeat"></use></svg>',
            1: '<svg class="icon"><use href="#icon-repeat-one"></use></svg>',
            2: '<svg class="icon"><use href="#icon-repeat"></use></svg>'
        };
        btn.innerHTML = icons[mode];
        btn.classList.toggle('active', mode !== 0);
    }

    async saveQueueAsPlaylist() {
        const name = await Modal.prompt(
            'Название плейлиста:',
            `Очередь ${new Date().toLocaleString()}`,
            '',
            'Сохранить очередь'
        );
        if (name && name.trim()) {
            const trackIds = this.player.queue.filter(t => t.id).map(t => t.id);
            await this.db.addPlaylist({ name: name.trim(), tracks: trackIds });
            this.showToast(`Плейлист "${name.trim()}" создан`, 'success');
            await this.renderPlaylists();
        }
    }

    async deleteTrack(trackId) {
        const track = await this.db.getTrack(trackId);
        if (!track) return;

        const confirmed = await Modal.confirm(
            `Удалить трек "${track.name}" из библиотеки?`,
            'Удаление трека'
        );
        if (!confirmed) return;

        const queueIndex = this.player.queue.findIndex(t => t.id === trackId);
        if (queueIndex !== -1) {
            await this.player.removeFromQueue(queueIndex);
        }

        const playlists = await this.db.getAllPlaylists();
        for (const playlist of playlists) {
            const idx = playlist.tracks.indexOf(trackId);
            if (idx !== -1) {
                playlist.tracks.splice(idx, 1);
                await this.db.updatePlaylist(playlist);
                this.refreshPlaylist(playlist.id);
            }
        }

        await this.db.setTags(trackId, []);
        await this.db.deleteVolumeIntervals(trackId);
        await this.db.deleteTrack(trackId);

        if (this.player.currentTrack && this.player.currentTrack.id === trackId) {
            this.player.pause();
            this.player.currentTrack = null;
            this.player.currentIndex = -1;
            if (this.player.ui) this.player.ui.updateCurrentTrack(null);
        }

        await this.renderLibrary();
        if (this.player.queue.length === 0) {
            this.player.currentTrack = null;
            if (this.player.ui) this.player.ui.updateCurrentTrack(null);
        }

        if (window.location.hash === `#track/${trackId}`) {
            Router.navigate('library');
        }

        this.showToast('Трек удалён из библиотеки');
    }

    // Загрузка позиции навигации из БД и применение
    async loadNavPosition() {
        const position = await this.db.getSetting('nav_position') || 'top';
        this.applyNavPosition(position);
        const navSelect = document.getElementById('nav-position-select');
        if (navSelect) {
            if (navSelect.value !== position) navSelect.value = position;
            this.adjustNavPositionOptions();
        }
    }

    // Применение позиции навигации (классы body, сохранение, обновление селектора)
    applyNavPosition(position) {
        document.body.classList.remove('nav-top', 'nav-bottom', 'nav-left', 'nav-right');
        document.body.classList.add(`nav-${position}`);
        this.db.setSetting('nav_position', position).catch(console.error);
        
        // Обновляем селектор, если он существует
        const navSelect = document.getElementById('nav-position-select');
        if (navSelect && navSelect.value !== position) {
            navSelect.value = position;
        }
        
        if (window.initAllRanges) setTimeout(window.initAllRanges, 100);
    }

    adjustNavPositionOptions() {
        const isNarrow = window.innerWidth <= 768;
        const navSelect = document.getElementById('nav-position-select');
        if (!navSelect) return;

        const optionLeft = navSelect.querySelector('option[value="left"]');
        const optionRight = navSelect.querySelector('option[value="right"]');

        if (!optionLeft || !optionRight) return;

        if (isNarrow) {
            optionLeft.style.display = 'none';
            optionRight.style.display = 'none';
            const current = navSelect.value;
            if (current === 'left' || current === 'right') {
                navSelect.value = 'top';
                this.applyNavPosition('top');
            }
        } else {
            optionLeft.style.display = '';
            optionRight.style.display = '';
        }
    }

    async initNavPositionOptions() {
        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
        }
        this.adjustNavPositionOptions();
    }

    // ========== МЕТОДЫ ДЛЯ РЕДАКТОРА ИНТЕРВАЛОВ ГРОМКОСТИ ==========

    async openVolumeIntervalEditor(track) {
        let intervals = await this.db.getVolumeIntervals(track.id) || [];
        
        let modal = document.getElementById('volume-interval-editor');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'volume-interval-editor';
            modal.className = 'modal-overlay hidden';
            modal.innerHTML = `
                <div class="modal-container" style="max-width: 700px;">
                    <div class="modal-header">
                        <h3>Интервалы громкости</h3>
                        <button class="modal-close" id="interval-editor-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="interval-editor-section">
                            <label>Начало (сек):</label>
                            <input type="number" id="interval-start" step="0.1" value="0">
                            <button id="interval-set-start" class="small-btn">из текущего</button>
                        </div>
                        <div class="interval-editor-section">
                            <label>Конец (сек):</label>
                            <input type="number" id="interval-end" step="0.1" value="10">
                            <button id="interval-set-end" class="small-btn">из текущего</button>
                        </div>
                        <div class="interval-editor-section">
                            <label>Громкость (множитель):</label>
                            <input type="range" id="interval-volume" min="0.1" max="2.0" step="0.01" value="1.0">
                            <span id="interval-volume-value">1.00</span>
                        </div>
                        <div class="interval-editor-actions">
                            <button id="interval-add-btn" class="primary-btn">Добавить / Обновить</button>
                            <button id="interval-cancel-edit" class="btn-secondary">Отменить редактирование</button>
                        </div>
                        <div class="interval-list-section">
                            <h4>Список интервалов</h4>
                            <ul id="interval-list" class="interval-list"></ul>
                        </div>
                    </div>
                    <div class="modal-buttons">
                        <button id="interval-save-close" class="modal-btn modal-btn-primary">Закрыть</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            this.attachIntervalEditorEvents(track);
        }
                
        this.refreshIntervalList(intervals);
        this.currentIntervalEditIndex = -1;
        this.intervalEditorTrackId = track.id;
        this.intervalEditorIntervals = intervals;
        
        modal.classList.remove('hidden');
    }

    attachIntervalEditorEvents(track) {
        const modal = document.getElementById('volume-interval-editor');
        if (modal._eventsAttached) return;
        modal._eventsAttached = true;
        
        const closeModal = () => {
            modal.classList.add('hidden');
            // Таймеров больше нет, очищать нечего
        };
        modal.querySelector('#interval-editor-close').addEventListener('click', closeModal);
        modal.querySelector('#interval-save-close').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        
        const volumeSlider = modal.querySelector('#interval-volume');
        const volumeSpan = modal.querySelector('#interval-volume-value');
        volumeSlider.addEventListener('input', () => {
            volumeSpan.textContent = volumeSlider.value;
        });
        
        modal.querySelector('#interval-set-start').addEventListener('click', () => {
            if (this.player.currentTrack && this.player.currentTrack.id === track.id) {
                document.getElementById('interval-start').value = this.player.audio.currentTime.toFixed(1);
            }
        });
        modal.querySelector('#interval-set-end').addEventListener('click', () => {
            if (this.player.currentTrack && this.player.currentTrack.id === track.id) {
                document.getElementById('interval-end').value = this.player.audio.currentTime.toFixed(1);
            }
        });
        
        modal.querySelector('#interval-add-btn').addEventListener('click', async () => {
            const start = parseFloat(document.getElementById('interval-start').value);
            const end = parseFloat(document.getElementById('interval-end').value);
            const volume = parseFloat(volumeSlider.value);
            if (isNaN(start) || isNaN(end) || start >= end) {
                Modal.alert('Начало должно быть меньше конца', 'Ошибка');
                return;
            }
            const newInterval = { start, end, volume };
            let intervals = this.intervalEditorIntervals;
            const editIndex = this.currentIntervalEditIndex;
            if (editIndex >= 0) {
                intervals[editIndex] = newInterval;
            } else {
                const overlaps = intervals.some((inv) => (start < inv.end && end > inv.start));
                if (overlaps) {
                    Modal.alert('Интервал пересекается с существующим. Отредактируйте или удалите старый.', 'Конфликт');
                    return;
                }
                intervals.push(newInterval);
            }
            intervals.sort((a,b) => a.start - b.start);
            await this.player.updateVolumeIntervals(track.id, intervals);
            this.intervalEditorIntervals = intervals;
            this.refreshIntervalList(intervals);
            this.currentIntervalEditIndex = -1;
            document.getElementById('interval-add-btn').textContent = 'Добавить / Обновить';
        });
        
        modal.querySelector('#interval-cancel-edit').addEventListener('click', () => {
            this.currentIntervalEditIndex = -1;
            document.getElementById('interval-add-btn').textContent = 'Добавить / Обновить';
            document.getElementById('interval-start').value = '';
            document.getElementById('interval-end').value = '';
            volumeSlider.value = '1.0';
            volumeSpan.textContent = '1.00';
        });
    }

    refreshIntervalList(intervals) {
        const list = document.getElementById('interval-list');
        if (!list) return;
        list.innerHTML = '';
        intervals.forEach((inv, idx) => {
            const li = document.createElement('li');
            li.className = 'interval-list-item';
            li.innerHTML = `
                <span>${inv.start.toFixed(1)}с – ${inv.end.toFixed(1)}с, громкость ×${inv.volume.toFixed(2)}</span>
                <div class="interval-item-buttons">
                    <button class="interval-edit" data-index="${idx}" title="Редактировать">
                        <svg class="icon"><use href="#icon-edit"></use></svg>
                    </button>
                    <button class="interval-delete" data-index="${idx}" title="Удалить">
                        <svg class="icon"><use href="#icon-trash"></use></svg>
                    </button>
                </div>
            `;
            list.appendChild(li);
        });
        list.querySelectorAll('.interval-edit').forEach(btn => {
            btn.addEventListener('click', async () => {
                const idx = parseInt(btn.dataset.index);
                const inv = intervals[idx];
                document.getElementById('interval-start').value = inv.start;
                document.getElementById('interval-end').value = inv.end;
                document.getElementById('interval-volume').value = inv.volume;
                document.getElementById('interval-volume-value').textContent = inv.volume;
                this.currentIntervalEditIndex = idx;
                document.getElementById('interval-add-btn').textContent = 'Обновить';
            });
        });
        list.querySelectorAll('.interval-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const idx = parseInt(btn.dataset.index);
                intervals.splice(idx, 1);
                await this.player.updateVolumeIntervals(this.intervalEditorTrackId, intervals);
                this.intervalEditorIntervals = intervals;
                this.refreshIntervalList(intervals);
            });
        });
    }
};
