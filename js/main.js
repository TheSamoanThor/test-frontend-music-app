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

    document.getElementById('theme-select').addEventListener('change', () => themeManager.saveToDB(db));
    document.getElementById('custom-color').addEventListener('input', utils.debounce(() => themeManager.saveToDB(db), 500));
})();