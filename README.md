# Music Player с тегами и очередью
<hr>
<h2>Краткое описание</h2>
<p>Проект представляет собой веб-приложение для проигрывания музыки, которое позволяет пользователю выбирать папку с аудиофайлами, управлять очередью воспроизведения, назначать трекам теги и фильтровать по ним, исключать треки из случайного выбора, а также настраивать внешний вид интерфейса. Все данные (треки, теги, исключения, настройки) сохраняются в IndexedDB браузера, что обеспечивает постоянство между сессиями.</p>
<p>Приложение использует современные API браузера: File System Access API для прямого доступа к папкам (с запасным вариантом через обычный выбор файлов) и Web Audio API для воспроизведения. Интерфейс адаптивен и поддерживает смену темы оформления (светлая, тёмная, контрастная, пользовательская).</p>
<p>Основные возможности:</p>
<ul>
    <li>Выбор папки с музыкой и рекурсивное сканирование всех аудиофайлов.</li>
    <li>Отображение библиотеки треков с возможностью добавления тегов и исключения треков.</li>
    <li>Фильтрация библиотеки по одному или нескольким тегам.</li>
    <li>Очередь воспроизведения: добавление треков, изменение порядка, удаление, перемешивание.</li>
    <li>Случайное добавление трека из библиотеки с учётом исключений.</li>
    <li>Управление воспроизведением (пауза, следующий/предыдущий трек, ползунок прогресса, громкость).</li>
    <li>Экспорт и импорт всех данных (треков, тегов, очереди, настроек) в JSON-файл.</li>
</ul>
<h2>Класс UI</h2>
<p>Отвечает за отрисовку пользовательского интерфейса, обработку событий от элементов управления и взаимодействие с другими модулями.</p>
<ol>
    <li>constructor</li>
    <li>initEventListeners</li>
    <li>renderLibrary</li>
    <li>renderQueue</li>
    <li>updateCurrentTrack</li>
    <li>setPlayPauseIcon</li>
    <li>exportData</li>
    <li>importData</li>
</ol>
<hr>
<h3>constructor(db, player, fileHandler, themeManager)</h3>
<p>Сохраняет ссылки на экземпляры базы данных, плеера, обработчика файлов и менеджера тем. Инициализирует массив текущих тегов фильтрации и вызывает initEventListeners.</p>
<h3>initEventListeners()</h3>
<p>Назначает обработчики событий для всех элементов интерфейса: кнопки выбора папки, экспорта/импорта, смены темы, фильтрации, управления плеером и очередью.</p>
<h3>async renderLibrary()</h3>
<p>Получает все треки из базы, применяет фильтрацию по тегам (если заданы) и отрисовывает список треков. Для каждого трека отображает название, длительность, теги и кнопки добавления тега, исключения, добавления в очередь.</p>
<h3>async renderQueue(queueIds)</h3>
<p>Принимает массив идентификаторов треков в очереди и отрисовывает их с кнопками для изменения порядка (вверх/вниз) и удаления.</p>
<h3>updateCurrentTrack(track)</h3>
<p>Обновляет отображение названия текущего трека в нижней панели.</p>
<h3>setPlayPauseIcon(playing)</h3>
<p>Меняет иконку кнопки воспроизведения в зависимости от состояния (▶️ или ⏸️).</p>
<h3>async exportData()</h3>
<p>Экспортирует все данные из IndexedDB в JSON-файл и инициирует его скачивание.</p>
<h3>async importData()</h3>
<p>Открывает диалог выбора файла, читает JSON и импортирует данные в базу, после чего обновляет библиотеку, очередь и тему.</p>
<hr>
<h2>Класс Player</h2>
<p>Управляет воспроизведением аудио, очередью и состоянием плеера.</p>
<ol>
    <li>constructor</li>
    <li>setUI</li>
    <li>initAudioEvents</li>
    <li>loadQueue</li>
    <li>loadTrack</li>
    <li>play</li>
    <li>pause</li>
    <li>togglePlay</li>
    <li>next</li>
    <li>prev</li>
    <li>addToQueue</li>
    <li>removeFromQueue</li>
    <li>clearQueue</li>
    <li>shuffleQueue</li>
    <li>addRandomFromLibrary</li>
    <li>setVolume</li>
    <li>seek</li>
