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
    },
    extractVolumeFactorFromTags(tags) {
        for (let tag of tags) {
            const match = tag.match(/^vol(\d+)$/i);
            if (match) {
                let val = parseInt(match[1], 10);
                val = Math.min(200, Math.max(0, val));
                return val / 100;
            }
        }
        return null;
    },
    rgbToHex(rgb) {
        if (!rgb) return '#000000';
        if (rgb.startsWith('#')) return rgb;
        const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (match) {
            const r = parseInt(match[1]).toString(16).padStart(2, '0');
            const g = parseInt(match[2]).toString(16).padStart(2, '0');
            const b = parseInt(match[3]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }
        return '#000000';
    }
};