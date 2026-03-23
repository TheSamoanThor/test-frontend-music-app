var ArchiveApi = {
    searchUrl: 'https://archive.org/advancedsearch.php',
    metadataUrl: 'https://archive.org/metadata/',
    cache: new Map(),

    async search(query, rows = 30) {
        const q = `${query} AND mediatype:audio AND format:mp3`;
        const params = new URLSearchParams({
            q: q,
            fl: 'identifier,title,creator,description,downloads,avg_rating,date',
            rows: rows,
            output: 'json'
        });
        const url = `${this.searchUrl}?${params.toString()}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return data.response?.docs || [];
        } catch (err) {
            console.error('Archive.org search error', err);
            if (err.name === 'AbortError') {
                alert('Превышено время ожидания ответа от archive.org');
            } else {
                alert('Ошибка соединения с archive.org');
            }
            return [];
        }
    },

    async getTrackDetails(identifier) {
        if (this.cache.has(identifier)) return this.cache.get(identifier);

        const url = `${this.metadataUrl}${identifier}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (data && data.files) {
                const mp3Files = data.files.filter(file => 
                    file.name && file.name.toLowerCase().endsWith('.mp3') &&
                    !file.name.includes('_archive.torrent') &&
                    !file.name.includes('_meta.xml')
                );
                if (mp3Files.length === 0) return null;
                const mp3File = mp3Files[0];
                const streamUrl = `https://archive.org/download/${identifier}/${mp3File.name}`;
                const result = {
                    identifier,
                    title: data.metadata?.title || identifier,
                    creator: data.metadata?.creator || 'Unknown',
                    streamUrl: streamUrl,
                    duration: mp3File.length || 0
                };
                this.cache.set(identifier, result);
                return result;
            }
            return null;
        } catch (err) {
            console.error(`Failed to get track details for ${identifier}`, err);
            return null;
        }
    }
};