</ol>
<hr>
<h3>constructor(db, fileHandler)</h3>
<p>Инициализирует Audio-объект, загружает сохранённую очередь из базы, подписывается на события аудио. Сохраняет ссылки на базу данных и обработчик файлов.</p>
<h3>setUI(ui)</h3>
<p>Устанавливает ссылку на экземпляр UI для обратной связи (обновление интерфейса при изменениях).</p>
<h3>initAudioEvents()</h3>
<p>Подписывается на события аудио: timeupdate (обновление прогресса), ended (переход к следующему треку), error (переход к следующему при ошибке).</p>
<h3>async loadQueue()</h3>
<p>Загружает очередь из базы данных, обновляет UI и, если очередь не пуста и текущий индекс не задан, начинает воспроизведение первого трека.</p>
<h3>async loadTrack(trackId)</h3>
<p>Загружает трек по идентификатору, получает File-объект через FileHandler, устанавливает его как источник Audio, обновляет текущий трек в UI. Возвращает true при успехе.</p>
<h3>async play()</h3>
<p>Запускает воспроизведение, если есть текущий трек (или выбирает первый из очереди). Устанавливает isPlaying в true и обновляет иконку.</p>
<h3>pause()</h3>
<p>Приостанавливает воспроизведение, обновляет состояние и иконку.</p>
<h3>togglePlay()</h3>
<p>Переключает между воспроизведением и паузой.</p>
<h3>async next()</h3>
<p>Переходит к следующему треку в очереди (циклически), загружает его и запускает воспроизведение, если плеер был в состоянии воспроизведения.</p>
<h3>async prev()</h3>
<p>Переходит к предыдущему треку в очереди (циклически), загружает его и запускает воспроизведение, если плеер был в состоянии воспроизведения.</p>
<h3>async addToQueue(trackIds)</h3>
<p>Добавляет массив идентификаторов треков в конец очереди, сохраняет очередь в базу и обновляет UI.</p>
<h3>async removeFromQueue(index)</h3>
<p>Удаляет трек из очереди по индексу. Если удалён текущий трек, переключается на следующий или останавливает плеер при пустой очереди. Корректирует currentIndex при необходимости.</p>
<h3>async clearQueue()</h3>
<p>Очищает очередь, останавливает воспроизведение, сбрасывает текущий трек и обновляет UI и базу.</p>
<h3>async shuffleQueue()</h3>
<p>Перемешивает очередь случайным образом, сохраняет изменения и обновляет UI.</p>
<h3>shuffleArray(arr)</h3>
<p>Вспомогательный метод для перемешивания массива (алгоритм Фишера-Йетса).</p>
<h3>async addRandomFromLibrary()</h3>
<p>Выбирает случайный трек из библиотеки, исключая те, которые помечены как исключённые (с until=0 или будущей датой), и добавляет его в очередь.</p>
<h3>setVolume(percent)</h3>
<p>Устанавливает громкость Audio (0–100).</p>
<h3>seek(percent)</h3>
<p>Перематывает трек на указанный процент длительности.</p>
<hr>
<h2>Класс FileHandler</h2>
<p>Отвечает за выбор файлов и папок, чтение аудиофайлов и получение их длительности.</p>
<ol>
    <li>constructor</li>
    <li>pickDirectory</li>
    <li>processDirectory</li>
    <li>getAudioDuration</li>
    <li>pickFiles</li>
    <li>getFileForTrack</li>
</ol>
<hr>
<h3>constructor(db)</h3>
<p>Сохраняет ссылку на базу данных и проверяет поддержку File System Access API.</p>
<h3>async pickDirectory()</h3>
<p>Если поддерживается, открывает диалог выбора папки и обрабатывает её рекурсивно. Иначе вызывает pickFiles для стандартного выбора файлов. Возвращает массив добавленных треков.</p>
<h3>async processDirectory(dirHandle, path = '')</h3>
<p>Рекурсивно обходит директорию, для каждого аудиофайла создаёт объект трека с временным идентификатором, запускает асинхронное получение длительности и добавляет трек в базу. Возвращает массив созданных треков.</p>
<h3>getAudioDuration(file)</h3>
<p>Возвращает Promise с длительностью аудиофайла в секундах (использует скрытый Audio-элемент).</p>
<h3>async pickFiles()</h3>
<p>Запасной метод для браузеров без поддержки File System Access. Открывает диалог выбора нескольких файлов, создаёт треки и добавляет их в базу. Возвращает массив треков.</p>
<h3>async getFileForTrack(track)</h3>
<p>Возвращает File-объект для переданного трека, используя сохранённый handle или file (в зависимости от способа добавления).</p>
<hr>
<h2>Класс Database</h2>
<p>Обеспечивает работу с IndexedDB: хранение треков, очереди, тегов, исключений и настроек.</p>
<ol>
    <li>constructor</li>
    <li>init</li>
    <li>addTrack</li>
    <li>getTrack</li>
    <li>getAllTracks</li>
    <li>deleteTrack</li>
    <li>getQueue</li>
    <li>setQueue</li>
    <li>getTags</li>
    <li>setTags</li>
    <li>getExclusion</li>
    <li>setExclusion</li>
    <li>removeExclusion</li>
    <li>getAllExclusions</li>
    <li>getSetting</li>
    <li>setSetting</li>
    <li>exportData</li>
    <li>importData</li>
