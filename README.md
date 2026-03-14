<h1>🎵 Music Player с тегами и очередью</h1>

<p>Веб-приложение для проигрывания музыки прямо в браузере с поддержкой тегов, гибкой настройкой громкости, очередью воспроизведения и множеством тем оформления. Все данные хранятся локально в IndexedDB, музыкальные файлы читаются через File System Access API (или стандартный выбор файлов).</p>

<p>Файлы библиотек не были написаны мною, это не моя работа, но я благодарен тем, кто их написал (:)</p>

<h2>🚀 Основные возможности</h2>
<ul>
  <li><strong>Библиотека треков</strong> – после выбора папки с музыкой все аудиофайлы отображаются в виде списка.</li>
  <li><strong>Теги</strong> – каждому треку можно присвоить произвольные теги (например, «рок», «instrumental»). Теги используются для фильтрации, исключения треков и настройки громкости.</li>
  <li><strong>Исключение треков</strong> – тег <code>🚫 excluded</code> исключает трек из случайного выбора (кнопка «Добавить случайную» в очереди).</li>
  <li><strong>Громкость по тегам</strong> – для каждого тега можно задать коэффициент громкости (от 0.0 до 2.0). Итоговая громкость трека перемножается из всех его тегов (но не более 2.0 и не менее 0.1). Также поддерживается индивидуальный тег вида <code>vol50</code> (громкость 50% от базовой).</li>
  <li><strong>Очередь воспроизведения</strong> – треки можно добавлять в очередь, менять порядок кнопками вверх/вниз или перетаскиванием (drag &amp; drop). Очередь сохраняется между сессиями.</li>
  <li><strong>Случайный трек</strong> – кнопка «Добавить случайную» добавляет в очередь случайный трек из библиотеки, не помеченный как исключённый.</li>
  <li><strong>Плеер</strong> – базовое управление: play/pause, предыдущий/следующий трек, ползунок прогресса, регулировка громкости.</li>
  <li><strong>Темы оформления</strong> – несколько готовых цветовых схем (светлая, тёмная, синяя, фиолетовая, зелёная, оранжевая, монохромная, Dracula, Nord, Solarized). Можно изменить основной цвет, а также тонко настроить отдельные цвета интерфейса (фон, текст, границы и т.д.).</li>
  <li><strong>Экспорт / импорт данных</strong> – все теги, настройки громкости, очередь и информация о треках могут быть сохранены в JSON-файл и восстановлены позже. Ссылки на файлы при экспорте не сохраняются (из соображений безопасности), поэтому после импорта потребуется заново выбрать папку с музыкой.</li>
  <li><strong>Детальная информация о треке</strong> – при клике на «Подробнее» открывается страница трека, где можно просмотреть и отредактировать теги, исключить трек, добавить в очередь или начать воспроизведение.</li>
</ul>

<h2>📖 Как использовать</h2>
<ol>
  <li>Откройте <code>index.html</code> в современном браузере (Chrome, Edge, Opera рекомендуются для полной поддержки File System Access).</li>
  <li>Нажмите <strong>«📂 Выбрать папку с музыкой»</strong> и укажите папку с аудиофайлами. Приложение просканирует её рекурсивно и добавит все поддерживаемые аудиофайлы в библиотеку.
    <br><em>Примечание:</em> Если ваш браузер не поддерживает выбор папки, будет предложено выбрать файлы по одному (через стандартное окно).
  </li>
  <li>После загрузки библиотеки вы увидите список треков. Используйте фильтр по тегам (вводите теги через запятую) и поиск по названию для быстрого поиска.</li>
  <li>Управляйте тегами:
    <ul>
      <li>Чтобы добавить тег, введите его в поле ввода рядом с треком и нажмите <strong>«➕ Добавить»</strong>.</li>
      <li>Чтобы удалить тег, нажмите крестик рядом с ним.</li>
      <li>Кнопка <strong>«🚫 Исключить»</strong> добавляет/убирает тег <code>🚫 excluded</code>.</li>
    </ul>
  </li>
  <li>Для воспроизведения можно:
    <ul>
      <li>Нажать <strong>«▶ В очередь»</strong> (трек добавится в конец очереди; если очередь была пуста, начнётся воспроизведение).</li>
      <li>Перетащить трек из библиотеки в область очереди (справа, вкладка «Очередь»).</li>
      <li>На странице деталей трека нажать <strong>«▶ Воспроизвести сейчас»</strong>.</li>
    </ul>
  </li>
  <li>Во вкладке <strong>«Очередь»</strong> отображается текущая очередь. Можно:
    <ul>
      <li>Менять порядок кнопками ↑/↓ или перетаскиванием элементов.</li>
      <li>Удалять треки из очереди (кнопка ✖).</li>
      <li>Очистить всю очередь, перемешать её или добавить случайный трек.</li>
    </ul>
  </li>
  <li>Во вкладке <strong>«Настройки»</strong> можно:
    <ul>
      <li>Выбрать тему оформления и основной цвет.</li>
      <li>Тонко настроить цвета интерфейса (изменения сохраняются автоматически).</li>
      <li>Управлять громкостью по тегам: добавлять правила вида «тег → коэффициент громкости».</li>
      <li>Просмотреть список исключённых треков и снимать исключение.</li>
      <li>Экспортировать или импортировать данные.</li>
    </ul>
  </li>
  <li>Навигация между страницами осуществляется с помощью кнопок в шапке (или через хэши в адресной строке).</li>
