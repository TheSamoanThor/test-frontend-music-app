var FileHandler = class FileHandler {
    constructor(db) {
        this.db = db;
        this.isFileSystemAccessSupported = 'showDirectoryPicker' in window;
        // Расширения аудиофайлов для дополнительной проверки
        this.audioExtensions = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.wma', '.opus'];
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
        const addPromises = [];

        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                // Проверка: аудио по MIME-типу или по расширению
                const isAudio = file.type.startsWith('audio/') || 
                    this.audioExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
                
                if (isAudio) {
                    const id = utils.generateId();
                    const track = {
                        id,
                        name: file.name,
                        path: path + '/' + file.name,
                        handle: entry,
                        duration: 0
                    };
                    tracks.push(track);
                    
                    // Создаём промис для асинхронного получения длительности и добавления в БД
                    const addPromise = this.getAudioDuration(file).then(duration => {
                        track.duration = duration;
                        return this.db.addTrack(track);
                    });
                    addPromises.push(addPromise);
                }
            } else if (entry.kind === 'directory') {
                const subTracks = await this.processDirectory(entry, path + '/' + entry.name);
                tracks = tracks.concat(subTracks);
                // Промисы из поддиректорий уже были обработаны внутри рекурсивного вызова
            }
        }

        // Ждём завершения всех операций добавления для текущей директории
        await Promise.all(addPromises);
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
            audio.addEventListener('error', () => {
                resolve(0); // если не удалось определить длительность
                URL.revokeObjectURL(audio.src);
            });
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
                const addPromises = [];
                for (let file of files) {
                    const id = utils.generateId();
                    const track = {
                        id,
                        name: file.name,
                        path: file.webkitRelativePath || file.name,
                        file: file,
                        duration: 0
                    };
                    tracks.push(track);
                    const addPromise = this.getAudioDuration(file).then(d => {
                        track.duration = d;
                        return this.db.addTrack(track);
                    });
                    addPromises.push(addPromise);
                }
                await Promise.all(addPromises);
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

    async getPictureBlobUrl(file) {
        if (!file) return null;

        return new Promise((resolve) => {
            jsmediatags.read(file, {
                onSuccess: (tag) => {
                    const pictures = tag.tags.picture;
                    if (pictures && pictures.data) {
                        let data = pictures.data;
                        if (data instanceof Array) {
                            data = new Uint8Array(data);
                        }
                        const blob = new Blob([data], { type: pictures.format });
                        const url = URL.createObjectURL(blob);
                        resolve(url);
                    } else {
                        resolve(null);
                    }
                },
                onError: (error) => {
                    console.warn('Не удалось прочитать метаданные:', error);
                    resolve(null);
                }
            });
        });
    }
};