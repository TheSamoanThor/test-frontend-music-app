var ThemeManager = class ThemeManager {
    constructor() {
        this.root = document.documentElement;
        this.presets = {
            light: {
                '--bg-color': '#f8f9fa',
                '--text-color': '#212529',
                '--primary-color': '#4a90e2',
                '--secondary-bg': '#ffffff',
                '--border-color': '#dee2e6',
                '--player-bg': '#e9ecef',
                '--hover-bg': '#e0e0e0'
            },
            dark: {
                '--bg-color': '#1e1e1e',
                '--text-color': '#e0e0e0',
                '--primary-color': '#bb86fc',
                '--secondary-bg': '#2d2d2d',
                '--border-color': '#444',
                '--player-bg': '#252525',
                '--hover-bg': '#3a3a3a'
            },
            dark2: {
                '--bg-color': '#000',
                '--text-color': '#e0e0e0',
                '--primary-color': '#3a0d6b',
                '--secondary-bg': '#000',
                '--border-color': '#444',
                '--player-bg': '#000',
                '--hover-bg': '#3a3a3a'
            }
        };
        this.currentPreset = 'light';
    }

    applyPreset(name) {
        const preset = this.presets[name];
        if (preset) {
            for (let [key, value] of Object.entries(preset)) {
                this.root.style.setProperty(key, value);
            }
            this.currentPreset = name;
        }
    }

    applyCustomColor(color) {
        this.root.style.setProperty('--primary-color', color);
    }

    async saveToDB(db) {
        await db.setSetting('theme-preset', this.currentPreset);
        const currentColor = getComputedStyle(this.root).getPropertyValue('--primary-color').trim();
        await db.setSetting('theme-custom-color', currentColor);
    }

    async loadFromDB(db) {
        const preset = await db.getSetting('theme-preset') || 'light';
        const color = await db.getSetting('theme-custom-color') || '#4a90e2';
        this.applyPreset(preset);
        this.applyCustomColor(color);
        document.getElementById('theme-select').value = preset;
        document.getElementById('custom-color').value = color;
    }
};