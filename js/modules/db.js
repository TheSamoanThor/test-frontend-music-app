var Database = class Database {
    constructor() {
        this.dbName = 'MusicPlayerDB';
        this.dbVersion = 2; // увеличена версия для нового хранилища
        this.db = null;
        this.stores = {
            tracks: 'tracks',
            queue: 'queue',
            settings: 'settings',
            tags: 'tags',
            tagVolumes: 'tagVolumes' // новое хранилище для громкости по тегам
        };
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;

                // Создаём хранилища, если их нет (версия 1)
                if (!db.objectStoreNames.contains(this.stores.tracks)) {
                    db.createObjectStore(this.stores.tracks, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(this.stores.queue)) {
                    db.createObjectStore(this.stores.queue, { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains(this.stores.settings)) {
                    db.createObjectStore(this.stores.settings, { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains(this.stores.tags)) {
                    db.createObjectStore(this.stores.tags, { keyPath: 'trackId' });
                }

                // При переходе с версии 1 на 2
                if (oldVersion < 2) {
                    // Удаляем устаревшее хранилище exclusions
                    if (db.objectStoreNames.contains('exclusions')) {
                        db.deleteObjectStore('exclusions');
                    }
                    // Создаём хранилище для громкости тегов
                    if (!db.objectStoreNames.contains(this.stores.tagVolumes)) {
                        db.createObjectStore(this.stores.tagVolumes, { keyPath: 'tag' });
                    }
                }
            };
        });
    }

    // ---- Треки ----
    async addTrack(track) {
        const tx = this.db.transaction(this.stores.tracks, 'readwrite');
        const store = tx.objectStore(this.stores.tracks);
        return new Promise((resolve, reject) => {
            const request = store.put(track);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async getTrack(id) {
        const tx = this.db.transaction(this.stores.tracks, 'readonly');
        const store = tx.objectStore(this.stores.tracks);
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async getAllTracks() {
        const tx = this.db.transaction(this.stores.tracks, 'readonly');
        const store = tx.objectStore(this.stores.tracks);
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async deleteTrack(id) {
        const tx = this.db.transaction(this.stores.tracks, 'readwrite');
        const store = tx.objectStore(this.stores.tracks);
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    // ---- Очередь (один объект с ключом 'queue') ----
    async getQueue() {
        const tx = this.db.transaction(this.stores.queue, 'readonly');
        const store = tx.objectStore(this.stores.queue);
        return new Promise((resolve, reject) => {
            const request = store.get('queue');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result ? request.result.value : []);
        });
    }

    async setQueue(queue) {
        const tx = this.db.transaction(this.stores.queue, 'readwrite');
        const store = tx.objectStore(this.stores.queue);
        return new Promise((resolve, reject) => {
            const request = store.put({ key: 'queue', value: queue });
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    // ---- Теги (ключ - trackId) ----
    async getTags(trackId) {
        const tx = this.db.transaction(this.stores.tags, 'readonly');
        const store = tx.objectStore(this.stores.tags);
        return new Promise((resolve, reject) => {
            const request = store.get(trackId);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result ? request.result.value : []);
        });
    }

    async setTags(trackId, tags) {
        const tx = this.db.transaction(this.stores.tags, 'readwrite');
        const store = tx.objectStore(this.stores.tags);
        return new Promise((resolve, reject) => {
            const request = store.put({ trackId, value: tags });
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    // ---- Настройки (ключ - произвольная строка) ----
    async getSetting(key) {
        const tx = this.db.transaction(this.stores.settings, 'readonly');
        const store = tx.objectStore(this.stores.settings);
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result ? request.result.value : undefined);
        });
    }

    async setSetting(key, value) {
        const tx = this.db.transaction(this.stores.settings, 'readwrite');
        const store = tx.objectStore(this.stores.settings);
        return new Promise((resolve, reject) => {
            const request = store.put({ key, value });
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    // ---- Громкость для тегов (новое) ----
    async getTagVolume(tag) {
        const tx = this.db.transaction(this.stores.tagVolumes, 'readonly');
        const store = tx.objectStore(this.stores.tagVolumes);
        return new Promise((resolve, reject) => {
            const request = store.get(tag);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result ? request.result.volume : 1.0);
        });
    }

    async setTagVolume(tag, volume) {
        const tx = this.db.transaction(this.stores.tagVolumes, 'readwrite');
        const store = tx.objectStore(this.stores.tagVolumes);
        return new Promise((resolve, reject) => {
            const request = store.put({ tag, volume });
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async getAllTagVolumes() {
        const tx = this.db.transaction(this.stores.tagVolumes, 'readonly');
        const store = tx.objectStore(this.stores.tagVolumes);
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    async deleteTagVolume(tag) {
        const tx = this.db.transaction(this.stores.tagVolumes, 'readwrite');
        const store = tx.objectStore(this.stores.tagVolumes);
        return new Promise((resolve, reject) => {
            const request = store.delete(tag);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    // ---- Экспорт / Импорт всех данных ----
    async exportData() {
        const stores = [this.stores.tracks, this.stores.queue, this.stores.settings, this.stores.tags, this.stores.tagVolumes];
        const data = {};
        for (let storeName of stores) {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const records = await new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
            });

            // Для хранилища tracks удаляем поля handle и file (они не сериализуются)
            if (storeName === this.stores.tracks) {
                data[storeName] = records.map(track => {
                    const { handle, file, ...rest } = track;
                    return rest;
                });
            } else {
                data[storeName] = records;
            }
        }
        return data;
    }

    async importData(data) {
        // Предупреждение, если в импортируемых треках есть handle или file (они не восстановятся)
        if (data.tracks && data.tracks.some(t => t.handle || t.file)) {
            alert('Внимание: при экспорте были удалены ссылки на файлы. После импорта необходимо заново выбрать папку с музыкой, чтобы восстановить доступ.');
        }
        for (let storeName in data) {
            if (!data[storeName] || storeName === 'exclusions') continue; // пропускаем устаревшее хранилище
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            await new Promise((resolve, reject) => {
                const clearReq = store.clear();
                clearReq.onerror = () => reject(clearReq.error);
                clearReq.onsuccess = () => {
                    const records = data[storeName];
                    if (records.length === 0) return resolve();
                    let completed = 0;
                    records.forEach(record => {
                        const addReq = store.put(record);
                        addReq.onerror = () => reject(addReq.error);
                        addReq.onsuccess = () => {
                            completed++;
                            if (completed === records.length) resolve();
                        };
                    });
                };
            });
        }
    }
};