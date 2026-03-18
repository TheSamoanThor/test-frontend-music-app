(async () => {
    const db = new Database();
    await db.init();

    const fileHandler = new FileHandler(db);
    if (!fileHandler.isFileSystemAccessSupported) {
        fileHandler.setFallbackMode(true);
        alert('Ваш браузер не поддерживает прямой выбор папки. Будет использован режим выбора отдельных файлов.');
    }

    const themeManager = new ThemeManager();
    await themeManager.loadFromDB(db);

    const player = new Player(db, fileHandler);
    const ui = new UI(db, player, fileHandler, themeManager);

    player.setUI(ui);
    await player.loadVisualizerSettings(); // <-- загружаем настройки визуализатора

    ui.registerPlayerVisualizer();

    DragDrop.initQueue(ui);

    await player.loadQueue();
    await ui.renderLibrary();

    await ui.loadThemeOverrides();

    if (window.initAllRanges) window.initAllRanges();

    const savedVolume = await db.getSetting('volume') || 80;
    player.setVolume(savedVolume);
    const volumeSlider = document.getElementById('volume');
    if (volumeSlider) volumeSlider.value = savedVolume;

    if (volumeSlider) {
        volumeSlider.addEventListener('change', async (e) => {
            await db.setSetting('volume', e.target.value);
        });
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            Router.navigate(page);
        });
    });

    Router.init(ui, player);

    const themeSelectSettings = document.getElementById('theme-select-settings');
    if (themeSelectSettings) {
        themeSelectSettings.addEventListener('change', (e) => {
            themeManager.applyPreset(e.target.value);
            themeManager.saveToDB(db);
            const themeSelect = document.getElementById('theme-select');
            if (themeSelect) themeSelect.value = e.target.value;
            ui.renderThemeFineTuning();
        });
    }

    const customColorSettings = document.getElementById('custom-color-settings');
    if (customColorSettings) {
        customColorSettings.addEventListener('input', utils.debounce((e) => {
            themeManager.applyCustomColor(e.target.value);
            themeManager.saveToDB(db);
            ui.renderThemeFineTuning();
        }, 500));
    }

    const exportBtnSettings = document.getElementById('export-btn-settings');
    if (exportBtnSettings) {
        exportBtnSettings.addEventListener('click', () => ui.exportData());
    }

    const importBtnSettings = document.getElementById('import-btn-settings');
    if (importBtnSettings) {
        importBtnSettings.addEventListener('click', () => ui.importData());
    }

    const backToLibrary = document.getElementById('back-to-library');
    if (backToLibrary) {
        backToLibrary.addEventListener('click', () => {
            Router.navigate('library');
        });
    }
})();