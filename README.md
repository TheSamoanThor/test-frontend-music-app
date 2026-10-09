# Music Player с тегами и очередью

Веб-приложение для проигрывания музыки прямо в браузере с поддержкой тегов, гибкой настройкой громкости, очередью воспроизведения, плейлистами, визуализатором и множеством тем оформления. Все данные по умолчанию хранятся локально в IndexedDB, музыкальные файлы читаются через File System Access API (или стандартный выбор файлов). Дополнительно доступен опциональный локальный сервер (FastAPI + SQLite) для стриминга музыки по сети и синхронизации данных между устройствами.

**Важно:** В проекте используются сторонние библиотеки:
- [SortableJS](https://github.com/SortableJS/Sortable) для перетаскивания элементов очереди.
- [jsmediatags](https://github.com/aadsm/jsmediatags) для чтения метаданных аудиофайлов (обложек).

Я не писал эти библиотеки; вся заслуга принадлежит их авторам.

---

## Варианты поставки

Готовые сборки публикуются в [Releases](https://github.com/TheSamoanThor/test-frontend-music-app/releases/latest). В каждом релизе три архива:

| Архив | Для чего | Что внутри |
| --- | --- | --- |
| `music-player-frontend-*.zip` | Локальное прослушивание (браузер читает ваши файлы) | `index.html`, `styles.css`, `js/` |
| `music-player-server-*.zip` | Хостинг музыки на своём ПК или в локальной сети | `server.py`, `requirements.txt`, скрипты запуска, пустая `music/` |
| `music-player-full-*.zip` | И фронтенд, и сервер вместе | Объединённое содержимое обоих архивов |

Также в релизе присутствует файл `SHA256SUMS.txt` для проверки целостности.

---

## Основные возможности

- **Библиотека треков** – после выбора папки с музыкой все аудиофайлы отображаются в виде списка.
- **Теги** – каждому треку можно присвоить произвольные теги (например, «рок», «instrumental»). Теги используются для фильтрации, исключения треков и настройки громкости.
- **Исключение треков** – тег `excluded` исключает трек из случайного выбора (кнопка «Добавить случайную» в очереди).
- **Громкость по тегам** – для каждого тега можно задать коэффициент громкости (от 0.0 до 2.0). Итоговая громкость трека перемножается из всех его тегов (но не более 2.0 и не менее 0.1). Также поддерживается индивидуальный тег вида `vol50` (громкость 50% от базовой).
- **Интервалы громкости** – для отдельного трека можно задать участки времени с собственным множителем громкости (например, тише на интро). Редактор интервалов открывается из страницы деталей трека.
- **Очередь воспроизведения** – треки можно добавлять в очередь, менять порядок кнопками вверх/вниз или перетаскиванием (drag & drop). Очередь сохраняется между сессиями.
- **Плейлисты** – создавайте именованные списки треков, добавляйте треки в плейлист, изменяйте порядок треков внутри плейлиста, загружайте плейлист в очередь. Текущую очередь можно сохранить как плейлист.
- **Случайный трек** – кнопка «Добавить случайную» добавляет в очередь случайный трек из библиотеки, не помеченный как исключённый. Также есть «+10 случайных».
- **Плеер** – базовое управление: play/pause, предыдущий/следующий трек, ползунок прогресса, регулировка громкости, перемотка ±10 секунд, три режима повтора (выключен, один трек, вся очередь).
- **Визуализатор** – во время воспроизведения на месте обложки или на странице деталей трека отображается анимация (полоски, волна, круг, пламя), реагирующая на звук. Настройки визуализатора доступны в разделе настроек.
- **Темы оформления** – несколько готовых цветовых схем (светлая, тёмная, тёмная 2, светло-синяя, тёмно-фиолетовая, зелёная, оранжевая, монохромная, Dracula, Nord, Solarized). Можно изменить основной цвет, а также тонко настроить отдельные цвета интерфейса (фон, текст, границы и т.д.).
- **Позиция панели навигации** – сверху, снизу, слева или справа. На узких экранах боковые позиции автоматически недоступны.
- **Режим клика по треку в библиотеке** – можно выбрать: открывать страницу деталей или сразу воспроизводить.
- **Archive.org** – встроенный поиск музыки и функция «Радио» (случайная волна по случайно выбранному ключевому слову). Найденные треки можно добавить в очередь, воспроизвести сразу или сохранить в библиотеку.
- **Свой сервер** – подключение к локальному серверу (см. раздел «Сервер»): поиск и радио по трекам сервера, загрузка музыки на сервер, пересканирование папки `music/`, синхронизация локальных данных (теги, плейлисты, очередь, интервалы, настройки) с сервером в обе стороны.
- **Экспорт / импорт данных** – все теги, настройки громкости, очередь, плейлисты, интервалы громкости и информация о треках могут быть сохранены в JSON-файл и восстановлены позже. Ссылки на файлы при экспорте не сохраняются (из соображений безопасности), поэтому после импорта потребуется заново выбрать папку с музыкой.
- **Детальная информация о треке** – при клике на «Подробнее» открывается страница трека, где можно просмотреть и отредактировать теги, исключить трек, добавить в очередь, начать воспроизведение, добавить в плейлист или открыть редактор интервалов громкости.

---

## Как использовать

0. Скачайте по ссылке: https://github.com/TheSamoanThor/test-frontend-music-app/releases/latest
1. Откройте `index.html` (двойной клик по файлу) в современном браузере (Chrome, Edge, Opera рекомендуются для полной поддержки File System Access и других API).
2. Нажмите **«Выбрать музыку»** и укажите папку с аудиофайлами. Приложение просканирует её рекурсивно и добавит все поддерживаемые аудиофайлы в библиотеку.  
   *Примечание:* Если ваш браузер не поддерживает выбор папки, будет предложено выбрать файлы по отдельности (через стандартное окно).
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
   - Очистить всю очередь, перемешать её или добавить случайный трек (+1 или +10).
   - Сохранить очередь как плейлист.
7. Во вкладке **«Плейлисты»** можно создавать плейлисты, просматривать их содержимое, изменять порядок треков внутри плейлиста и загружать плейлист в очередь.
8. Во вкладке **«Archive.org»** можно искать музыку и запускать радио. Найденные треки можно добавить в очередь, воспроизвести сразу, сохранить в библиотеку или открыть страницу с подробностями.
9. Во вкладке **«Свой сервер»** можно подключиться к локальному серверу (см. раздел «Сервер»): проверить соединение, загрузить музыку на сервер, пересканировать папку `music/`, искать треки, запускать радио по тегу или без него, а также синхронизировать данные (выгрузить локальные на сервер или загрузить с сервера).
10. Во вкладке **«Настройки»** можно:
    - Выбрать тему оформления и основной цвет.
    - Тонко настроить цвета интерфейса (изменения сохраняются автоматически).
    - Настроить параметры визуализатора (тип, чувствительность, количество полос, сглаживание, симметрия).
    - Просмотреть список исключённых треков и снимать исключение.
    - Выбрать позицию панели навигации.
    - Включить или выключить открытие страницы деталей по клику на трек.
    - Настроить адрес сервера, включить логирование на сервере, синхронизировать данные.
    - Экспортировать или импортировать данные.
11. Навигация между страницами осуществляется с помощью кнопок в шапке (или через хэши в адресной строке).

### Горячие клавиши

| Клавиша | Действие |
| --- | --- |
| `Space` | Play / Pause |
| `←` / `→` | Предыдущий / следующий трек |
| `↑` / `↓` | Громкость ±5 |
| `Ctrl+F` | Настройки |
| `Ctrl+Q` | Очередь |
| `Ctrl+L` | Библиотека |

Горячие клавиши не срабатывают, когда фокус находится в поле ввода, textarea или select.

---

## Сервер

Сервер опционален. Он нужен, если вы хотите:

- слушать музыку из браузера на других устройствах в сети;
- хранить один общий набор треков, тегов и плейлистов;
- стримить аудио с поддержкой Range-запросов (перемотка).

### Структура серверной части

```
.
├── server.py             # FastAPI-приложение + SQLite
├── requirements.txt      # файл с зависимостями проекта
├── music/                # сюда кладите аудиофайлы
├── music.db              # создаётся автоматически при первом запуске
├── server.log            # создаётся, если включено логирование
├── start_server.bat      # Windows
├── start-server.sh       # Linux/macOS
└── reset_network.bat     # Windows-утилита (сброс Winsock / TCP-IP)
```

### Запуск приложения с сервером

Windows:
1. Установите Python 3.10+ с https://python.org (галочка «Add to PATH»).
2. Запустите `start_server.bat`. Скрипт сам создаст `venv` и установит зависимости.
3. Откройте http://localhost:8000 или дождитесь открытия самим скриптом

Linux / macOS:
```bash
chmod +x start-server.sh
./start-server.sh
```

Вручную (любая ОС):
```bash
python -m venv venv
source venv/bin/activate           # Windows: venv\Scripts\activate
pip install -r requirements.txt
python server.py
```

Если при установке зависимостей возникают проблемы с сетью, на Windows есть утилита `reset_network.bat`. Она сбрасывает Winsock, TCP/IP и кэш DNS; требуются права администратора и перезагрузка.

### Как пользоваться сервером

1. Запустите сервер.
2. В веб-интерфейсе откройте раздел «Свой сервер».
3. Убедитесь, что статус — «Сервер доступен».
4. Загрузите музыку кнопкой «Загрузить музыку на сервер» или положите файлы прямо в папку `music/` и нажмите «Пересканировать music/».
5. Дальше работают поиск, радио (по тегу или случайная волна) и синхронизация данных.

### Ограничения сервера

- Сервер хранит только треки с `source: "server"`. Локальные файлы браузера и archive.org-стримы на сервер не выгружаются.
- Файлы сохраняются в `music/` под именем `<uuid>__<оригинальное_имя>`, оригинал показывается в БД.
- Логирование выключено по умолчанию, включается из интерфейса.

### API сервера

Все ответы — JSON. Базовый URL — `http://localhost:8000`.

| Метод | Путь | Назначение |
| --- | --- | --- |
| `GET` | `/api/health` | Проверка доступности |
| `GET` | `/api/tracks` | Список треков |
| `POST` | `/api/tracks` | Создать или заменить трек |
| `DELETE` | `/api/tracks/{id}` | Удалить трек (вместе с файлом) |
| `GET` | `/api/tracks/search?q=` | Поиск по имени |
| `GET` | `/api/tracks/radio?tag=&limit=` | Случайные треки (опционально по тегу) |
| `GET` | `/api/stream/{id}` | Стрим аудио (поддерживает `Range`) |
| `POST` | `/api/upload` | Загрузка файлов (multipart/form-data) |
| `POST` | `/api/scan` | Пересканировать `music/` |
| `GET` / `POST` | `/api/settings[/{key}]` | Настройки (JSON) |
| `GET` / `PUT` | `/api/tags/{track_id}` | Теги трека |
| `GET` | `/api/tags` | Теги всех треков |
| `GET` / `POST` / `DELETE` | `/api/playlists[/{id}]` | Плейлисты |
| `GET` / `PUT` | `/api/queue` | Очередь |
| `GET` / `PUT` | `/api/volume-intervals/{track_id}` | Интервалы громкости |
| `GET` | `/api/backup/export` | Полный экспорт |
| `POST` | `/api/backup/import` | Полный импорт |
| `POST` | `/api/log` | Записать событие в `server.log` |
| `POST` | `/api/log-config` | Включить или выключить логирование |

---

## Технические детали

- **Хранилище:** IndexedDB (объекты: `tracks`, `queue`, `settings`, `tags`, `tagVolumes`, `playlists`, `volumeIntervals`).
- **Доступ к файлам:** используется File System Access API (`showDirectoryPicker`) для получения доступа к папке и возможности читать файлы по мере необходимости. В качестве запасного варианта – множественный выбор файлов через `<input type="file">`.
- **Drag & Drop:** для очереди используется библиотека [SortableJS](https://github.com/SortableJS/Sortable).
- **Аудиоплеер:** встроенный элемент `<audio>`. Потоковые источники (archive.org, сервер) подключаются с `crossOrigin="anonymous"`.
- **Визуализатор:** Web Audio API (`AnalyserNode`) для получения частотных данных и отрисовки на canvas.
- **Темы:** CSS-переменные, которые динамически меняются через JavaScript. Пресеты хранятся в объекте, пользовательские переопределения сохраняются в IndexedDB.
- **Громкость по тегам:** при воспроизведении трека собираются все его теги, для каждого из них извлекается коэффициент громкости (из хранилища `tagVolumes` или из самого тега вида `volNN`), затем они перемножаются. Результат ограничивается диапазоном [0.1, 2.0] и умножается на базовую громкость (ползунок громкости плеера). Если трек имеет тег `volNN`, он имеет приоритет над правилами для тегов.
- **Интервалы громкости:** для трека хранится список интервалов `{start, end, volume}`. При воспроизведении множитель активного интервала дополнительно применяется к итоговой громкости.
- **Сервер:** FastAPI + SQLite. Статика фронтенда раздаётся через `StaticFiles`, аудио — через `StreamingResponse` с корректной обработкой заголовка `Range` (код `206 Partial Content`).
- **Синхронизация:** обмен данными между IndexedDB и сервером идёт через `/api/backup/export` и `/api/backup/import`. Треки с `source: "server"` переносятся, локальные файлы браузера и archive.org-стримы — нет.

---

## Примечания

- Приложение работает полностью в браузере, никакие данные не отправляются на сторонние серверы. Если не включать свой сервер, все данные остаются локально.
- Для корректной работы File System Access API требуется, чтобы сайт открывался через `https://` или `localhost` (из-за политик безопасности браузера).
- Поддерживаемые аудиоформаты зависят от браузера. Обычно это `.mp3`, `.ogg`, `.wav`, `.flac` (в некоторых браузерах).
- При экспорте данных ссылки на файловые дескрипторы (handles) удаляются, поэтому после импорта необходимо повторно выбрать папку с музыкой. Сами файлы, конечно, не копируются.
- Потоковые треки (archive.org, сервер) не сохраняются в очередь между сессиями: у них нет стабильного `id` в IndexedDB, поэтому при сохранении очереди они отфильтровываются.

---

## Разработка

Проект не требует сборщика: всё работает как обычные скрипты без бандлинга. Правки в `js/**` и `styles.css` подхватываются сразу после перезагрузки страницы.

CI: GitHub Actions собирает три архива (frontend, server, full) по тегу `v*`, см. `.github/workflows/release.yml`.

---

# Music Player with Tags and Queue

A web application for playing music directly in the browser with tag support, flexible volume control, a playback queue, playlists, a visualizer, and multiple themes. By default, all data is stored locally in IndexedDB; music files are read via the File System Access API (or standard file picker). An optional local server (FastAPI + SQLite) is also available for network streaming and data sync.

**Note:** This project uses third-party libraries:
- [SortableJS](https://github.com/SortableJS/Sortable) for drag-and-drop queue reordering.
- [jsmediatags](https://github.com/aadsm/jsmediatags) for reading audio metadata (album art).

I did not write these libraries; full credit goes to their respective authors.

---

## Release bundles

Ready-to-use builds are published in [Releases](https://github.com/TheSamoanThor/test-frontend-music-app/releases/latest). Each release contains three archives:

| Archive | Purpose | Contents |
| --- | --- | --- |
| `music-player-frontend-*.zip` | Local listening (browser reads your files) | `index.html`, `styles.css`, `js/` |
| `music-player-server-*.zip` | Hosting music on your PC or LAN | `server.py`, `requirements.txt`, launch scripts, empty `music/` |
| `music-player-full-*.zip` | Both frontend and server together | Combined contents of the two archives above |

A `SHA256SUMS.txt` file is also included in each release for integrity verification.

---

## Key Features

- **Track Library** – after selecting a music folder, all audio files are displayed in a list.
- **Tags** – each track can have arbitrary tags (e.g., "rock", "instrumental"). Tags are used for filtering, excluding tracks, and volume adjustment.
- **Excluding Tracks** – the tag `excluded` removes a track from random selection (used by the "Add random" button in the queue).
- **Per-Tag Volume** – you can set a volume factor (0.0 to 2.0) for any tag. The final volume of a track is the product of the factors from all its tags (clamped to 0.1–2.0). An individual tag like `vol50` (50% of base volume) is also supported and takes precedence.
- **Volume Intervals** – for an individual track you can define time ranges with their own volume multiplier (for example, quieter during the intro). The interval editor is opened from the track details page.
- **Playback Queue** – tracks can be added to a queue; order can be changed with up/down buttons or by drag & drop. The queue is persisted between sessions.
- **Playlists** – create named lists of tracks, add tracks to a playlist, reorder tracks inside a playlist, load a playlist into the queue. The current queue can be saved as a playlist.
- **Random Track** – the "Add random" button adds a random, non-excluded track from the library to the queue. There is also "+10 random".
- **Player** – basic controls: play/pause, previous/next, progress slider, volume slider, ±10 second skip, and three repeat modes (off, repeat one, repeat queue).
- **Visualizer** – while playing, an animation (bars, waveform, circle, fire) reacts to the sound and is shown in place of the album art or on the track details page. Visualizer settings are available in the settings section.
- **Themes** – several built-in colour schemes (light, dark, dark 2, light blue, dark purple, green, orange, monochrome, Dracula, Nord, Solarized). You can also change the primary colour and fine-tune individual interface colours (background, text, borders, etc.).
- **Navigation position** – top, bottom, left, or right. On narrow screens, side positions are automatically unavailable.
- **Library click behaviour** – choose whether clicking a track opens the details page or starts playback immediately.
- **Archive.org** – built-in music search and a "Radio" feature (random wave based on a randomly selected keyword). Found tracks can be added to the queue, played immediately, or saved to the library.
- **Custom server** – connect to a local server (see the "Server" section below): search and radio on server tracks, upload music to the server, rescan the `music/` folder, and synchronise local data (tags, playlists, queue, intervals, settings) with the server in both directions.
- **Export / Import** – all tags, volume settings, queue, playlists, volume intervals, and track information can be saved to a JSON file and restored later. File handles are stripped on export (for security), so after import you must reselect the music folder.
- **Track Details Page** – click "Details" on a track to view and edit its tags, exclude it, add it to the queue, play it immediately, add it to a playlist, or open the volume interval editor.

---

## How to Use

0. Download on https://github.com/TheSamoanThor/test-frontend-music-app/releases/latest
1. Open `index.html` (double click on file) in a modern browser (Chrome, Edge, Opera recommended for full File System Access support and other APIs).
2. Click **"Select music"** and choose a folder containing audio files. The app will scan it recursively and add all supported audio files to the library.  
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
   - Clear the entire queue, shuffle it, or add a random track (+1 or +10).
   - Save the queue as a playlist.
7. The **"Playlists"** tab lets you create playlists, view their contents, reorder tracks inside a playlist, and load a playlist into the queue.
8. The **"Archive.org"** tab lets you search for music and start the radio. Found tracks can be added to the queue, played immediately, saved to the library, or opened on a details page.
9. The **"Custom server"** tab lets you connect to a local server (see the "Server" section below): check the connection, upload music, rescan the `music/` folder, search for tracks, start the radio (with or without a tag), and synchronise data (upload local data to the server or download data from the server).
10. The **"Settings"** tab lets you:
    - Choose a theme and the primary colour.
    - Fine-tune interface colours (changes are saved automatically).
    - Adjust visualizer parameters (type, sensitivity, bar count, smoothing, symmetry).
    - View the list of excluded tracks and remove exclusions.
    - Choose the navigation panel position.
    - Enable or disable opening the details page on track click.
    - Configure the server URL, enable server-side logging, and synchronise data.
    - Export or import data.
11. Navigation between pages is done via the header buttons (or by using URL hashes).

### Hotkeys

| Key | Action |
| --- | --- |
| `Space` | Play / Pause |
| `←` / `→` | Previous / next track |
| `↑` / `↓` | Volume ±5 |
| `Ctrl+F` | Settings |
| `Ctrl+Q` | Queue |
| `Ctrl+L` | Library |

Hotkeys do not fire when focus is in an input, textarea, or select element.

---

## Server

The server is optional. It is needed if you want to:

- listen to music from a browser on other devices in the network;
- keep a single shared set of tracks, tags, and playlists;
- stream audio with Range request support (seeking).

### Server-side layout

```
.
├── server.py             # FastAPI application + SQLite
├── requirements.txt      # project dependencies file
├── music/                # put your audio files here
├── music.db              # created automatically on first launch
├── server.log            # created if logging is enabled
├── start_server.bat      # Windows
├── start-server.sh       # Linux/macOS
└── reset_network.bat     # Windows utility (resets Winsock / TCP-IP)
```

### Launch app with server

Windows:
1. Install Python 3.10+ from https://python.org (check "Add to PATH").
2. Run `start_server.bat`. The script creates a `venv` and installs dependencies automatically.
3. Open http://localhost:8000 or wait till the script opens it for you

Linux / macOS:
```bash
chmod +x start-server.sh
./start-server.sh
```

Manually (any OS):
```bash
python -m venv venv
source venv/bin/activate           # Windows: venv\Scripts\activate
pip install -r requirements.txt
python server.py
```

If dependency installation fails due to network issues, on Windows you can run `reset_network.bat`. It resets Winsock, TCP/IP, and the DNS cache; administrator rights and a reboot are required.

### Using the server

1. Start the server.
2. In the web interface, open the "Custom server" section.
3. Make sure the status shows "Server available".
4. Upload music with the "Upload music to server" button, or put files directly into the `music/` folder and click "Rescan music/".
5. Search, radio (by tag or random wave), and data synchronisation then become available.

### Server limitations

- The server stores only tracks with `source: "server"`. Local browser files and archive.org streams are not uploaded.
- Files are stored in `music/` under the name `<uuid>__<original_name>`; the original is shown in the database.
- Logging is disabled by default and can be enabled from the interface.

### Server API

All responses are JSON. Base URL — `http://localhost:8000`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/tracks` | List tracks |
| `POST` | `/api/tracks` | Create or replace a track |
| `DELETE` | `/api/tracks/{id}` | Delete a track (and its file) |
| `GET` | `/api/tracks/search?q=` | Search by name |
| `GET` | `/api/tracks/radio?tag=&limit=` | Random tracks (optionally by tag) |
| `GET` | `/api/stream/{id}` | Audio stream (supports `Range`) |
| `POST` | `/api/upload` | Upload files (multipart/form-data) |
| `POST` | `/api/scan` | Rescan `music/` |
| `GET` / `POST` | `/api/settings[/{key}]` | Settings (JSON) |
| `GET` / `PUT` | `/api/tags/{track_id}` | Track tags |
| `GET` | `/api/tags` | Tags of all tracks |
| `GET` / `POST` / `DELETE` | `/api/playlists[/{id}]` | Playlists |
| `GET` / `PUT` | `/api/queue` | Queue |
| `GET` / `PUT` | `/api/volume-intervals/{track_id}` | Volume intervals |
| `GET` | `/api/backup/export` | Full export |
| `POST` | `/api/backup/import` | Full import |
| `POST` | `/api/log` | Write an event to `server.log` |
| `POST` | `/api/log-config` | Enable or disable logging |

---

## Technical Details

- **Storage:** IndexedDB (object stores: `tracks`, `queue`, `settings`, `tags`, `tagVolumes`, `playlists`, `volumeIntervals`).
- **File access:** The File System Access API (`showDirectoryPicker`) is used to obtain a folder handle and read files on demand. A fallback to multiple file selection (`<input type="file">`) is provided for unsupported browsers.
- **Drag & Drop:** The queue uses [SortableJS](https://github.com/SortableJS/Sortable).
- **Audio player:** Native `<audio>` element. Streaming sources (archive.org, server) are attached with `crossOrigin="anonymous"`.
- **Visualizer:** Web Audio API (`AnalyserNode`) to obtain frequency data and draw on a canvas.
- **Themes:** CSS custom properties (variables) that are dynamically changed via JavaScript. Presets are stored in an object; user overrides are saved in IndexedDB.
- **Per-tag volume:** When a track is played, all its tags are collected. For each tag, a volume factor is retrieved (either from the `tagVolumes` store or from a tag like `volNN`), then multiplied together. The result is clamped to [0.1, 2.0] and multiplied by the base volume (the volume slider). If the track has a `volNN` tag, it overrides any per-tag rules.
- **Volume intervals:** a list of `{start, end, volume}` intervals is stored per track. During playback, the multiplier of the active interval is applied on top of the effective volume.
- **Server:** FastAPI + SQLite. Frontend static files are served through `StaticFiles`; audio is served through `StreamingResponse` with correct handling of the `Range` header (`206 Partial Content`).
- **Synchronisation:** data is exchanged between IndexedDB and the server through `/api/backup/export` and `/api/backup/import`. Only tracks with `source: "server"` are transferred; local browser files and archive.org streams are not.

---

## Notes

- The application runs entirely in the browser; no data is sent to third-party servers. If you don't enable your own server, all data stays local.
- For the File System Access API to work, the page must be served over `https://` or from `localhost` (due to browser security policies).
- Supported audio formats depend on the browser. Typically these include `.mp3`, `.ogg`, `.wav`, `.flac` (in some browsers).
- When exporting data, file handles are removed, so after importing you must reselect the music folder. The actual files are not copied.
- Streaming tracks (archive.org, server) are not persisted in the queue between sessions: they have no stable `id` in IndexedDB, so they are filtered out when the queue is saved.

---

## Development

The project does not require a bundler: everything runs as plain scripts. Changes to `js/**` and `styles.css` take effect after a page reload.

CI: GitHub Actions builds three archives (frontend, server, full) on tags matching `v*` — see `.github/workflows/release.yml`.
