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

                // Преобразуем массив ID в массив объектов треков
                const trackObjects = [];
                for (let id of items) {
                    const track = await this.ui.db.getTrack(id);
                    if (track) trackObjects.push(track);
                }
                this.ui.player.queue = trackObjects;
                await this.ui.db.setQueue(items); // сохраняем только ID

                if (this.ui.player.currentTrack) {
                    const newIndex = items.indexOf(this.ui.player.currentTrack.id);
                    this.ui.player.currentIndex = newIndex;
                }

                this.updateQueueItemIndices();
                // Обновляем отображение очереди (чтобы кнопки были с правильными индексами)
                this.ui.renderQueue(trackObjects);
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