"""
Локальный сервер для Music Player.

Запуск:
    python server.py
или:
    uvicorn server:app --host 127.0.0.1 --port 8000

Возможности:
    - SQLite-хранилище (music.db), аналогичное IndexedDB фронта.
    - Раздача статики фронтенда.
    - CRUD: tracks, tags, playlists, volume_intervals, queue, settings.
    - Стриминг аудио с поддержкой Range-запросов.
    - Загрузка mp3 через multipart/form-data.
    - Сканирование папки music/ при старте.
    - Полный экспорт/импорт (backup) для синхронизации с IndexedDB.
    - Логирование в текстовый файл (server.log) с ротацией.
"""

import json
import shutil
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ====================== КОНФИГУРАЦИЯ ======================
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "music.db"
MUSIC_DIR = BASE_DIR / "music"
LOG_PATH = BASE_DIR / "server.log"
LOG_MAX_BYTES = 5 * 1024 * 1024   # 5 МБ
LOG_KEEP_LINES = 1000             # сколько последних строк оставить после ротации
PORT = 8000
HOST = "127.0.0.1"

MUSIC_DIR.mkdir(exist_ok=True)

# Глобальный флаг логирования (управляется с фронта через /api/log-config)
_log_enabled = False


# ====================== ПОДКЛЮЧЕНИЕ К БД ======================
def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_db()
    cur = conn.cursor()
    cur.executescript("""
        CREATE TABLE IF NOT EXISTS tracks (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT,
            duration REAL DEFAULT 0,
            source TEXT DEFAULT 'local',
            archive_id TEXT,
            stream_url TEXT,
            created_at REAL
        );
        CREATE TABLE IF NOT EXISTS queue (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE TABLE IF NOT EXISTS tags (
            track_id TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE TABLE IF NOT EXISTS tag_volumes (
            tag TEXT PRIMARY KEY,
            volume REAL DEFAULT 1.0
        );
        CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            tracks TEXT
        );
        CREATE TABLE IF NOT EXISTS volume_intervals (
            track_id TEXT PRIMARY KEY,
            intervals TEXT
        );
    """)
    conn.commit()
    conn.close()
    print(f"[DB] Инициализирована база: {DB_PATH}")


# ====================== ЛОГИРОВАНИЕ ======================
def _rotate_log_if_needed() -> None:
    if not LOG_PATH.exists():
        return
    if LOG_PATH.stat().st_size < LOG_MAX_BYTES:
        return
    try:
        lines = LOG_PATH.read_text(encoding="utf-8", errors="ignore").splitlines()
        tail = lines[-LOG_KEEP_LINES:]
        LOG_PATH.write_text("\n".join(tail) + "\n", encoding="utf-8")
        print(f"[LOG] Ротация: оставлено {len(tail)} строк")
    except Exception as e:
        print(f"[LOG] Ошибка ротации: {e}")


def write_log(event: str, payload: dict | None = None) -> None:
    if not _log_enabled:
        return
    try:
        _rotate_log_if_needed()
        ts = time.strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{ts}] {event} {json.dumps(payload or {}, ensure_ascii=False)}"
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception as e:
        print(f"[LOG] Ошибка записи: {e}")


# ====================== PYDANTIC-МОДЕЛИ ======================
class TrackIn(BaseModel):
    id: Optional[str] = None
    name: str
    path: Optional[str] = None
    duration: float = 0
    source: Optional[str] = "local"
    archive_id: Optional[str] = None
    stream_url: Optional[str] = None


class SettingIn(BaseModel):
    key: str
    value: Any


class LogIn(BaseModel):
    event: str
    payload: Optional[dict] = None
    ts: Optional[float] = None


class LogConfigIn(BaseModel):
    enabled: bool


class TagsIn(BaseModel):
    tags: list[str]


class PlaylistIn(BaseModel):
    id: Optional[str] = None
    name: str
    tracks: list[str] = []


class QueueIn(BaseModel):
    value: list


class VolumeIntervalsIn(BaseModel):
    intervals: list


class BackupIn(BaseModel):
    tracks: Optional[list] = None
    queue: Optional[list] = None
    settings: Optional[list] = None
    tags: Optional[list] = None
    tagVolumes: Optional[list] = None
    playlists: Optional[list] = None
    volumeIntervals: Optional[list] = None


