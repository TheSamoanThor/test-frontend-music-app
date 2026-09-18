/**
 * ServerApi — тонкая обёртка над fetch для общения с локальным Python-сервером.
 *
 * Философия:
 *  - Фронт работает автономно на IndexedDB, сервер — опциональный бонус.
 *  - Если сервер недоступен, все методы возвращают null/[] и НЕ бросают исключений.
 *  - Все запросы с таймаутом, чтобы UI не «висел».
 */
var ServerApi = {
    baseUrl: 'http://localhost:8000',
    timeoutMs: 4000,
    _available: null, // null = неизвестно, true/false = результат последней проверки

    /**
     * Универсальный fetch с таймаутом. Возвращает { ok, status, data } или null при ошибке.
     */
    async _fetch(path, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(this.baseUrl + path, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
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
            // Тихо логируем в консоль, не мешаем пользователю
            console.debug(`[ServerApi] ${path} недоступен:`, err.message);
            return null;
        }
    },

    /**
     * Проверка доступности сервера. Кэширует результат в _available.
     */
    async healthCheck(force = false) {
        if (!force && this._available !== null) return this._available;
        const res = await this._fetch('/api/health');
        this._available = !!(res && res.ok);
        return this._available;
    },

    isAvailable() {
        return this._available === true;
    },

    /**
     * Отправить событие в лог сервера. Если сервер недоступен — молча игнорируем.
     */
    async log(event, payload = {}) {
        return this._fetch('/api/log', {
            method: 'POST',
            body: JSON.stringify({ event, payload, ts: Date.now() })
        });
    },

    /**
     * Получить все треки с сервера.
     */
    async getTracks() {
        const res = await this._fetch('/api/tracks');
        if (res && res.ok && Array.isArray(res.data)) return res.data;
        return [];
    },

    /**
     * Добавить трек на сервер.
     */
    async postTrack(track) {
        const res = await this._fetch('/api/tracks', {
            method: 'POST',
            body: JSON.stringify(track)
        });
        return res && res.ok ? res.data : null;
    },

    /**
     * Удалить трек с сервера по id.
     */
    async deleteTrack(id) {
        const res = await this._fetch(`/api/tracks/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });
        return res && res.ok;
    },

    /**
     * Получить настройку по ключу.
     */
    async getSetting(key) {
        const res = await this._fetch(`/api/settings/${encodeURIComponent(key)}`);
        if (res && res.ok && res.data) return res.data.value;
        return undefined;
    },

    /**
     * Сохранить настройку.
     */
    async setSetting(key, value) {
        const res = await this._fetch('/api/settings', {
            method: 'POST',
            body: JSON.stringify({ key, value })
        });
        return res && res.ok;
    }
};