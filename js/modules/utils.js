var utils = {
    generateId() {
        return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    },
    parseTags(tagString) {
        return tagString.split(',').map(t => t.trim()).filter(t => t);
    },
    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    },
    debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
};