</ol>

<h2>🔧 Технические детали</h2>
<ul>
  <li><strong>Хранилище:</strong> IndexedDB (объекты: tracks, queue, settings, tags, tagVolumes).</li>
  <li><strong>Доступ к файлам:</strong> используется File System Access API (<code>showDirectoryPicker</code>) для получения доступа к папке и возможности читать файлы по мере необходимости. В качестве запасного варианта – множественный выбор файлов через <code>&lt;input type="file"&gt;</code>.</li>
  <li><strong>Drag &amp; Drop:</strong> для очереди используется библиотека <a href="https://github.com/SortableJS/Sortable">SortableJS</a>.</li>
  <li><strong>Аудиоплеер:</strong> встроенный элемент <code>&lt;audio&gt;</code>.</li>
  <li><strong>Темы:</strong> CSS-переменные, которые динамически меняются через JavaScript. Пресеты хранятся в объекте, пользовательские переопределения сохраняются в IndexedDB.</li>
  <li><strong>Громкость по тегам:</strong> при воспроизведении трека собираются все его теги, для каждого из них извлекается коэффициент громкости (из хранилища tagVolumes или из самого тега вида volNN), затем они перемножаются. Результат ограничивается диапазоном [0.1, 2.0] и умножается на базовую громкость (ползунок громкости плеера). Если трек имеет тег <code>volNN</code>, он имеет приоритет над правилами для тегов.</li>
</ul>

<h2>📌 Примечания</h2>
<ul>
  <li>Приложение работает полностью в браузере, никакие данные не отправляются на сервер.</li>
  <li>Для корректной работы File System Access API требуется, чтобы сайт открывался через <code>https://</code> или <code>localhost</code> (из-за политик безопасности браузера). При использовании простого <code>file://</code> выбор папки будет недоступен, но можно выбрать файлы по одному.</li>
  <li>Поддерживаемые аудиоформаты зависят от браузера. Обычно это <code>.mp3</code>, <code>.ogg</code>, <code>.wav</code>, <code>.flac</code> (в некоторых браузерах).</li>
  <li>При экспорте данных ссылки на файловые дескрипторы (handles) удаляются, поэтому после импорта необходимо повторно выбрать папку с музыкой. Сами файлы, конечно, не копируются.</li>
</ul>

<hr>

<h1>🎵 Music Player with Tags and Queue</h1>

<p>A web application for playing music directly in the browser with tag support, flexible volume control, a playback queue, and multiple themes. All data is stored locally in IndexedDB; music files are read via the File System Access API (or standard file picker).</p>

<p>I didnt create the library files, but I'm very grateful for their existence (:)</p>

<h2>🚀 Key Features</h2>
<ul>
  <li><strong>Track Library</strong> – after selecting a music folder, all audio files are displayed in a list.</li>
  <li><strong>Tags</strong> – each track can have arbitrary tags (e.g., "rock", "instrumental"). Tags are used for filtering, excluding tracks, and volume adjustment.</li>
  <li><strong>Excluding Tracks</strong> – the tag <code>🚫 excluded</code> removes a track from random selection (used by the "Add random" button in the queue).</li>
  <li><strong>Per‑Tag Volume</strong> – you can set a volume factor (0.0 to 2.0) for any tag. The final volume of a track is the product of the factors from all its tags (clamped to 0.1–2.0). An individual tag like <code>vol50</code> (50% of base volume) is also supported and takes precedence.</li>
  <li><strong>Playback Queue</strong> – tracks can be added to a queue; order can be changed with up/down buttons or by drag &amp; drop. The queue is persisted between sessions.</li>
  <li><strong>Random Track</strong> – the "Add random" button adds a random, non‑excluded track from the library to the queue.</li>
  <li><strong>Player</strong> – basic controls: play/pause, previous/next, progress slider, volume slider.</li>
  <li><strong>Themes</strong> – several built‑in colour schemes (light, dark, blue, purple, green, orange, monochrome, Dracula, Nord, Solarized). You can also change the primary colour and fine‑tune individual interface colours (background, text, borders, etc.).</li>
  <li><strong>Export / Import</strong> – all tags, volume settings, queue, and track information can be saved to a JSON file and restored later. File handles are stripped on export (for security), so after import you must reselect the music folder.</li>
  <li><strong>Track Details Page</strong> – click "Details" on a track to view and edit its tags, exclude it, add it to the queue, or play it immediately.</li>