</ol>
<hr>
<h3>constructor()</h3>
<p>Задаёт имя базы данных, версию и названия хранилищ (tracks, queue, exclusions, settings, tags).</p>
<h3>async init()</h3>
<p>Открывает соединение с IndexedDB, создаёт хранилища при необходимости (onupgradeneeded). Возвращает Promise.</p>
<h3>async addTrack(track)</h3>
<p>Сохраняет или обновляет трек в хранилище tracks.</p>
<h3>async getTrack(id)</h3>
<p>Возвращает трек по его идентификатору.</p>
<h3>async getAllTracks()</h3>
<p>Возвращает массив всех треков.</p>
<h3>async deleteTrack(id)</h3>
<p>Удаляет трек из хранилища tracks.</p>
<h3>async getQueue()</h3>
<p>Возвращает массив идентификаторов треков в очереди (по ключу 'queue').</p>
<h3>async setQueue(queue)</h3>
<p>Сохраняет массив очереди в хранилище queue.</p>
<h3>async getTags(trackId)</h3>
<p>Возвращает массив тегов для указанного трека.</p>
<h3>async setTags(trackId, tags)</h3>
<p>Сохраняет массив тегов для трека.</p>
<h3>async getExclusion(trackId)</h3>
<p>Возвращает объект исключения для трека (с полем until).</p>
<h3>async setExclusion(trackId, exclusion)</h3>
<p>Сохраняет исключение для трека.</p>
<h3>async removeExclusion(trackId)</h3>
<p>Удаляет исключение для трека.</p>
<h3>async getAllExclusions()</h3>
<p>Возвращает массив всех исключений (с идентификаторами треков).</p>
<h3>async getSetting(key)</h3>
<p>Возвращает значение настройки по ключу.</p>
<h3>async setSetting(key, value)</h3>
<p>Сохраняет настройку по ключу.</p>
<h3>async exportData()</h3>
<p>Экспортирует все данные из всех хранилищ в объект.</p>
<h3>async importData(data)</h3>
<p>Импортирует данные из объекта, очищая перед этим соответствующие хранилища.</p>
<hr>
<h2>Класс ThemeManager</h2>
<p>Управляет темами оформления: применяет предустановленные темы, пользовательский цвет, сохраняет и загружает настройки из базы.</p>
<ol>
    <li>constructor</li>
    <li>applyPreset</li>
    <li>applyCustomColor</li>
    <li>saveToDB</li>
    <li>loadFromDB</li>
</ol>
<hr>
<h3>constructor()</h3>
<p>Сохраняет ссылку на корневой элемент документа (documentElement) и определяет объект с предустановленными темами (light, dark, contrast).</p>
<h3>applyPreset(name)</h3>
<p>Применяет предустановленную тему по имени: устанавливает CSS-переменные из соответствующего объекта. Сохраняет имя текущей темы.</p>
<h3>applyCustomColor(color)</h3>
<p>Устанавливает значение CSS-переменной --primary-color в переданный цвет (используется для пользовательской темы).</p>
<h3>async saveToDB(db)</h3>
<p>Сохраняет текущую тему и пользовательский цвет в базу данных (в хранилище settings).</p>
<h3>async loadFromDB(db)</h3>
<p>Загружает сохранённые тему и цвет из базы и применяет их. Также обновляет соответствующие элементы интерфейса (select и color input).</p>
<hr>
<h2>Объект utils</h2>
<p>Содержит вспомогательные функции общего назначения.</p>
<ol>
    <li>generateId</li>
    <li>parseTags</li>
    <li>formatTime</li>
    <li>debounce</li>
</ol>
<hr>
<h3>generateId()</h3>
<p>Генерирует уникальный идентификатор на основе текущего времени и случайной строки.</p>
<h3>parseTags(tagString)</h3>
<p>Разбирает строку с тегами, разделёнными запятыми, возвращает массив очищенных тегов (без пробелов, пустые исключаются).</p>
<h3>formatTime(seconds)</h3>
<p>Форматирует количество секунд в строку вида "мм:сс". Если seconds некорректно, возвращает "0:00".</p>
<h3>debounce(func, wait)</h3>
<p>Возвращает функцию, которая вызывает func не чаще одного раза в wait миллисекунд (полезно для обработчиков ввода).</p>
<hr>
<h2>Short description</h2>
<p>The project is a web application for playing music that allows the user to select a folder with audio files, manage the playback queue, assign tags to tracks and filter by them, exclude tracks from random selection, and customize the appearance of the interface. All data (tracks, tags, exclusions, settings) is stored in the browser's IndexedDB, ensuring persistence between sessions.</p>
<p>The application uses modern browser APIs: the File System Access API for direct folder access (with a fallback via regular file selection) and the Web Audio API for playback. The interface is responsive and supports theme switching (light, dark, high contrast, custom).</p>
<p>Main features:</p>
<ul>
    <li>Select a music folder and recursively scan all audio files.</li>
    <li>Display a library of tracks with the ability to add tags and exclude tracks.</li>
    <li>Filter the library by one or more tags.</li>
    <li>Playback queue: add tracks, reorder, remove, shuffle.</li>
    <li>Randomly add a track from the library, respecting exclusions.</li>
    <li>Playback controls (pause, next/previous, progress slider, volume).</li>
    <li>Export and import all data (tracks, tags, queue, settings) to/from a JSON file.</li>
</ul>