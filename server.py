"""
Локальный сервер для Music Player.

Запуск:
    python server.py
или:
    uvicorn server:app --host 127.0.0.1 --port 8000

Что делает:
    - Создаёт файл music.db (SQLite) со структурой, аналогичной IndexedDB.
    - Раздаёт статику фронтенда (index.html, styles.css, js/).
    - Логирует все HTTP-запросы в консоль.
    - Принимает UI-события на /api/log.
    - Предоставляет CRUD для треков и настроек.

Структура БД (аналог IndexedDB store'ов):
    tracks(id PK, name, path, duration, source, archive_id, stream_url, created_at)
    queue(key PK, value)             -- JSON
    settings(key PK, value)          -- JSON
    tags(track_id PK, value)         -- JSON (массив тегов)
    tag_volumes(tag PK, volume)
    playlists(id PK, name, tracks)   -- tracks = JSON (массив id)
    volume_intervals(track_id PK, intervals)  -- JSON
"""

import json
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ====================== КОНФИГУРАЦИЯ ======================
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "music.db"
PORT = 8000
HOST = "127.0.0.1"

# ====================== ПОДКЛЮЧЕНИЕ К БД ======================
def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Создаёт таблицы, если их нет."""
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


# ====================== ПРИЛОЖЕНИЕ ======================
app = FastAPI(title="Music Player Local Server", version="0.1.0")

# CORS — разрешаем всё, чтобы фронт, открытый как file://, тоже мог стучаться.
# Для локальной разработки это безопасно.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ====================== MIDDLEWARE ДЛЯ ЛОГОВ ======================
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start) * 1000
    print(f"[HTTP] {request.method} {request.url.path} -> {response.status_code} ({duration_ms:.1f} ms)")
    return response


# ====================== СТАРТ / СТОП ======================
@app.on_event("startup")
def on_startup() -> None:
    init_db()
    print(f"[START] Сервер запущен на http://{HOST}:{PORT}")
    print(f"[START] Открой в браузере: http://{HOST}:{PORT}/")
    print(f"[START] Файл БД: {DB_PATH}")


# ====================== API: HEALTH ======================
@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "db": str(DB_PATH)}


# ====================== API: LOG ======================
@app.post("/api/log")
def log_event(data: LogIn) -> dict:
    print(f"[UI] event={data.event} payload={json.dumps(data.payload or {}, ensure_ascii=False)}")
    return {"ok": True}


# ====================== API: TRACKS ======================
@app.get("/api/tracks")
def list_tracks() -> list:
    conn = get_db()
    rows = conn.execute("SELECT * FROM tracks ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/tracks")
def create_track(track: TrackIn) -> dict:
    tid = track.id or f"{int(time.time() * 1000)}-{abs(hash(track.name)) % 10**9}"
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
    print(f"[DB] Добавлен трек: {tid} — {track.name}")
    return {"id": tid, "name": track.name}


@app.delete("/api/tracks/{track_id}")
def delete_track(track_id: str) -> dict:
    conn = get_db()
    cur = conn.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
    conn.commit()
    affected = cur.rowcount
    conn.close()
    if affected == 0:
        raise HTTPException(status_code=404, detail="Track not found")
    print(f"[DB] Удалён трек: {track_id}")
    return {"ok": True}


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
    print(f"[DB] Настройка сохранена: {data.key}")
    return {"ok": True}


# ====================== СТАТИКА (ФРОНТЕНД) ======================
# Монтируем /js и корневые файлы отдельно, чтобы index.html отдавался по «/».
@app.get("/")
def index() -> FileResponse:
    return FileResponse(BASE_DIR / "index.html")


# Раздаём js/ как статику
if (BASE_DIR / "js").exists():
    app.mount("/js", StaticFiles(directory=BASE_DIR / "js"), name="js")

# Раздаём styles.css
@app.get("/styles.css")
def styles() -> FileResponse:
    return FileResponse(BASE_DIR / "styles.css")


# Раздаём прочие статические файлы из корня (favicon, картинки и т.п.)
@app.get("/{filename:path}")
def static_files(filename: str) -> FileResponse:
    # Не перехватываем /api/* и /js/* — они обрабатываются выше
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