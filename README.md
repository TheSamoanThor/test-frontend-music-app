# 🎵 Music Player с тегами и очередью

Веб-приложение для проигрывания музыки прямо в браузере с поддержкой тегов, гибкой настройкой громкости, очередью воспроизведения, плейлистами, визуализатором и множеством тем оформления. Все данные хранятся локально в IndexedDB, музыкальные файлы читаются через File System Access API (или стандартный выбор файлов).

**Важно:** В проекте используются сторонние библиотеки:
- [SortableJS](https://github.com/SortableJS/Sortable) для перетаскивания элементов очереди.
- [jsmediatags](https://github.com/aadsm/jsmediatags) для чтения метаданных аудиофайлов (обложки).

Я не писал эти библиотеки; вся заслуга принадлежит их авторам.

---

## 🚀 Основные возможности

- **Библиотека треков** – после выбора папки с музыкой все аудиофайлы отображаются в виде списка.
- **Теги** – каждому треку можно присвоить произвольные теги (например, «рок», «instrumental»). Теги используются для фильтрации, исключения треков и настройки громкости.
- **Исключение треков** – тег `excluded` исключает трек из случайного выбора (кнопка «Добавить случайную» в очереди).
- **Громкость по тегам** – для каждого тега можно задать коэффициент громкости (от 0.0 до 2.0). Итоговая громкость трека перемножается из всех его тегов (но не более 2.0 и не менее 0.1). Также поддерживается индивидуальный тег вида `vol50` (громкость 50% от базовой).
- **Очередь воспроизведения** – треки можно добавлять в очередь, менять порядок кнопками вверх/вниз или перетаскиванием (drag & drop). Очередь сохраняется между сессиями.
- **Плейлисты** – создавайте именованные списки треков, добавляйте треки в плейлист, изменяйте порядок треков внутри плейлиста, загружайте плейлист в очередь.
- **Случайный трек** – кнопка «Добавить случайную» добавляет в очередь случайный трек из библиотеки, не помеченный как исключённый.
- **Плеер** – базовое управление: play/pause, предыдущий/следующий трек, ползунок прогресса, регулировка громкости.
- **Визуализатор** – во время воспроизведения на месте обложки или на странице деталей трека отображается анимация (полоски, волна, круг, пламя), реагирующая на звук. Настройки визуализатора доступны в разделе настроек.
- **Темы оформления** – несколько готовых цветовых схем (светлая, тёмная, синяя, фиолетовая, зелёная, оранжевая, монохромная, Dracula, Nord, Solarized). Можно изменить основной цвет, а также тонко настроить отдельные цвета интерфейса (фон, текст, границы и т.д.).
- **Экспорт / импорт данных** – все теги, настройки громкости, очередь, плейлисты и информация о треках могут быть сохранены в JSON-файл и восстановлены позже. Ссылки на файлы при экспорте не сохраняются (из соображений безопасности), поэтому после импорта потребуется заново выбрать папку с музыкой.
- **Детальная информация о треке** – при клике на «Подробнее» открывается страница трека, где можно просмотреть и отредактировать теги, исключить трек, добавить в очередь или начать воспроизведение.

---

## 📖 Как использовать

0. Скачайте по ссылке: https://github.com/TheSamoanThor/test-frontend-music-app/releases/latest
1. Откройте `index.html` в современном браузере (Chrome, Edge, Opera рекомендуются для полной поддержки File System Access).
2. Нажмите **«Выбрать папку с музыкой»** и укажите папку с аудиофайлами. Приложение просканирует её рекурсивно и добавит все поддерживаемые аудиофайлы в библиотеку.  
   *Примечание:* Если ваш браузер не поддерживает выбор папки, будет предложено выбрать файлы по одному (через стандартное окно).
3. После загрузки библиотеки вы увидите список треков. Используйте фильтр по тегам (вводите теги через запятую) и поиск по названию для быстрого поиска.
4. Управляйте тегами:
   - Чтобы добавить тег, введите его в поле ввода рядом с треком и нажмите **«Добавить»**.
   - Чтобы удалить тег, нажмите крестик рядом с ним.
   - Кнопка **«Исключить»** добавляет/убирает тег `excluded`.
5. Для воспроизведения можно:
   - Нажать **«В очередь»** (трек добавится в конец очереди; если очередь была пуста, начнётся воспроизведение).
   - Перетащить трек из библиотеки в область очереди (вкладка «Очередь»).
   - На странице деталей трека нажать **«Воспроизвести сейчас»**.
6. Во вкладке **«Очередь»** отображается текущая очередь. Можно:
   - Менять порядок кнопками ↑/↓ или перетаскиванием элементов.
   - Удалять треки из очереди (кнопка ✖).
   - Очистить всю очередь, перемешать её или добавить случайный трек.
7. Во вкладке **«Плейлисты»** можно создавать плейлисты, просматривать их содержимое, изменять порядок треков внутри плейлиста и загружать плейлист в очередь.
8. Во вкладке **«Настройки»** можно:
   - Выбрать тему оформления и основной цвет.
   - Тонко настроить цвета интерфейса (изменения сохраняются автоматически).
   - Настроить параметры визуализатора (тип, чувствительность, количество полос, сглаживание).
   - Просмотреть список исключённых треков и снимать исключение.
   - Экспортировать или импортировать данные.
9. Навигация между страницами осуществляется с помощью кнопок в шапке (или через хэши в адресной строке).

---

## 🔧 Технические детали

- **Хранилище:** IndexedDB (объекты: tracks, queue, settings, tags, tagVolumes, playlists).
- **Доступ к файлам:** используется File System Access API (`showDirectoryPicker`) для получения доступа к папке и возможности читать файлы по мере необходимости. В качестве запасного варианта – множественный выбор файлов через `<input type="file">`.
- **Drag & Drop:** для очереди используется библиотека [SortableJS](https://github.com/SortableJS/Sortable).
- **Аудиоплеер:** встроенный элемент `<audio>`.
- **Визуализатор:** Web Audio API (`AnalyserNode`) для получения частотных данных и отрисовки на canvas.
- **Темы:** CSS-переменные, которые динамически меняются через JavaScript. Пресеты хранятся в объекте, пользовательские переопределения сохраняются в IndexedDB.
- **Громкость по тегам:** при воспроизведении трека собираются все его теги, для каждого из них извлекается коэффициент громкости (из хранилища tagVolumes или из самого тега вида volNN), затем они перемножаются. Результат ограничивается диапазоном [0.1, 2.0] и умножается на базовую громкость (ползунок громкости плеера). Если трек имеет тег `volNN`, он имеет приоритет над правилами для тегов.

---

## 📌 Примечания

- Приложение работает полностью в браузере, никакие данные не отправляются на сервер.
- Для корректной работы File System Access API требуется, чтобы сайт открывался через `https://` или `localhost` (из-за политик безопасности браузера). При использовании простого `file://` выбор папки будет недоступен, но можно выбрать файлы по одному.
- Поддерживаемые аудиоформаты зависят от браузера. Обычно это `.mp3`, `.ogg`, `.wav`, `.flac` (в некоторых браузерах).
- При экспорте данных ссылки на файловые дескрипторы (handles) удаляются, поэтому после импорта необходимо повторно выбрать папку с музыкой. Сами файлы, конечно, не копируются.

---

# 🎵 Music Player with Tags and Queue

A web application for playing music directly in the browser with tag support, flexible volume control, a playback queue, playlists, a visualizer, and multiple themes. All data is stored locally in IndexedDB; music files are read via the File System Access API (or standard file picker).

**Note:** This project uses third‑party libraries:
- [SortableJS](https://github.com/SortableJS/Sortable) for drag‑and‑drop queue reordering.
- [jsmediatags](https://github.com/aadsm/jsmediatags) for reading audio metadata (album art).

I did not write these libraries; full credit goes to their respective authors.

---

## 🚀 Key Features

- **Track Library** – after selecting a music folder, all audio files are displayed in a list.
- **Tags** – each track can have arbitrary tags (e.g., "rock", "instrumental"). Tags are used for filtering, excluding tracks, and volume adjustment.
- **Excluding Tracks** – the tag `excluded` removes a track from random selection (used by the "Add random" button in the queue).
- **Per‑Tag Volume** – you can set a volume factor (0.0 to 2.0) for any tag. The final volume of a track is the product of the factors from all its tags (clamped to 0.1–2.0). An individual tag like `vol50` (50% of base volume) is also supported and takes precedence.
- **Playback Queue** – tracks can be added to a queue; order can be changed with up/down buttons or by drag & drop. The queue is persisted between sessions.
- **Playlists** – create named lists of tracks, add tracks to a playlist, reorder tracks inside a playlist, load a playlist into the queue.
- **Random Track** – the "Add random" button adds a random, non‑excluded track from the library to the queue.
- **Player** – basic controls: play/pause, previous/next, progress slider, volume slider.
- **Visualizer** – while playing, an animation (bars, waveform, circle, fire) reacts to the sound and is shown in place of the album art or on the track details page. Visualizer settings are available in the settings section.
- **Themes** – several built‑in colour schemes (light, dark, blue, purple, green, orange, monochrome, Dracula, Nord, Solarized). You can also change the primary colour and fine‑tune individual interface colours (background, text, borders, etc.).
- **Export / Import** – all tags, volume settings, queue, playlists, and track information can be saved to a JSON file and restored later. File handles are stripped on export (for security), so after import you must reselect the music folder.
- **Track Details Page** – click "Details" on a track to view and edit its tags, exclude it, add it to the queue, or play it immediately.

---

## 📖 How to Use

0. Download on https://github.com/TheSamoanThor/test-frontend-music-app/releases/latest 
1. Open `index.html` in a modern browser (Chrome, Edge, Opera recommended for full File System Access support).
2. Click **"Select music folder"** and choose a folder containing audio files. The app will scan it recursively and add all supported audio files to the library.  
   *Note:* If your browser does not support folder selection, you will be prompted to pick files individually.
3. Once the library is loaded, you'll see a list of tracks. Use the tag filter (enter tags separated by commas) and the name search to quickly find tracks.
4. Manage tags:
   - To add a tag, type it into the input field next to the track and click **"Add"**.
   - To remove a tag, click the cross icon beside it.
   - The **"Exclude"** button toggles the `excluded` tag.
5. Playback options:
   - Click **"Add to queue"** (the track is appended to the queue; if the queue was empty, playback starts).
   - Drag a track from the library and drop it onto the queue area (the "Queue" tab).
   - On the track details page, click **"Play now"**.
6. The **"Queue"** tab shows the current queue. You can:
   - Change order with ↑/↓ buttons or by dragging items.
   - Remove tracks from the queue (✖ button).
   - Clear the entire queue, shuffle it, or add a random track.
7. The **"Playlists"** tab lets you create playlists, view their contents, reorder tracks inside a playlist, and load a playlist into the queue.
8. The **"Settings"** tab lets you:
   - Choose a theme and the primary colour.
   - Fine‑tune interface colours (changes are saved automatically).
   - Adjust visualizer parameters (type, sensitivity, bar count, smoothing).
   - View the list of excluded tracks and remove exclusions.
   - Export or import data.
9. Navigation between pages is done via the header buttons (or by using URL hashes).

---

## 🔧 Technical Details

- **Storage:** IndexedDB (object stores: tracks, queue, settings, tags, tagVolumes, playlists).
- **File access:** The File System Access API (`showDirectoryPicker`) is used to obtain a folder handle and read files on demand. A fallback to multiple file selection (`<input type="file">`) is provided for unsupported browsers.
- **Drag & Drop:** The queue uses [SortableJS](https://github.com/SortableJS/Sortable).
- **Audio player:** Native `<audio>` element.
- **Visualizer:** Web Audio API (`AnalyserNode`) to obtain frequency data and draw on a canvas.
- **Themes:** CSS custom properties (variables) that are dynamically changed via JavaScript. Presets are stored in an object; user overrides are saved in IndexedDB.
- **Per‑tag volume:** When a track is played, all its tags are collected. For each tag, a volume factor is retrieved (either from the tagVolumes store or from a tag like `volNN`), then multiplied together. The result is clamped to [0.1, 2.0] and multiplied by the base volume (the volume slider). If the track has a `volNN` tag, it overrides any per‑tag rules.

---

## 📌 Notes

- The application runs entirely in the browser; no data is sent to any server.
- For the File System Access API to work, the page must be served over `https://` or from `localhost` (due to browser security policies). When opened via `file://`, folder selection is unavailable, but you can still pick files individually.
- Supported audio formats depend on the browser. Typically these include `.mp3`, `.ogg`, `.wav`, `.flac` (in some browsers).
- When exporting data, file handles are removed, so after importing you must reselect the music folder. The actual files are not copied.