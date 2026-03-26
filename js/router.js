const Router = {
    ui: null,
    player: null,

    init(ui, player) {
        this.ui = ui;
        this.player = player;
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute();
    },

    handleRoute() {
        const hash = window.location.hash.slice(1) || 'library';
        const [path, param] = hash.split('/');
        
        document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));

        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

        if (!hash.startsWith('track/') && this.ui) {
            this.ui.unregisterTrackDetailVisualizer();
        }

        const activeBtn = document.querySelector(`.nav-btn[data-page="${path}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        switch (path) {
            case 'library':
                document.getElementById('page-library').classList.remove('hidden');
                this.ui.renderLibrary();
                break;
            case 'queue':
                document.getElementById('page-queue').classList.remove('hidden');
                this.ui.renderQueue(this.player.queue);
                break;
            case 'playlists':
                document.getElementById('page-playlists').classList.remove('hidden');
                this.ui.renderPlaylists();
                break;
            case 'archive':
                document.getElementById('page-archive').classList.remove('hidden');
                this.ui.renderArchivePage();
                break;
            case 'settings':
                document.getElementById('page-settings').classList.remove('hidden');
                this.ui.syncSettingsPage();
                break;
            case 'track':
                document.getElementById('page-track').classList.remove('hidden');
                if (param) {
                    this.ui.loadTrackDetail(param);
                } else {
                    this.navigate('library');
                }
                break;
            default:
                document.getElementById('page-library').classList.remove('hidden');
                if (activeBtn) activeBtn.classList.remove('active');
                document.querySelector('.nav-btn[data-page="library"]').classList.add('active');
        }
    },

    navigate(path, param = '') {
        window.location.hash = param ? `${path}/${param}` : path;
    }
};