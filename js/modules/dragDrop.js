const DragDrop = {
    ui: null,
    sortable: null,

    initQueue(ui) {
        this.ui = ui;
        const queueList = document.getElementById('queue-list');
        if (!queueList) return;

        if (this.sortable) {
            this.sortable.destroy();
            this.sortable = null;
        }

        this.sortable = new Sortable(queueList, {
            animation: 150,
            onEnd: async (evt) => {
                const items = Array.from(evt.target.children).map(li => li.dataset.id);
                if (items.length === 0) return;

                const trackObjects = [];
                for (let id of items) {
                    const track = await this.ui.db.getTrack(id);
                    if (track) trackObjects.push(track);
                }
                this.ui.player.queue = trackObjects;
                await this.ui.db.setQueue(items);

                if (this.ui.player.currentTrack) {
                    const newIndex = items.indexOf(this.ui.player.currentTrack.id);
                    this.ui.player.currentIndex = newIndex;
                }

                // Обновляем отображение очереди (кнопки с правильными индексами)
                this.ui.renderQueue(trackObjects);
            }
        });
    }
};