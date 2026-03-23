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
                '--border-color': '#444444',
                '--player-bg': '#252525',
                '--hover-bg': '#3a3a3a'
            },
            dark2: {
                '--bg-color': '#000000',
                '--text-color': '#e0e0e0',
                '--primary-color': '#3a3a3a',
                '--secondary-bg': '#000000',
                '--border-color': '#444444',
                '--player-bg': '#000000',
                '--hover-bg': '#3a3a3a'
            },
            'light-blue': {
                '--bg-color': '#e3f2fd',
                '--text-color': '#01579b',
                '--primary-color': '#0288d1',
                '--secondary-bg': '#ffffff',
                '--border-color': '#b3e5fc',
                '--player-bg': '#b3e5fc',
                '--hover-bg': '#81d4fa'
            },
            'dark-purple': {
                '--bg-color': '#2d1b3c',
                '--text-color': '#e1bee7',
                '--primary-color': '#ab47bc',
                '--secondary-bg': '#3e2a4d',
                '--border-color': '#5e3a6b',
                '--player-bg': '#3e2a4d',
                '--hover-bg': '#6a4e7a'
            },
            'green': {
                '--bg-color': '#e8f5e9',
                '--text-color': '#1b5e20',
                '--primary-color': '#2e7d32',
                '--secondary-bg': '#ffffff',
                '--border-color': '#a5d6a7',
                '--player-bg': '#c8e6c9',
                '--hover-bg': '#a5d6a7'
            },
            'orange': {
                '--bg-color': '#fff3e0',
                '--text-color': '#bf360c',
                '--primary-color': '#f57c00',
                '--secondary-bg': '#ffffff',
                '--border-color': '#ffe0b2',
                '--player-bg': '#ffe0b2',
                '--hover-bg': '#ffcc80'
            },
            'monochrome': {
                '--bg-color': '#fafafa',
                '--text-color': '#212121',
                '--primary-color': '#9e9e9e',
                '--secondary-bg': '#ffffff',
                '--border-color': '#bdbdbd',
                '--player-bg': '#eeeeee',
                '--hover-bg': '#e0e0e0'
            },
            dracula: {
                '--bg-color': '#282a36',
                '--text-color': '#f8f8f2',
                '--primary-color': '#bd93f9',
                '--secondary-bg': '#44475a',
                '--border-color': '#6272a4',
                '--player-bg': '#21222c',
                '--hover-bg': '#6272a4'
            },
            nord: {
                '--bg-color': '#2e3440',
                '--text-color': '#d8dee9',
                '--primary-color': '#88c0d0',
                '--secondary-bg': '#3b4252',
                '--border-color': '#4c566a',
                '--player-bg': '#434c5e',
                '--hover-bg': '#5e81ac'
            },
            solarized: {
                '--bg-color': '#fdf6e3',
                '--text-color': '#657b83',
                '--primary-color': '#268bd2',
                '--secondary-bg': '#eee8d5',
                '--border-color': '#93a1a1',
                '--player-bg': '#eee8d5',
                '--hover-bg': '#586e75'
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
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) themeSelect.value = preset;
        const customColor = document.getElementById('custom-color');
        if (customColor) customColor.value = color;
    }
};