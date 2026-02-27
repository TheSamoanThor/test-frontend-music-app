const DragDrop = {
    ui: null,

    initQueue(ui) {
        this.ui = ui;
        const queueList = document.getElementById('queue-list');
        if (!queueList) return;

        new Sortable(queueList, {
            animation: 150,
            onEnd: async (evt) => {
                const items = Array.from(evt.target.children).map(li => li.dataset.id);
                this.ui.player.queue = items;
                await this.ui.db.setQueue(items);
                if (this.ui.player.currentTrack) {
                    const newIndex = items.indexOf(this.ui.player.currentTrack.id);
                    this.ui.player.currentIndex = newIndex;
                }
                this.ui.renderQueue(items);
            }
        });
    }
};