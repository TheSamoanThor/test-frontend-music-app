var UI = class UI {
    constructor(db, player, fileHandler, themeManager) {
        this.db = db;
        this.player = player;
        this.fileHandler = fileHandler;
        this.themeManager = themeManager;
        this.currentFilterTags = [];
        this.searchTerm = '';

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

        // Глобальный обработчик для удаления тегов и правил громкости
        document.addEventListener('click', async (e) => {
            if (e.target.classList.contains('delete-tag-volume')) {
                const tag = e.target.dataset.tag;
                await this.db.deleteTagVolume(tag);
                this.renderTagVolumeSettings();
            }
            else if (e.target.classList.contains('remove-tag-btn')) {
                const trackId = e.target.dataset.trackId;
                const tagToRemove = e.target.dataset.tag;
                const tags = await this.db.getTags(trackId);
                const newTags = tags.filter(t => t !== tagToRemove);
                await this.db.setTags(trackId, newTags);
                this.renderLibrary();
                if (window.location.hash.includes(`track/${trackId}`)) {
                    this.loadTrackDetail(trackId);
                }
                // Если это текущий трек, обновить громкость
                if (this.player.currentTrack && this.player.currentTrack.id === trackId) {
                    await this.player.updateEffectiveVolume();
                }
            }
        });

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

        // Drag & drop из библиотеки в очередь (исправлено дублирование)
        const queueList = document.getElementById('queue-list');
        if (queueList) {
            queueList.addEventListener('dragover', (e) => e.preventDefault());
            let dropPending = false; // защита от множественных срабатываний
            queueList.addEventListener('drop', async (e) => {
                e.preventDefault();
                if (dropPending) return;
                dropPending = true;
                const trackId = e.dataTransfer.getData('text/plain');
                if (trackId) {
                    // Проверяем, нет ли уже такого трека в очереди (опционально, можно убрать если нужны дубликаты)
                    if (!this.player.queue.includes(trackId)) {
                        await this.player.addToQueue([trackId]);
                    } else {
                        console.log('Трек уже в очереди, дубликат не добавлен');
                    }
                }
                setTimeout(() => { dropPending = false; }, 300);
            });
        }
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

        // Фильтр по тегам (частичное совпадение начала тега)
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
                    <input type="text" placeholder="новый тег" class="tag-input" data-id="${track.id}">
                    <button class="add-tag-btn" data-id="${track.id}">➕ Добавить</button>
                    <button class="exclude-btn" data-id="${track.id}">${isExcluded ? '✅ Включить' : '🚫 Исключить'}</button>
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
                        if (this.player.currentTrack && this.player.currentTrack.id === id) {
                            await this.player.updateEffectiveVolume();
                        }
                    }
                }
            });
        });

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
                if (this.player.currentTrack && this.player.currentTrack.id === id) {
                    await this.player.updateEffectiveVolume();
                }
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
            li.dataset.id = track.id;  // обязательно для Sortable
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

        // Обработчики для кнопок (оставляем как есть)
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

        // После полной перерисовки очереди переинициализируем Drag & Drop
        DragDrop.initQueue(this);
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

        await this.renderTagVolumeSettings();
        await this.renderThemeFineTuning();
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

        const container = document.getElementById('track-detail-container');
        const tagsHtml = tags.length > 0 
            ? tags.map(t => `<span class="tag-badge">${t} <button class="remove-tag-btn" data-track-id="${trackId}" data-tag="${t}">✖</button></span>`).join(' ')
            : 'нет';
        container.innerHTML = `
            <div class="track-detail">
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
                </div>
            </div>
        `;

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