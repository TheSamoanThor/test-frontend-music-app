(async () => {
    const db = new Database();
    await db.init();

    const fileHandler = new FileHandler(db);
    const themeManager = new ThemeManager();
    await themeManager.loadFromDB(db);

    const player = new Player(db, fileHandler);
    const ui = new UI(db, player, fileHandler, themeManager);

    player.setUI(ui);

    // Регистрируем визуализатор для плеера
    ui.registerPlayerVisualizer();

    DragDrop.initQueue(ui);

    await player.loadQueue();
    await ui.renderLibrary();

    await ui.loadThemeOverrides();

    const savedVolume = await db.getSetting('volume') || 80;
    player.setVolume(savedVolume);
    document.getElementById('volume').value = savedVolume;

    document.getElementById('volume').addEventListener('change', async (e) => {
        await db.setSetting('volume', e.target.value);
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            Router.navigate(page);
        });
    });

    Router.init(ui, player);

    document.getElementById('theme-select-settings').addEventListener('change', (e) => {
        themeManager.applyPreset(e.target.value);
        themeManager.saveToDB(db);
        document.getElementById('theme-select').value = e.target.value;
        ui.renderThemeFineTuning();
    });
    document.getElementById('custom-color-settings').addEventListener('input', utils.debounce((e) => {
        themeManager.applyCustomColor(e.target.value);
        themeManager.saveToDB(db);
        document.getElementById('custom-color').value = e.target.value;
        ui.renderThemeFineTuning();
    }, 500));
    document.getElementById('export-btn-settings').addEventListener('click', () => ui.exportData());
    document.getElementById('import-btn-settings').addEventListener('click', () => ui.importData());

    document.getElementById('back-to-library').addEventListener('click', () => {
        Router.navigate('library');
    });
})();