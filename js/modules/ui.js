var UI = class UI {
    constructor(db, player, fileHandler, themeManager) {
        this.db = db;
        this.player = player;
        this.fileHandler = fileHandler;
        this.themeManager = themeManager;
        this.currentFilterTags = [];

        this.initEventListeners();
    }

    initEventListeners() {
        document.getElementById('select-music-btn').addEventListener('click', async () => {
            const tracks = await this.fileHandler.pickDirectory();
            if (tracks.length) this.renderLibrary();
        });

        // Экспорт/импорт (основные кнопки в шапке)
        document.getElementById('export-btn').addEventListener('click', () => this.exportData());
        document.getElementById('import-btn').addEventListener('click', () => this.importData());

        // Тема (основные элементы в шапке)
        document.getElementById('theme-select').addEventListener('change', (e) => {
            this.themeManager.applyPreset(e.target.value);
            this.themeManager.saveToDB(this.db);
            // синхронизируем селект в настройках
            const settingsSelect = document.getElementById('theme-select-settings');
            if (settingsSelect) settingsSelect.value = e.target.value;
        });
        document.getElementById('custom-color').addEventListener('input', (e) => {
            this.themeManager.applyCustomColor(e.target.value);
            this.themeManager.saveToDB(this.db);
            const settingsColor = document.getElementById('custom-color-settings');
            if (settingsColor) settingsColor.value = e.target.value;
        });

        document.getElementById('apply-filter').addEventListener('click', () => {
            this.currentFilterTags = utils.parseTags(document.getElementById('tag-filter').value);
            this.renderLibrary();
        });

        document.getElementById('play-pause').addEventListener('click', () => this.player.togglePlay());
        document.getElementById('prev').addEventListener('click', () => this.player.prev());
        document.getElementById('next').addEventListener('click', () => this.player.next());
        document.getElementById('volume').addEventListener('input', (e) => this.player.setVolume(e.target.value));
        document.getElementById('progress').addEventListener('input', (e) => this.player.seek(e.target.value));

        document.getElementById('shuffle-queue').addEventListener('click', () => this.player.shuffleQueue());
        document.getElementById('clear-queue').addEventListener('click', () => this.player.clearQueue());
        document.getElementById('add-random').addEventListener('click', () => this.player.addRandomFromLibrary());
    }

    async renderLibrary() {
        const allTracks = await this.db.getAllTracks();
        let filtered = allTracks;

        if (this.currentFilterTags.length > 0) {
            const trackTagPromises = allTracks.map(async track => ({
                track,
                tags: await this.db.getTags(track.id)
            }));
            const trackTags = await Promise.all(trackTagPromises);
            filtered = trackTags
                .filter(item => this.currentFilterTags.every(tag => item.tags.includes(tag)))
                .map(item => item.track);
        }

        const listEl = document.getElementById('track-list');
        listEl.innerHTML = '';

        for (let track of filtered) {
            const tags = await this.db.getTags(track.id);
            const li = document.createElement('li');
            li.className = 'track-item';
            li.innerHTML = `
                <span><strong>${track.name}</strong> (${utils.formatTime(track.duration)})</span>
                <div class="track-tags">🏷️ ${tags.join(', ') || 'без тегов'}</div>
                <div>
                    <input type="text" placeholder="новый тег" class="tag-input" data-id="${track.id}">
                    <button class="add-tag-btn" data-id="${track.id}">➕ Добавить</button>
                    <button class="exclude-btn" data-id="${track.id}">🚫 Исключить</button>
                    <button class="play-now-btn" data-id="${track.id}">▶ В очередь</button>
                    <button class="details-btn" data-id="${track.id}">🔍 Подробнее</button>
                </div>
            `;
            listEl.appendChild(li);
        }

        document.querySelectorAll('.add-tag-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                const input = e.target.parentElement.querySelector('.tag-input');
                const newTag = input.value.trim();
                if (newTag) {
                    const currentTags = await this.db.getTags(id);
                    if (!currentTags.includes(newTag)) {
                        currentTags.push(newTag);
                        await this.db.setTags(id, currentTags);
                        this.renderLibrary();
                    }
                }
            });
        });

        document.querySelectorAll('.exclude-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                await this.db.setExclusion(id, { until: 0 });
                alert('Трек исключён из случайного выбора');
                this.renderLibrary(); // обновим, чтобы увидеть изменения (возможно подсветку)
            });
        });

        document.querySelectorAll('.play-now-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                await this.player.addToQueue([id]);
                if (this.player.queue.length === 1) {
                    this.player.currentIndex = 0;
                    await this.player.loadTrack(id);
                    this.player.play();
                }
            });
        });

        document.querySelectorAll('.details-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
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
    }

    updateCurrentTrack(track) {
        const el = document.getElementById('current-track-name');
        el.textContent = track ? `🎵 ${track.name}` : '🎵 Не выбрано';
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
            this.syncSettingsPage(); // обновим страницу настроек
        };
        input.click();
    }

    // Синхронизация страницы настроек с текущими значениями
    async syncSettingsPage() {
        // тема и цвет уже установлены в менеджере, просто синхронизируем элементы
        const preset = await this.db.getSetting('theme-preset') || 'light';
        const color = await this.db.getSetting('theme-custom-color') || '#4a90e2';
        
        const themeSelect = document.getElementById('theme-select-settings');
        const colorInput = document.getElementById('custom-color-settings');
        if (themeSelect) themeSelect.value = preset;
        if (colorInput) colorInput.value = color;

        // Загружаем список исключённых треков
        const exclusions = await this.db.getAllExclusions();
        const excludedList = document.getElementById('excluded-tracks-list');
        excludedList.innerHTML = '';

        for (let exclusion of exclusions) {
            const track = await this.db.getTrack(exclusion.id);
            if (!track) continue;
            const li = document.createElement('li');
            li.className = 'excluded-item';
            li.innerHTML = `
                <span>${track.name}</span>
                <button class="remove-exclusion" data-id="${track.id}">✖ Убрать исключение</button>
            `;
            excludedList.appendChild(li);
        }

        document.querySelectorAll('.remove-exclusion').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                await this.db.removeExclusion(id);
                this.syncSettingsPage(); // обновим список
            });
        });
    }

    // Загрузка детальной информации о треке
    async loadTrackDetail(trackId) {
        const track = await this.db.getTrack(trackId);
        if (!track) {
            Router.navigate('library');
            return;
        }

        const tags = await this.db.getTags(trackId);
        const exclusion = await this.db.getExclusion(trackId);

        const container = document.getElementById('track-detail-container');
        container.innerHTML = `
            <div class="track-detail">
                <h3>${track.name}</h3>
                <p><strong>Длительность:</strong> ${utils.formatTime(track.duration)}</p>
                <p><strong>Путь:</strong> ${track.path || 'неизвестно'}</p>
                <p><strong>Теги:</strong> ${tags.join(', ') || 'нет'}</p>
                <p><strong>Исключён:</strong> ${exclusion ? 'да' : 'нет'}</p>
                <div class="track-detail-actions">
                    <button id="detail-add-tag">➕ Добавить тег</button>
                    <input type="text" id="detail-new-tag" placeholder="новый тег">
                    <button id="detail-toggle-exclude">${exclusion ? '✅ Вернуть в случайный выбор' : '🚫 Исключить из случайного выбора'}</button>
                    <button id="detail-add-to-queue">➕ В очередь</button>
                    <button id="detail-play-now">▶ Воспроизвести сейчас</button>
                </div>
            </div>
        `;

        document.getElementById('detail-add-tag').addEventListener('click', async () => {
            const newTag = document.getElementById('detail-new-tag').value.trim();
            if (newTag && !tags.includes(newTag)) {
                tags.push(newTag);
                await this.db.setTags(trackId, tags);
                this.loadTrackDetail(trackId); // обновим
            }
        });

        document.getElementById('detail-toggle-exclude').addEventListener('click', async () => {
            const current = await this.db.getExclusion(trackId);
            if (current) {
                await this.db.removeExclusion(trackId);
            } else {
                await this.db.setExclusion(trackId, { until: 0 });
            }
            this.loadTrackDetail(trackId);
        });

        document.getElementById('detail-add-to-queue').addEventListener('click', async () => {
            await this.player.addToQueue([trackId]);
        });

        document.getElementById('detail-play-now').addEventListener('click', async () => {
            // Добавляем в очередь и начинаем воспроизведение, если это первый трек
            await this.player.addToQueue([trackId]);
            if (this.player.queue.length === 1) {
                this.player.currentIndex = 0;
                await this.player.loadTrack(trackId);
                this.player.play();
            } else {
                // Можно также переключиться на этот трек, но для простоты просто добавляем
                alert('Трек добавлен в очередь');
            }
        });
    }
};