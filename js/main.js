(async () => {
    const db = new Database();
    await db.init();

    const fileHandler = new FileHandler(db);
    const themeManager = new ThemeManager();
    await themeManager.loadFromDB(db);

    const player = new Player(db, fileHandler);
    const ui = new UI(db, player, fileHandler, themeManager);

    player.setUI(ui);

    await player.loadQueue();
    await ui.renderLibrary();

    const savedVolume = await db.getSetting('volume') || 80;
    player.setVolume(savedVolume);
    document.getElementById('volume').value = savedVolume;

    document.getElementById('volume').addEventListener('change', async (e) => {
        await db.setSetting('volume', e.target.value);
    });

    // Навигация через кнопки в шапке
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            Router.navigate(page);
        });
    });

    // Инициализация роутера
    Router.init(ui, player);

    // Обработчики для кнопок в настройках (дублируют основные, но находятся внутри страницы)
    document.getElementById('theme-select-settings').addEventListener('change', (e) => {
        themeManager.applyPreset(e.target.value);
        themeManager.saveToDB(db);
        // синхронизируем основной селект
        document.getElementById('theme-select').value = e.target.value;
    });
    document.getElementById('custom-color-settings').addEventListener('input', utils.debounce((e) => {
        themeManager.applyCustomColor(e.target.value);
        themeManager.saveToDB(db);
        document.getElementById('custom-color').value = e.target.value;
    }, 500));
    document.getElementById('export-btn-settings').addEventListener('click', () => ui.exportData());
    document.getElementById('import-btn-settings').addEventListener('click', () => ui.importData());

    // Кнопка назад из деталей трека
    document.getElementById('back-to-library').addEventListener('click', () => {
        Router.navigate('library');
    });
})();