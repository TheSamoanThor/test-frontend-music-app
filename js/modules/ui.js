var UI = class UI {
    constructor(db, player, fileHandler, themeManager) {
        this.db = db;
        this.player = player;
        this.fileHandler = fileHandler;
        this.themeManager = themeManager;
        this.currentFilterTags = [];
        this.searchTerm = ''; // для поиска по имени

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
            const settingsSelect = document.getElementById('theme-select-settings');
            if (settingsSelect) settingsSelect.value = e.target.value;
        });
        document.getElementById('custom-color').addEventListener('input', (e) => {
            this.themeManager.applyCustomColor(e.target.value);
            this.themeManager.saveToDB(this.db);
            const settingsColor = document.getElementById('custom-color-settings');
            if (settingsColor) settingsColor.value = e.target.value;
        });

        // Фильтр по тегам (с debounce)
        const tagFilterInput = document.getElementById('tag-filter');
        if (tagFilterInput) {
            tagFilterInput.addEventListener('input', utils.debounce((e) => {
                this.currentFilterTags = utils.parseTags(e.target.value);
                this.renderLibrary();
            }, 300));
        }

        // Кнопка "Применить" (оставляем для явного применения)
        document.getElementById('apply-filter').addEventListener('click', () => {
            const value = document.getElementById('tag-filter').value;
            this.currentFilterTags = utils.parseTags(value);
            this.renderLibrary();
        });

        // Поиск по имени (с debounce)
        const searchInput = document.getElementById('search-name');
        if (searchInput) {
            searchInput.addEventListener('input', utils.debounce((e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.renderLibrary();
            }, 300));
        }

        // Управление плеером
        document.getElementById('play-pause').addEventListener('click', () => this.player.togglePlay());
        document.getElementById('prev').addEventListener('click', () => this.player.prev());
        document.getElementById('next').addEventListener('click', () => this.player.next());
        document.getElementById('volume').addEventListener('input', (e) => this.player.setVolume(e.target.value));
        document.getElementById('progress').addEventListener('input', (e) => this.player.seek(e.target.value));

        // Управление очередью
        document.getElementById('shuffle-queue').addEventListener('click', () => this.player.shuffleQueue());
        document.getElementById('clear-queue').addEventListener('click', () => this.player.clearQueue());
        document.getElementById('add-random').addEventListener('click', () => this.player.addRandomFromLibrary());

        // Делегированный обработчик для удаления правил громкости
        document.addEventListener('click', async (e) => {
            if (e.target.classList.contains('delete-tag-volume')) {
                const tag = e.target.dataset.tag;
                await this.db.deleteTagVolume(tag);
                this.renderTagVolumeSettings();
            }
        });

        // Форма добавления правила громкости
        document.getElementById('add-tag-volume-btn')?.addEventListener('click', async () => {
            const tag = document.getElementById('new-volume-tag').value.trim();
            const vol = parseFloat(document.getElementById('new-volume-factor').value);
            if (tag && !isNaN(vol) && vol >= 0 && vol <= 2) {
                await this.db.setTagVolume(tag, vol);
                this.renderTagVolumeSettings();
                document.getElementById('new-volume-tag').value = '';
                document.getElementById('new-volume-factor').value = '1.0';
            } else {
                alert('Введите корректный тег и коэффициент (0.0 – 2.0)');
            }
        });
    }

    // Синхронизирует поле фильтра с текущим набором тегов
    syncFilterInput() {
        const input = document.getElementById('tag-filter');
        if (input) {
            input.value = this.currentFilterTags.join(', ');
        }
    }

    async renderLibrary() {
        // Обновляем поле фильтра, чтобы оно отображало актуальные теги
        this.syncFilterInput();

        const allTracks = await this.db.getAllTracks();
        let filtered = allTracks;

        // Фильтр по тегам
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

        // Фильтр по имени
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
            li.innerHTML = `
                <span><strong>${track.name}</strong> (${utils.formatTime(track.duration)})</span>
                <div class="track-tags">🏷️ ${tags.join(', ') || 'без тегов'}</div>
                <div>
                    <input type="text" placeholder="новый тег" class="tag-input" data-id="${track.id}">
                    <button class="add-tag-btn" data-id="${track.id}">➕ Добавить</button>
                    <button class="exclude-btn" data-id="${track.id}">${isExcluded ? '✅ Включить' : '🚫 Исключить'}</button>
                    <button class="play-now-btn" data-id="${track.id}">▶ В очередь</button>
                    <button class="details-btn" data-id="${track.id}">🔍 Подробнее</button>
                </div>
            `;
            listEl.appendChild(li);
        }

        // Обработчики для добавления тега
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

        // Обработчики для исключения/включения
        document.querySelectorAll('.exclude-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
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
            });
        });

        // Обработчики для добавления в очередь
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

        // Обработчики для деталей
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
            this.syncSettingsPage();
        };
        input.click();
    }

    // Синхронизация страницы настроек
    async syncSettingsPage() {
        const preset = await this.db.getSetting('theme-preset') || 'light';
        const color = await this.db.getSetting('theme-custom-color') || '#4a90e2';
        
        const themeSelect = document.getElementById('theme-select-settings');
        const colorInput = document.getElementById('custom-color-settings');
        if (themeSelect) themeSelect.value = preset;
        if (colorInput) colorInput.value = color;

        // Загружаем список исключённых треков (по тегу '🚫 excluded')
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

        await this.renderTagVolumeSettings();
    }

    async renderTagVolumeSettings() {
        const container = document.getElementById('tag-volume-settings');
        if (!container) return;
        const rules = await this.db.getAllTagVolumes();
        let html = '<h4>Текущие правила</h4>';
        if (rules.length === 0) {
            html += '<p>Пока нет правил громкости для тегов.</p>';
        } else {
            html += '<ul>';
            for (let rule of rules) {
                html += `<li>${rule.tag} : ${rule.volume} <button class="delete-tag-volume" data-tag="${rule.tag}">Удалить</button></li>`;
            }
            html += '</ul>';
        }
        html += `
            <h4>Добавить правило</h4>
            <div style="display: flex; gap: 0.5rem;">
                <input type="text" id="new-volume-tag" placeholder="тег">
                <input type="number" id="new-volume-factor" step="0.1" min="0" max="2" value="1.0" style="width: 80px;">
                <button id="add-tag-volume-btn">Добавить</button>
            </div>
        `;
        container.innerHTML = html;
    }

    // Загрузка детальной информации о треке
    async loadTrackDetail(trackId) {
        const track = await this.db.getTrack(trackId);
        if (!track) {
            Router.navigate('library');
            return;
        }

        const tags = await this.db.getTags(trackId);
        const isExcluded = tags.includes('🚫 excluded');

        const container = document.getElementById('track-detail-container');
        container.innerHTML = `
            <div class="track-detail">
                <h3>${track.name}</h3>
                <p><strong>Длительность:</strong> ${utils.formatTime(track.duration)}</p>
                <p><strong>Путь:</strong> ${track.path || 'неизвестно'}</p>
                <p><strong>Теги:</strong> ${tags.join(', ') || 'нет'}</p>
                <p><strong>Исключён:</strong> ${isExcluded ? 'да' : 'нет'}</p>
                <div class="track-detail-actions">
                    <button id="detail-add-tag">➕ Добавить тег</button>
                    <input type="text" id="detail-new-tag" placeholder="новый тег">
                    <button id="detail-toggle-exclude">${isExcluded ? '✅ Вернуть в случайный выбор' : '🚫 Исключить из случайного выбора'}</button>
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
                this.loadTrackDetail(trackId);
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
        });

        document.getElementById('detail-add-to-queue').addEventListener('click', async () => {
            await this.player.addToQueue([trackId]);
        });

        document.getElementById('detail-play-now').addEventListener('click', async () => {
            await this.player.addToQueue([trackId]);
            if (this.player.queue.length === 1) {
                this.player.currentIndex = 0;
                await this.player.loadTrack(trackId);
                this.player.play();
            } else {
                alert('Трек добавлен в очередь');
            }
        });
    }
};