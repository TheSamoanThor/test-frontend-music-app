var FileHandler = class FileHandler {
    constructor(db) {
        this.db = db;
        this.isFileSystemAccessSupported = 'showDirectoryPicker' in window;
    }

    async pickDirectory() {
        if (!this.isFileSystemAccessSupported) {
            alert('Ваш браузер не поддерживает прямой доступ к папкам. Будет использован стандартный выбор файлов.');
            return this.pickFiles();
        }
        try {
            const dirHandle = await window.showDirectoryPicker();
            const tracks = await this.processDirectory(dirHandle);
            return tracks;
        } catch (err) {
            console.error('Ошибка выбора папки', err);
            return [];
        }
    }

    async processDirectory(dirHandle, path = '') {
        let tracks = [];
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                if (file.type.startsWith('audio/')) {
                    const id = utils.generateId();
                    const track = {
                        id,
                        name: file.name,
                        path: path + '/' + file.name,
                        handle: entry,
                        duration: 0
                    };
                    this.getAudioDuration(file).then(duration => {
                        track.duration = duration;
                        this.db.addTrack(track);
                    });
                    tracks.push(track);
                }
            } else if (entry.kind === 'directory') {
                const subTracks = await this.processDirectory(entry, path + '/' + entry.name);
                tracks = tracks.concat(subTracks);
            }
        }
        return tracks;
    }

    getAudioDuration(file) {
        return new Promise((resolve) => {
            const audio = new Audio();
            audio.src = URL.createObjectURL(file);
            audio.addEventListener('loadedmetadata', () => {
                resolve(audio.duration);
                URL.revokeObjectURL(audio.src);
            });
            audio.addEventListener('error', () => resolve(0));
        });
    }

    async pickFiles() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'audio/*';
            input.multiple = true;
            input.onchange = async (e) => {
                const files = Array.from(e.target.files);
                const tracks = [];
                for (let file of files) {
                    const id = utils.generateId();
                    const track = {
                        id,
                        name: file.name,
                        path: file.webkitRelativePath || file.name,
                        file: file,
                        duration: 0
                    };
                    this.getAudioDuration(file).then(d => {
                        track.duration = d;
                        this.db.addTrack(track);
                    });
                    tracks.push(track);
                }
                resolve(tracks);
            };
            input.click();
        });
    }

    async getFileForTrack(track) {
        if (track.handle) {
            try {
                return await track.handle.getFile();
            } catch (err) {
                // Если ошибка связана с отсутствием разрешения, пробуем запросить
                if (err.name === 'NotAllowedError' && track.handle.requestPermission) {
                    try {
                        const permission = await track.handle.requestPermission({ mode: 'read' });
                        if (permission === 'granted') {
                            return await track.handle.getFile();
                        }
                    } catch (permErr) {
                        console.error('Не удалось получить разрешение:', permErr);
                    }
                }
                console.error('Ошибка получения файла:', err);
                return null;
            }
        } else if (track.file) {
            return track.file;
        }
        return null;
    }
};