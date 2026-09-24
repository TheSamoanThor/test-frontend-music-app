/**
 * ServerApi — обёртка над fetch для общения с локальным Python-сервером.
 * baseUrl теперь динамический: читается из IndexedDB (settings.server_url).
 */
var ServerApi = {
    baseUrl: 'http://localhost:8000',   // значение по умолчанию
    timeoutMs: 5000,
    _available: null,
    _db: null,                           // ссылка на Database, чтобы читать/писать server_url

    /** Привязать БД (вызывается из main.js). */
    attachDb(db) {
        this._db = db;
    },

    /** Загрузить URL из БД. */
    async loadBaseUrl() {
        if (!this._db) return;
        const saved = await this._db.getSetting('server_url');
        if (saved) this.baseUrl = saved;
    },

    /** Сохранить новый URL в БД и сбросить кэш доступности. */
    async setBaseUrl(url) {
        this.baseUrl = url;
        this._available = null;
        if (this._db) await this._db.setSetting('server_url', url);
    },

    async _fetch(path, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(this.baseUrl + path, {
                ...options,
                signal: controller.signal,
                headers: {
                    ...(options.headers || {})
                }
            });
            clearTimeout(timeout);
            let data = null;
            const text = await response.text();
            if (text) {
                try { data = JSON.parse(text); } catch { data = text; }
            }
            return { ok: response.ok, status: response.status, data };
        } catch (err) {
            clearTimeout(timeout);
            console.debug(`[ServerApi] ${path} недоступен:`, err.message);
            return null;
        }
    },

    async healthCheck(force = false) {
        if (!force && this._available !== null) return this._available;
        const res = await this._fetch('/api/health');
        this._available = !!(res && res.ok);
        return this._available;
    },

    isAvailable() {
        return this._available === true;
    },

    // ---------- ЛОГИ ----------
    async log(event, payload = {}) {
        return this._fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event, payload, ts: Date.now() })
        });
    },

    async setLogConfig(enabled) {
        return this._fetch('/api/log-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });
    },

    // ---------- ТРЕКИ ----------
    async getTracks() {
        const res = await this._fetch('/api/tracks');
        if (res && res.ok && Array.isArray(res.data)) {
            return res.data.map(t => {
                const track = { ...t };
                // stream_url -> streamUrl (абсолютный)
                if (t.stream_url) {
                    track.streamUrl = t.stream_url.startsWith('/')
                        ? this.baseUrl + t.stream_url
                        : t.stream_url;
                } else if (t.streamUrl) {
                    track.streamUrl = t.streamUrl.startsWith('/')
                        ? this.baseUrl + t.streamUrl
                        : t.streamUrl;
                }
                // archive_id -> archiveId
                if (t.archive_id && !track.archiveId) track.archiveId = t.archive_id;
                return track;
            });
        }
        return [];
    },

    async postTrack(track) {
        const res = await this._fetch('/api/tracks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(track)
        });
        return res && res.ok ? res.data : null;
    },

    async deleteTrack(id) {
        const res = await this._fetch(`/api/tracks/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });
        return res && res.ok;
    },

    /** Загрузка файлов (multipart). */
    async uploadFiles(files) {
        const form = new FormData();
        for (const f of files) form.append('files', f, f.name);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000); // 2 мин на загрузку
        try {
            const response = await fetch(this.baseUrl + '/api/upload', {
                method: 'POST',
                body: form,
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (!response.ok) return null;
            return await response.json();
        } catch (err) {
            clearTimeout(timeout);
            console.debug('[ServerApi] upload failed', err.message);
            return null;
        }
    },

    async scanMusic() {
        const res = await this._fetch('/api/scan', { method: 'POST' });
        return res && res.ok ? res.data : null;
    },

    // ---------- НАСТРОЙКИ ----------
    async getSetting(key) {
        const res = await this._fetch(`/api/settings/${encodeURIComponent(key)}`);
        if (res && res.ok && res.data) return res.data.value;
        return undefined;
    },

    async setSetting(key, value) {
        const res = await this._fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value })
        });
        return res && res.ok;
    },

    async getAllSettings() {
        const res = await this._fetch('/api/settings');
        return (res && res.ok && Array.isArray(res.data)) ? res.data : [];
    },

    // ---------- ТЕГИ ----------
    async getTags(trackId) {
        const res = await this._fetch(`/api/tags/${encodeURIComponent(trackId)}`);
        if (res && res.ok && res.data) return res.data.tags || [];
        return [];
    },

    async setTags(trackId, tags) {
        const res = await this._fetch(`/api/tags/${encodeURIComponent(trackId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags })
        });
        return res && res.ok;
    },

    async getAllTags() {
        const res = await this._fetch('/api/tags');
        return (res && res.ok && Array.isArray(res.data)) ? res.data : [];
    },

    // ---------- ПЛЕЙЛИСТЫ ----------
    async getPlaylists() {
        const res = await this._fetch('/api/playlists');
        return (res && res.ok && Array.isArray(res.data)) ? res.data : [];
    },

    async postPlaylist(pl) {
        const res = await this._fetch('/api/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pl)
        });
        return res && res.ok ? res.data : null;
    },

    async deletePlaylist(id) {
        const res = await this._fetch(`/api/playlists/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });
        return res && res.ok;
    },

    // ---------- ОЧЕРЕДЬ ----------
    async getQueue() {
        const res = await this._fetch('/api/queue');
        if (res && res.ok && res.data) return res.data.value || [];
        return [];
    },

    async setQueue(value) {
        const res = await this._fetch('/api/queue', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value })
        });
        return res && res.ok;
    },

    // ---------- ИНТЕРВАЛЫ ГРОМКОСТИ ----------
    async getVolumeIntervals(trackId) {
        const res = await this._fetch(`/api/volume-intervals/${encodeURIComponent(trackId)}`);
        if (res && res.ok && res.data) return res.data.intervals || [];
        return [];
    },

    async setVolumeIntervals(trackId, intervals) {
        const res = await this._fetch(`/api/volume-intervals/${encodeURIComponent(trackId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ intervals })
        });
        return res && res.ok;
    },

    async getAllVolumeIntervals() {
        const res = await this._fetch('/api/volume-intervals');
        return (res && res.ok && Array.isArray(res.data)) ? res.data : [];
    },

    // ---------- BACKUP ----------
    async backupExport() {
        const res = await this._fetch('/api/backup/export');
        return res && res.ok ? res.data : null;
    },

    async backupImport(data) {
        const res = await this._fetch('/api/backup/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return res && res.ok;
    }
};