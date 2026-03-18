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

                this.ui.player.queue = items;
                await this.ui.db.setQueue(items);

                if (this.ui.player.currentTrack) {
                    const newIndex = items.indexOf(this.ui.player.currentTrack.id);
                    this.ui.player.currentIndex = newIndex;
                }

                this.updateQueueItemIndices();
            }
        });
    },

    updateQueueItemIndices() {
        const queueList = document.getElementById('queue-list');
        if (!queueList) return;
        const items = queueList.children;
        for (let i = 0; i < items.length; i++) {
            const li = items[i];
            const upBtn = li.querySelector('.queue-up');
            const downBtn = li.querySelector('.queue-down');
            const removeBtn = li.querySelector('.queue-remove');
            if (upBtn) {
                upBtn.dataset.index = i;
                upBtn.disabled = i === 0;
            }
            if (downBtn) {
                downBtn.dataset.index = i;
                downBtn.disabled = i === items.length - 1;
            }
            if (removeBtn) {
                removeBtn.dataset.index = i;
            }
        }
    }
};