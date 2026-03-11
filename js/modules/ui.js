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
        this.popup = null;
        this.playerVisualizerCallback = null; // для визуализатора в плеере

        this.initEventListeners();
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

        document.getElementById('play-pause').addEventListener('click', () => this.player.togglePlay());
        document.getElementById('prev').addEventListener('click', () => this.player.prev());
        document.getElementById('next').addEventListener('click', () => this.player.next());
        document.getElementById('volume').addEventListener('input', (e) => this.player.setVolume(e.target.value));
        document.getElementById('progress').addEventListener('input', (e) => this.player.seek(e.target.value));

        document.getElementById('shuffle-queue').addEventListener('click', () => this.player.shuffleQueue());
        document.getElementById('clear-queue').addEventListener('click', () => this.player.clearQueue());
        document.getElementById('add-random').addEventListener('click', () => this.player.addRandomFromLibrary());
        document.getElementById('add-random-10').addEventListener('click', () => this.player.addRandomTracks(10));

        document.addEventListener('click', async (e) => {
            if (e.target.classList.contains('remove-tag-btn')) {
                const trackId = e.target.dataset.trackId;
                const tagToRemove = e.target.dataset.tag;
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
            // Клик по треку в библиотеке -> переход на страницу деталей
            else if (e.target.closest('.track-item') && !e.target.closest('button')) {
                const trackItem = e.target.closest('.track-item');
                const trackId = trackItem.querySelector('.add-tag-btn')?.dataset.id;
                if (trackId) {
                    Router.navigate('track', trackId);
                }
            }
        });

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

        // Клик по плашке текущего трека (футер)
        document.getElementById('player-bar').addEventListener('click', (e) => {
            if (e.target.closest('button') || e.target.closest('input')) return;
            if (this.player.currentTrack) {
                this.popup.showForCurrentTrack();
            }
        });

        // Кнопка создания плейлиста
        document.getElementById('create-playlist')?.addEventListener('click', () => {
            this.createPlaylistDialog();
        });
    }

    initPopup(popup) {
        this.popup = popup;
    }

    // Регистрация визуализатора для плеера
    registerPlayerVisualizer() {
        if (this.player) {
            this.playerVisualizerCallback = (dataArray) => {
                this.drawPlayerVisualizer(dataArray);
            };
            this.player.registerVisualizerCallback(this.playerVisualizerCallback);
        }
    }

    // Отрисовка визуализатора на маленьком canvas плеера
    drawPlayerVisualizer(dataArray) {
        const canvas = document.getElementById('player-visualizer');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        if (!dataArray) return;

        const barCount = 8;
        const barWidth = width / barCount;
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#4a90e2';

        for (let i = 0; i < barCount; i++) {
            const start = Math.floor(i * dataArray.length / barCount);
            const end = Math.floor((i + 1) * dataArray.length / barCount);
            let sum = 0;
            for (let j = start; j < end; j++) {
                sum += dataArray[j];
            }
            const avg = sum / (end - start) / 255;
            const barHeight = avg * height;
            const x = i * barWidth;
            const y = height - barHeight;

            ctx.fillStyle = primaryColor;
            ctx.globalAlpha = 0.7 + 0.3 * avg;
            ctx.fillRect(x, y, barWidth - 1, barHeight);
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
            const isExcluded = tags.includes('🚫 excluded');
            const li = document.createElement('li');
            li.className = 'track-item';
            li.setAttribute('draggable', 'true');
            li.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', track.id);
            });
            const tagsHtml = tags.length > 0 
                ? tags.map(t => `<span class="tag-badge">${t} <button class="remove-tag-btn" data-track-id="${track.id}" data-tag="${t}">✖</button></span>`).join(' ')
                : 'без тегов';
            li.innerHTML = `
                <span><strong>${track.name}</strong> (${utils.formatTime(track.duration)})</span>
                <div class="track-tags">🏷️ ${tagsHtml}</div>
                <div>
                    <button class="add-tag-btn" data-id="${track.id}">➕ Добавить</button>
                    <input type="text" placeholder="новый тег" class="tag-input" data-id="${track.id}">
                    <button class="exclude-btn" data-id="${track.id}">${isExcluded ? '✅ Включить' : '🚫 Исключить'}</button>
                    <button class="play-now-btn" data-id="${track.id}">▶ В очередь</button>
                    <button class="play-immediate-btn" data-id="${track.id}">▶ Сейчас</button>
                    <button class="add-to-playlist-btn" data-id="${track.id}">📋 В плейлист</button>
                    <button class="details-btn" data-id="${track.id}">🔍 Подробнее</button>
                </div>
            `;
            listEl.appendChild(li);
        }

        document.querySelectorAll('.add-tag-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.target.dataset.id;
                const input = e.target.parentElement.querySelector('.tag-input');
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
                    }
                }
            });
        });

        document.querySelectorAll('.exclude-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.target.dataset.id;
                const tags = await this.db.getTags(id);
                const excludedTag = '🚫 excluded';
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

        document.querySelectorAll('.play-now-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.target.dataset.id;
                await this.player.addToQueue([id]);
                if (this.player.queue.length === 1) {
                    this.player.currentIndex = 0;
                    await this.player.loadTrack(id);
                    this.player.play();
                }
            });
        });

        // Новая кнопка "▶ Сейчас"
        document.querySelectorAll('.play-immediate-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.target.dataset.id;
                await this.player.playNow(id);
            });
        });

        // Новая кнопка "📋 В плейлист"
        document.querySelectorAll('.add-to-playlist-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const trackId = e.target.dataset.id;
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
                        if (!playlist.tracks.includes(trackId)) {
                            playlist.tracks.push(trackId);
                            await this.db.updatePlaylist(playlist);
                            alert('Трек добавлен в плейлист');
                        } else {
                            alert('Трек уже есть в плейлисте');
                        }
                    }
                }
            });
        });

        document.querySelectorAll('.details-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = e.target.dataset.id;
                Router.navigate('track', id);
            });
        });
    }

    async renderQueue(queueIds) {
        const listEl = document.getElementById('queue-list');
        listEl.innerHTML = '';

        for (let i = 0; i < queueIds.length; i++) {
            const track = await this.db.getTrack(queueIds[i]);
            if (!track) continue;
            const li = document.createElement('li');
            li.className = 'queue-item';
            li.dataset.id = track.id;
            li.innerHTML = `
                <span>${track.name}</span>
                <div class="queue-controls">
                    <button class="queue-up" data-index="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
                    <button class="queue-down" data-index="${i}" ${i === queueIds.length-1 ? 'disabled' : ''}>↓</button>
                    <button class="queue-remove" data-index="${i}">✖</button>
                </div>
            `;
            listEl.appendChild(li);
        }

        document.querySelectorAll('.queue-up').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = parseInt(e.target.dataset.index);
                if (index > 0) {
                    [this.player.queue[index-1], this.player.queue[index]] = [this.player.queue[index], this.player.queue[index-1]];
                    if (this.player.currentIndex === index) this.player.currentIndex--;
                    else if (this.player.currentIndex === index-1) this.player.currentIndex++;
                    await this.db.setQueue(this.player.queue);
                    this.renderQueue(this.player.queue);
                }
            });
        });

        document.querySelectorAll('.queue-down').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = parseInt(e.target.dataset.index);
                if (index < this.player.queue.length - 1) {
                    [this.player.queue[index], this.player.queue[index+1]] = [this.player.queue[index+1], this.player.queue[index]];
                    if (this.player.currentIndex === index) this.player.currentIndex++;
                    else if (this.player.currentIndex === index+1) this.player.currentIndex--;
                    await this.db.setQueue(this.player.queue);
                    this.renderQueue(this.player.queue);
                }
            });
        });

        document.querySelectorAll('.queue-remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = parseInt(e.target.dataset.index);
                await this.player.removeFromQueue(index);
            });
        });

        DragDrop.initQueue(this);
    }

    updateCurrentTrack(track, pictureUrl) {
        const nameEl = document.getElementById('current-track-name');
        nameEl.textContent = track ? `🎵 ${track.name}` : '🎵 Не выбрано';

        const coverImg = document.getElementById('current-track-cover');
        const visualizerCanvas = document.getElementById('player-visualizer');
        const noCoverSpan = document.querySelector('.no-cover');

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
    }

    setPlayPauseIcon(playing) {
        document.getElementById('play-pause').textContent = playing ? '⏸️' : '▶️';
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

        const allTracks = await this.db.getAllTracks();
        const excludedList = document.getElementById('excluded-tracks-list');
        excludedList.innerHTML = '';

        for (let track of allTracks) {
            const tags = await this.db.getTags(track.id);
            if (tags.includes('🚫 excluded')) {
                const li = document.createElement('li');
                li.className = 'excluded-item';
                li.innerHTML = `
                    <span>${track.name}</span>
                    <button class="remove-exclusion" data-id="${track.id}">✖ Убрать исключение</button>
                `;
                excludedList.appendChild(li);
            }
        }

        document.querySelectorAll('.remove-exclusion').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                const tags = await this.db.getTags(id);
                const newTags = tags.filter(t => t !== '🚫 excluded');
                await this.db.setTags(id, newTags);
                this.syncSettingsPage();
            });
        });

        await this.renderThemeFineTuning();
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

    async loadTrackDetail(trackId) {
        const track = await this.db.getTrack(trackId);
        if (!track) {
            Router.navigate('library');
            return;
        }

        const tags = await this.db.getTags(trackId);
        const isExcluded = tags.includes('🚫 excluded');

        const file = await this.fileHandler.getFileForTrack(track);
        let pictureUrl = null;
        if (file) {
            pictureUrl = await this.fileHandler.getPictureBlobUrl(file);
        }

        const container = document.getElementById('track-detail-container');
        const tagsHtml = tags.length > 0 
            ? tags.map(t => `<span class="tag-badge">${t} <button class="remove-tag-btn" data-track-id="${trackId}" data-tag="${t}">✖</button></span>`).join(' ')
            : 'нет';

        const coverHtml = pictureUrl 
            ? `<img src="${pictureUrl}" alt="cover" class="track-detail-cover" style="max-width: 200px; max-height: 200px; border-radius: 8px;">`
            : '<div class="track-detail-cover no-cover">🎵</div>';

        container.innerHTML = `
            <div class="track-detail">
                ${coverHtml}
                <h3>${track.name}</h3>
                <p><strong>Длительность:</strong> ${utils.formatTime(track.duration)}</p>
                <p><strong>Путь:</strong> ${track.path || 'неизвестно'}</p>
                <p><strong>Теги:</strong> ${tagsHtml}</p>
                <p><strong>Исключён:</strong> ${isExcluded ? 'да' : 'нет'}</p>
                <div class="track-detail-actions">
                    <button id="detail-add-tag">➕ Добавить тег</button>
                    <input type="text" id="detail-new-tag" placeholder="новый тег">
                    <button id="detail-toggle-exclude">${isExcluded ? '✅ Вернуть в случайный выбор' : '🚫 Исключить из случайного выбора'}</button>
                    <button id="detail-add-to-queue">➕ В очередь</button>
                    <button id="detail-play-now">▶ Воспроизвести сейчас</button>
                    <button id="detail-add-to-playlist">📋 В плейлист</button>
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

        document.getElementById('detail-add-tag').addEventListener('click', async () => {
            const newTag = document.getElementById('detail-new-tag').value.trim();
            if (newTag && !tags.includes(newTag)) {
                tags.push(newTag);
                await this.db.setTags(trackId, tags);
                this.loadTrackDetail(trackId);
                if (this.player.currentTrack && this.player.currentTrack.id === trackId) {
                    await this.player.updateEffectiveVolume();
                }
            }
        });

        document.getElementById('detail-toggle-exclude').addEventListener('click', async () => {
            const excludedTag = '🚫 excluded';
            if (tags.includes(excludedTag)) {
                const newTags = tags.filter(t => t !== excludedTag);
                await this.db.setTags(trackId, newTags);
            } else {
                tags.push(excludedTag);
                await this.db.setTags(trackId, tags);
            }
            this.loadTrackDetail(trackId);
            if (this.player.currentTrack && this.player.currentTrack.id === trackId) {
                await this.player.updateEffectiveVolume();
            }
        });

        document.getElementById('detail-add-to-queue').addEventListener('click', async () => {
            await this.player.addToQueue([trackId]);
        });

        document.getElementById('detail-play-now').addEventListener('click', async () => {
            await this.player.playNow(trackId);
        });

        document.getElementById('detail-add-to-playlist').addEventListener('click', async () => {
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
                    if (!playlist.tracks.includes(trackId)) {
                        playlist.tracks.push(trackId);
                        await this.db.updatePlaylist(playlist);
                        alert('Трек добавлен в плейлист');
                    } else {
                        alert('Трек уже есть в плейлисте');
                    }
                }
            }
        });
    }

    // --- Методы для плейлистов ---

    async renderPlaylists() {
        const container = document.getElementById('playlists-list');
        if (!container) return;
        const playlists = await this.db.getAllPlaylists();
        container.innerHTML = '';
        for (let pl of playlists) {
            const plDiv = document.createElement('div');
            plDiv.className = 'playlist-item';
            plDiv.innerHTML = `
                <div class="playlist-header">
                    <strong>${pl.name}</strong>
                    <div class="playlist-actions">
                        <button class="playlist-load" data-id="${pl.id}">▶ Загрузить в очередь</button>
                        <button class="playlist-delete" data-id="${pl.id}">🗑️ Удалить</button>
                    </div>
                </div>
                <div class="playlist-tracks" id="playlist-tracks-${pl.id}" style="display: none;"></div>
            `;
            // Обработчик для разворачивания списка треков
            plDiv.querySelector('.playlist-header').addEventListener('click', async (e) => {
                if (e.target.closest('button')) return;
                const tracksDiv = plDiv.querySelector('.playlist-tracks');
                if (tracksDiv.style.display === 'none') {
                    tracksDiv.style.display = 'block';
                    await this.renderPlaylistTracks(pl.id, tracksDiv);
                } else {
                    tracksDiv.style.display = 'none';
                }
            });
            container.appendChild(plDiv);

            // Обработчики кнопок
            plDiv.querySelector('.playlist-load').addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.target.dataset.id;
                const playlist = await this.db.getPlaylist(id);
                if (playlist && playlist.tracks.length) {
                    await this.player.addToQueue(playlist.tracks);
                }
            });

            plDiv.querySelector('.playlist-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = e.target.dataset.id;
                if (confirm('Удалить плейлист?')) {
                    await this.db.deletePlaylist(id);
                    this.renderPlaylists();
                }
            });
        }
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
            trackDiv.innerHTML = `
                <span>${track.name}</span>
                <div class="playlist-track-controls">
                    <button class="playlist-track-up" data-playlist="${playlistId}" data-index="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
                    <button class="playlist-track-down" data-playlist="${playlistId}" data-index="${i}" ${i === playlist.tracks.length-1 ? 'disabled' : ''}>↓</button>
                    <button class="playlist-track-remove" data-playlist="${playlistId}" data-index="${i}">✖</button>
                </div>
            `;
            container.appendChild(trackDiv);
        }

        container.querySelectorAll('.playlist-track-up').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const playlistId = e.target.dataset.playlist;
                const index = parseInt(e.target.dataset.index);
                if (index > 0) {
                    const playlist = await this.db.getPlaylist(playlistId);
                    [playlist.tracks[index-1], playlist.tracks[index]] = [playlist.tracks[index], playlist.tracks[index-1]];
                    await this.db.updatePlaylist(playlist);
                    this.renderPlaylists();
                }
            });
        });

        container.querySelectorAll('.playlist-track-down').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const playlistId = e.target.dataset.playlist;
                const index = parseInt(e.target.dataset.index);
                const playlist = await this.db.getPlaylist(playlistId);
                if (index < playlist.tracks.length - 1) {
                    [playlist.tracks[index], playlist.tracks[index+1]] = [playlist.tracks[index+1], playlist.tracks[index]];
                    await this.db.updatePlaylist(playlist);
                    this.renderPlaylists();
                }
            });
        });

        container.querySelectorAll('.playlist-track-remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const playlistId = e.target.dataset.playlist;
                const index = parseInt(e.target.dataset.index);
                const playlist = await this.db.getPlaylist(playlistId);
                playlist.tracks.splice(index, 1);
                await this.db.updatePlaylist(playlist);
                this.renderPlaylists();
            });
        });
    }

    createPlaylistDialog() {
        const name = prompt('Введите название плейлиста:');
        if (name) {
            this.db.addPlaylist({ name, tracks: [] });
            this.renderPlaylists();
        }
    }
};