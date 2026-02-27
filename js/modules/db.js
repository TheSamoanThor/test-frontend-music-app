var Database = class Database {
    constructor() {
        this.dbName = 'MusicPlayerDB';
        this.dbVersion = 1;
        this.db = null;
        this.stores = {
            tracks: 'tracks',
            queue: 'queue',
            exclusions: 'exclusions',
            settings: 'settings',
            tags: 'tags'
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
                // Создаём хранилища, если их нет
                if (!db.objectStoreNames.contains(this.stores.tracks)) {
                    db.createObjectStore(this.stores.tracks, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(this.stores.queue)) {
                    db.createObjectStore(this.stores.queue, { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains(this.stores.exclusions)) {
                    db.createObjectStore(this.stores.exclusions, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(this.stores.settings)) {
                    db.createObjectStore(this.stores.settings, { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains(this.stores.tags)) {
                    db.createObjectStore(this.stores.tags, { keyPath: 'trackId' });
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

    // ---- Исключения (ключ - id трека) ----
    async getExclusion(trackId) {
        const tx = this.db.transaction(this.stores.exclusions, 'readonly');
        const store = tx.objectStore(this.stores.exclusions);
        return new Promise((resolve, reject) => {
            const request = store.get(trackId);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result ? request.result.value : null);
        });
    }

    async setExclusion(trackId, exclusion) {
        const tx = this.db.transaction(this.stores.exclusions, 'readwrite');
        const store = tx.objectStore(this.stores.exclusions);
        return new Promise((resolve, reject) => {
            const request = store.put({ id: trackId, value: exclusion });
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async removeExclusion(trackId) {
        const tx = this.db.transaction(this.stores.exclusions, 'readwrite');
        const store = tx.objectStore(this.stores.exclusions);
        return new Promise((resolve, reject) => {
            const request = store.delete(trackId);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async getAllExclusions() {
        const tx = this.db.transaction(this.stores.exclusions, 'readonly');
        const store = tx.objectStore(this.stores.exclusions);
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const exclusions = request.result.map(item => ({ id: item.id, ...item.value }));
                resolve(exclusions);
            };
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

    // ---- Экспорт / Импорт всех данных ----
    async exportData() {
        const stores = [this.stores.tracks, this.stores.queue, this.stores.exclusions, this.stores.settings, this.stores.tags];
        const data = {};
        for (let storeName of stores) {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const records = await new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
            });
            data[storeName] = records;
        }
        return data;
    }

    async importData(data) {
        for (let storeName in data) {
            if (!data[storeName]) continue;
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