# ====================== ПРИЛОЖЕНИЕ ======================
app = FastAPI(title="Music Player Local Server", version="0.2.5")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start) * 1000
    # Служебные запросы не пишем в файл
    if _log_enabled and not request.url.path.startswith("/api/stream"):
        write_log("http", {
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "ms": round(duration_ms, 1),
        })
    return response


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    _scan_music_dir()
    print(f"[START] Сервер запущен на http://{HOST}:{PORT}")
    print(f"[START] Открой в браузере: http://{HOST}:{PORT}/")
    print(f"[START] Музыка: {MUSIC_DIR}")


# ====================== СКАНИРОВАНИЕ ПАПКИ music/ ======================
AUDIO_EXTS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".opus"}

MIME_BY_EXT = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".opus": "audio/opus",
}


def _scan_music_dir() -> int:
    """Проходит по music/ и добавляет в БД треки, которых там нет."""
    conn = get_db()
    added = 0
    for path in sorted(MUSIC_DIR.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in AUDIO_EXTS:
            continue
        rel = path.relative_to(MUSIC_DIR).as_posix()
        row = conn.execute("SELECT id FROM tracks WHERE path = ?", (rel,)).fetchone()
        if row:
            continue
        # Восстанавливаем оригинальное имя из формата "uuid__original.ext"
        raw = path.name
        if "__" in raw:
            display_name = raw.split("__", 1)[1]
        else:
            display_name = raw
        tid = f"server-{uuid.uuid4().hex[:12]}"
        conn.execute(
            """INSERT INTO tracks (id, name, path, duration, source, stream_url, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (tid, display_name, rel, 0, "server", f"/api/stream/{tid}", time.time()),
        )
        added += 1
    conn.commit()
    conn.close()
    if added:
        print(f"[SCAN] Добавлено новых треков: {added}")
    return added


def sanitize_filename(name: str) -> str:
    bad = '<>:"/\\|?*'
    for ch in bad:
        name = name.replace(ch, "_")
    return name.strip() or "track"


# ====================== API: HEALTH ======================
@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "db": str(DB_PATH), "log_enabled": _log_enabled}


# ====================== API: LOG ======================
@app.post("/api/log")
def log_event(data: LogIn) -> dict:
    write_log(data.event, data.payload)
    return {"ok": True}


@app.post("/api/log-config")
def log_config(data: LogConfigIn) -> dict:
    global _log_enabled
    _log_enabled = data.enabled
    print(f"[LOG] Логирование {'включено' if _log_enabled else 'выключено'}")
    if _log_enabled:
        write_log("log_config", {"enabled": True})
    return {"ok": True, "enabled": _log_enabled}


# ====================== API: TRACKS ======================
@app.get("/api/tracks")
def list_tracks() -> list:
    conn = get_db()
    rows = conn.execute("SELECT * FROM tracks ORDER BY created_at DESC").fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        # stream_url отдаём ТОЛЬКО для треков, которые физически лежат в music/
        if d.get("source") == "server":
            d["stream_url"] = f"/api/stream/{d['id']}"
        else:
            d["stream_url"] = None
        result.append(d)
    return result


@app.post("/api/tracks")
def create_track(track: TrackIn) -> dict:
    tid = track.id or f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}"
    conn = get_db()
    conn.execute(
        """INSERT OR REPLACE INTO tracks
           (id, name, path, duration, source, archive_id, stream_url, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (tid, track.name, track.path, track.duration, track.source,
         track.archive_id, track.stream_url, time.time()),
    )
    conn.commit()
    conn.close()
    write_log("track_create", {"id": tid, "name": track.name})
    return {"id": tid, "name": track.name}


@app.delete("/api/tracks/{track_id}")
def delete_track(track_id: str) -> dict:
    conn = get_db()
    row = conn.execute("SELECT path, source FROM tracks WHERE id = ?", (track_id,)).fetchone()
    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")
    # Если это локальный файл сервера — удаляем и файл
    if row["source"] == "server" and row["path"]:
        file_path = MUSIC_DIR / row["path"]
        try:
            if file_path.exists():
                file_path.unlink()
                print(f"[DB] Удалён файл: {file_path}")
        except Exception as e:
            print(f"[DB] Не удалось удалить файл {file_path}: {e}")
    conn.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
    conn.execute("DELETE FROM tags WHERE track_id = ?", (track_id,))
    conn.execute("DELETE FROM volume_intervals WHERE track_id = ?", (track_id,))
    conn.commit()
    conn.close()
    write_log("track_delete", {"id": track_id})
    return {"ok": True}


# ====================== API: STREAM (с Range) ======================
@app.get("/api/stream/{track_id}")
def stream_track(track_id: str, request: Request):
    conn = get_db()
    row = conn.execute("SELECT path, source FROM tracks WHERE id = ?", (track_id,)).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Track not found")
    if row["source"] != "server" or not row["path"]:
        raise HTTPException(status_code=400, detail="Track is not streamable from server")

    file_path = MUSIC_DIR / row["path"]
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    media_type = MIME_BY_EXT.get(file_path.suffix.lower(), "application/octet-stream")
    file_size = file_path.stat().st_size
    range_header = request.headers.get("range")

    if range_header:
        try:
            units, rng = range_header.split("=")
            start_s, end_s = rng.split("-")
            start = int(start_s) if start_s else 0
            end = int(end_s) if end_s else file_size - 1
        except Exception:
            raise HTTPException(status_code=416, detail="Invalid Range header")
        if start >= file_size:
            raise HTTPException(status_code=416, detail="Range out of bounds")
        end = min(end, file_size - 1)
        length = end - start + 1

        def iter_file():
            with open(file_path, "rb") as f:
                f.seek(start)
                remaining = length
                chunk = 64 * 1024
                while remaining > 0:
                    data = f.read(min(chunk, remaining))
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(length),
        }
        return StreamingResponse(iter_file(), status_code=206, headers=headers,
                                 media_type=media_type)

    return FileResponse(file_path, media_type=media_type,
                        headers={"Accept-Ranges": "bytes"})


# ====================== API: UPLOAD ======================
@app.post("/api/upload")
async def upload_tracks(files: list[UploadFile] = File(...)) -> dict:
    added = []
    conn = get_db()
    for uf in files:
        if not uf.filename:
            continue
        suffix = Path(uf.filename).suffix.lower()
        if suffix not in AUDIO_EXTS:
            continue
        original = sanitize_filename(uf.filename)
        # Формат: <uuid>__<original.ext>
        safe_name = f"{uuid.uuid4().hex[:12]}__{original}"
        dest = MUSIC_DIR / safe_name
        try:
            with dest.open("wb") as f:
                shutil.copyfileobj(uf.file, f)
        except Exception as e:
            print(f"[UPLOAD] Ошибка сохранения {uf.filename}: {e}")
            continue
        tid = f"server-{uuid.uuid4().hex[:12]}"
        conn.execute(
            """INSERT INTO tracks (id, name, path, duration, source, stream_url, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (tid, uf.filename, safe_name, 0, "server", f"/api/stream/{tid}", time.time()),
        )
        added.append({"id": tid, "name": uf.filename})
        print(f"[UPLOAD] {uf.filename} -> {safe_name} ({tid})")
    conn.commit()
    conn.close()
    write_log("upload", {"count": len(added), "files": [a["name"] for a in added]})
    return {"ok": True, "added": added}


@app.post("/api/scan")
def scan_music() -> dict:
    added = _scan_music_dir()
    write_log("scan", {"added": added})
    return {"ok": True, "added": added}


# ====================== API: SETTINGS ======================
@app.get("/api/settings/{key}")
def get_setting(key: str) -> dict:
    conn = get_db()
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Setting not found")
    try:
        value = json.loads(row["value"])
    except (TypeError, json.JSONDecodeError):
        value = row["value"]
    return {"key": key, "value": value}


@app.post("/api/settings")
def set_setting(data: SettingIn) -> dict:
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (data.key, json.dumps(data.value, ensure_ascii=False)),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/api/settings")
def get_all_settings() -> list:
    conn = get_db()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    result = []
    for r in rows:
        try:
            v = json.loads(r["value"])
        except Exception:
            v = r["value"]
        result.append({"key": r["key"], "value": v})
    return result


# ====================== API: TAGS ======================
@app.get("/api/tags/{track_id}")
def get_tags(track_id: str) -> dict:
    conn = get_db()
    row = conn.execute("SELECT value FROM tags WHERE track_id = ?", (track_id,)).fetchone()
    conn.close()
    if row is None:
        return {"track_id": track_id, "tags": []}
    try:
        tags = json.loads(row["value"])
    except Exception:
        tags = []
    return {"track_id": track_id, "tags": tags}


@app.put("/api/tags/{track_id}")
def set_tags(track_id: str, data: TagsIn) -> dict:
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO tags (track_id, value) VALUES (?, ?)",
        (track_id, json.dumps(data.tags, ensure_ascii=False)),
    )
    conn.commit()
    conn.close()
    write_log("tags_set", {"track_id": track_id, "tags": data.tags})
    return {"ok": True}


@app.get("/api/tags")
def get_all_tags() -> list:
    conn = get_db()
    rows = conn.execute("SELECT track_id, value FROM tags").fetchall()
    conn.close()
    result = []
    for r in rows:
        try:
            v = json.loads(r["value"])
        except Exception:
            v = []
        result.append({"trackId": r["track_id"], "value": v})
    return result


# ====================== API: PLAYLISTS ======================
@app.get("/api/playlists")
def list_playlists() -> list:
    conn = get_db()
    rows = conn.execute("SELECT * FROM playlists").fetchall()
    conn.close()
    result = []
    for r in rows:
        try:
            tracks = json.loads(r["tracks"] or "[]")
        except Exception:
            tracks = []
        result.append({"id": r["id"], "name": r["name"], "tracks": tracks})
    return result


@app.post("/api/playlists")
def create_playlist(pl: PlaylistIn) -> dict:
    pid = pl.id or f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}"
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO playlists (id, name, tracks) VALUES (?, ?, ?)",
        (pid, pl.name, json.dumps(pl.tracks, ensure_ascii=False)),
    )
    conn.commit()
    conn.close()
    write_log("playlist_save", {"id": pid, "name": pl.name})
    return {"id": pid, "name": pl.name, "tracks": pl.tracks}


@app.delete("/api/playlists/{playlist_id}")
def delete_playlist(playlist_id: str) -> dict:
    conn = get_db()
    cur = conn.execute("DELETE FROM playlists WHERE id = ?", (playlist_id,))
    conn.commit()
    affected = cur.rowcount
    conn.close()
    if affected == 0:
        raise HTTPException(status_code=404, detail="Playlist not found")
    write_log("playlist_delete", {"id": playlist_id})
    return {"ok": True}


# ====================== API: QUEUE ======================
@app.get("/api/queue")
def get_queue() -> dict:
    conn = get_db()
    row = conn.execute("SELECT value FROM queue WHERE key = 'queue'").fetchone()
    conn.close()
    if row is None:
        return {"value": []}
    try:
        v = json.loads(row["value"])
    except Exception:
        v = []
    return {"value": v}


@app.put("/api/queue")
def set_queue(data: QueueIn) -> dict:
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO queue (key, value) VALUES ('queue', ?)",
        (json.dumps(data.value, ensure_ascii=False),),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


# ====================== API: VOLUME INTERVALS ======================
@app.get("/api/volume-intervals/{track_id}")
def get_intervals(track_id: str) -> dict:
    conn = get_db()
    row = conn.execute("SELECT intervals FROM volume_intervals WHERE track_id = ?", (track_id,)).fetchone()
    conn.close()
    if row is None:
        return {"track_id": track_id, "intervals": []}
    try:
        v = json.loads(row["intervals"])
    except Exception:
        v = []
    return {"track_id": track_id, "intervals": v}


@app.put("/api/volume-intervals/{track_id}")
def set_intervals(track_id: str, data: VolumeIntervalsIn) -> dict:
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO volume_intervals (track_id, intervals) VALUES (?, ?)",
        (track_id, json.dumps(data.intervals, ensure_ascii=False)),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/api/volume-intervals")
def get_all_intervals() -> list:
    conn = get_db()
    rows = conn.execute("SELECT track_id, intervals FROM volume_intervals").fetchall()
    conn.close()
    result = []
    for r in rows:
        try:
            v = json.loads(r["intervals"])
        except Exception:
            v = []
        result.append({"trackId": r["track_id"], "intervals": v})
    return result


# ====================== API: BACKUP (полный экспорт/импорт) ======================
@app.get("/api/backup/export")
def backup_export() -> dict:
    conn = get_db()

    def fetch_all(table: str) -> list:
        rows = conn.execute(f"SELECT * FROM {table}").fetchall()
        return [dict(r) for r in rows]

    def parse_json_field(records: list, field: str) -> list:
        for r in records:
            try:
                r[field] = json.loads(r[field]) if r[field] else []
            except Exception:
                r[field] = []
        return records

    tracks = fetch_all("tracks")
    queue_rows = fetch_all("queue")
    settings = fetch_all("settings")
    tags = fetch_all("tags")
    tag_volumes = fetch_all("tag_volumes")
    playlists = fetch_all("playlists")
    intervals = fetch_all("volume_intervals")
    conn.close()

    for s in settings:
        try:
            s["value"] = json.loads(s["value"])
        except Exception:
            pass

    # queue -> [{key, value: [...]}]
    for q in queue_rows:
        try:
            q["value"] = json.loads(q["value"])
        except Exception:
            q["value"] = []

    data = {
        "tracks": tracks,
        "queue": queue_rows,
        "settings": settings,
        "tags": tags,
        "tagVolumes": tag_volumes,
        "playlists": parse_json_field(playlists, "tracks"),
        "volumeIntervals": parse_json_field(intervals, "intervals"),
    }
    write_log("backup_export", {"tracks": len(tracks), "playlists": len(playlists)})
    return data


@app.post("/api/backup/import")
def backup_import(data: BackupIn) -> dict:
    conn = get_db()
    cur = conn.cursor()

    # Чистим таблицы
    for t in ["tracks", "queue", "settings", "tags", "tag_volumes", "playlists", "volume_intervals"]:
        cur.execute(f"DELETE FROM {t}")

    def ins_tracks(rows):
        for r in rows or []:
            src = r.get("source", "local")
            # На сервер принимаем ТОЛЬКО треки, которые физически лежат в music/.
            # Локальные файлы браузера и archive.org-стримы сюда не попадают.
            if src != "server":
                continue
            cur.execute(
                """INSERT OR REPLACE INTO tracks
                   (id, name, path, duration, source, archive_id, stream_url, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (r.get("id"), r.get("name"), r.get("path"), r.get("duration", 0),
                 "server", r.get("archive_id") or r.get("archiveId"),
                 r.get("stream_url") or r.get("streamUrl"), r.get("created_at") or time.time()),
            )

    def ins_queue(rows):
        for r in rows or []:
            cur.execute("INSERT OR REPLACE INTO queue (key, value) VALUES (?, ?)",
                        (r.get("key", "queue"), json.dumps(r.get("value", []), ensure_ascii=False)))

    def ins_settings(rows):
        for r in rows or []:
            cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                        (r.get("key"), json.dumps(r.get("value"), ensure_ascii=False)))

    def ins_tags(rows):
        for r in rows or []:
            cur.execute("INSERT OR REPLACE INTO tags (track_id, value) VALUES (?, ?)",
                        (r.get("trackId") or r.get("track_id"), json.dumps(r.get("value", []), ensure_ascii=False)))

    def ins_tag_volumes(rows):
        for r in rows or []:
            cur.execute("INSERT OR REPLACE INTO tag_volumes (tag, volume) VALUES (?, ?)",
                        (r.get("tag"), r.get("volume", 1.0)))

    def ins_playlists(rows):
        for r in rows or []:
            cur.execute("INSERT OR REPLACE INTO playlists (id, name, tracks) VALUES (?, ?, ?)",
                        (r.get("id"), r.get("name"), json.dumps(r.get("tracks", []), ensure_ascii=False)))

    def ins_intervals(rows):
        for r in rows or []:
            cur.execute("INSERT OR REPLACE INTO volume_intervals (track_id, intervals) VALUES (?, ?)",
                        (r.get("trackId") or r.get("track_id"), json.dumps(r.get("intervals", []), ensure_ascii=False)))

    ins_tracks(data.tracks)
    ins_queue(data.queue)
    ins_settings(data.settings)
    ins_tags(data.tags)
    ins_tag_volumes(data.tagVolumes)
    ins_playlists(data.playlists)
    ins_intervals(data.volumeIntervals)

    conn.commit()
    conn.close()
    write_log("backup_import", {"tracks": len(data.tracks or [])})
    return {"ok": True}


# ====================== СТАТИКА (ФРОНТЕНД) ======================
@app.get("/")
def index() -> FileResponse:
    return FileResponse(BASE_DIR / "index.html")


if (BASE_DIR / "js").exists():
    app.mount("/js", StaticFiles(directory=BASE_DIR / "js"), name="js")


@app.get("/styles.css")
def styles() -> FileResponse:
    return FileResponse(BASE_DIR / "styles.css")


@app.get("/{filename:path}")
def static_files(filename: str) -> FileResponse:
    if filename.startswith("api/") or filename.startswith("js/"):
        raise HTTPException(status_code=404)
    path = BASE_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(path)


# ====================== ЗАПУСК ======================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")