</ul>

<h2>📖 How to Use</h2>
<ol>
  <li>Open <code>index.html</code> in a modern browser (Chrome, Edge, Opera recommended for full File System Access support).</li>
  <li>Click <strong>"📂 Select music folder"</strong> and choose a folder containing audio files. The app will scan it recursively and add all supported audio files to the library.
    <br><em>Note:</em> If your browser does not support folder selection, you will be prompted to pick files individually.
  </li>
  <li>Once the library is loaded, you'll see a list of tracks. Use the tag filter (enter tags separated by commas) and the name search to quickly find tracks.</li>
  <li>Manage tags:
    <ul>
      <li>To add a tag, type it into the input field next to the track and click <strong>"➕ Add"</strong>.</li>
      <li>To remove a tag, click the cross icon beside it.</li>
      <li>The <strong>"🚫 Exclude"</strong> button toggles the <code>🚫 excluded</code> tag.</li>
    </ul>
  </li>
  <li>Playback options:
    <ul>
      <li>Click <strong>"▶ Add to queue"</strong> (the track is appended to the queue; if the queue was empty, playback starts).</li>
      <li>Drag a track from the library and drop it onto the queue area (the "Queue" tab).</li>
      <li>On the track details page, click <strong>"▶ Play now"</strong>.</li>
    </ul>
  </li>
  <li>The <strong>"Queue"</strong> tab shows the current queue. You can:
    <ul>
      <li>Change order with ↑/↓ buttons or by dragging items.</li>
      <li>Remove tracks from the queue (✖ button).</li>
      <li>Clear the entire queue, shuffle it, or add a random track.</li>
    </ul>
  </li>
  <li>The <strong>"Settings"</strong> tab lets you:
    <ul>
      <li>Choose a theme and the primary colour.</li>
      <li>Fine‑tune interface colours (changes are saved automatically).</li>
      <li>Manage per‑tag volume: add rules like "tag → volume factor".</li>
      <li>View the list of excluded tracks and remove exclusions.</li>
      <li>Export or import data.</li>
    </ul>
  </li>
  <li>Navigation between pages is done via the header buttons (or by using URL hashes).</li>
</ol>

<h2>🔧 Technical Details</h2>
<ul>
  <li><strong>Storage:</strong> IndexedDB (object stores: tracks, queue, settings, tags, tagVolumes).</li>
  <li><strong>File access:</strong> The File System Access API (<code>showDirectoryPicker</code>) is used to obtain a folder handle and read files on demand. A fallback to multiple file selection (<code>&lt;input type="file"&gt;</code>) is provided for unsupported browsers.</li>
  <li><strong>Drag &amp; Drop:</strong> The queue uses <a href="https://github.com/SortableJS/Sortable">SortableJS</a>.</li>
  <li><strong>Audio player:</strong> Native <code>&lt;audio&gt;</code> element.</li>
  <li><strong>Themes:</strong> CSS custom properties (variables) that are dynamically changed via JavaScript. Presets are stored in an object; user overrides are saved in IndexedDB.</li>
  <li><strong>Per‑tag volume:</strong> When a track is played, all its tags are collected. For each tag, a volume factor is retrieved (either from the tagVolumes store or from a tag like <code>volNN</code>), then multiplied together. The result is clamped to [0.1, 2.0] and multiplied by the base volume (the volume slider). If the track has a <code>volNN</code> tag, it overrides any per‑tag rules.</li>
</ul>

<h2>📌 Notes</h2>
<ul>
  <li>The application runs entirely in the browser; no data is sent to any server.</li>
  <li>For the File System Access API to work, the page must be served over <code>https://</code> or from <code>localhost</code> (due to browser security policies). When opened via <code>file://</code>, folder selection is unavailable, but you can still pick files individually.</li>
  <li>Supported audio formats depend on the browser. Typically these include <code>.mp3</code>, <code>.ogg</code>, <code>.wav</code>, <code>.flac</code> (in some browsers).</li>
  <li>When exporting data, file handles are removed, so after importing you must reselect the music folder. The actual files are not copied.</li>
</ul>