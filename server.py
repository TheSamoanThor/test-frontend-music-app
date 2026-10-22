"""
Music Player Local Server.

Запуск локально:
    python server.py
    uvicorn server:app --host 127.0.0.1 --port 8000

Запуск для деплоя: см. README-server.md (раздел «Деплой»).

Переменные окружения (все опциональны, дефолты — локальный режим без пароля):
    HOST=127.0.0.1
    PORT=8000
    BASE_DIR=.
    DB_PATH=music.db
    MUSIC_DIR=music
    LOG_PATH=server.log
    LOG_ENABLED=false
    LOG_MAX_BYTES=5242880
    LOG_KEEP_LINES=1000
    CORS_ORIGINS=*
    TRUSTED_HOSTS=*
    MAX_UPLOAD_MB=200
    ENABLE_GZIP=true
    ENABLE_DOCS=true

    # --- режим Bearer-токена (роль listener: чтение/стриминг) ---
    SERVER_API_TOKEN=

    # --- режим cookie-сессии с ролями (приоритетнее токена) ---
    AUTH_ADMIN_USER=admin
    AUTH_ADMIN_PASSWORD_HASH=        # bcrypt; см. make_passwords.py
    AUTH_LISTENER_USER=listener
    AUTH_LISTENER_PASSWORD_HASH=     # bcrypt
    AUTH_SESSION_SECRET=             # секрет для подписи cookie
    AUTH_SESSION_TTL_HOURS=168
    AUTH_COOKIE_NAME=mp_session
    AUTH_COOKIE_SECURE=true          # false только для http://localhost
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Optional

# .env должен читаться до объявления конфигурации.
# Импорт dotenv мягкий: если пакета нет, работаем без .env.
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env", override=False)
except ImportError:
    pass

try:
    import bcrypt
    _BCRYPT_AVAILABLE = True
except ImportError:
    bcrypt = None
    _BCRYPT_AVAILABLE = False

try:
    from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
    _ITS_DANGEROUS_AVAILABLE = True
except ImportError:
    URLSafeTimedSerializer = None
    BadSignature = SignatureExpired = None
    _ITS_DANGEROUS_AVAILABLE = False

from fastapi import (
    Cookie,
    Depends,
    FastAPI,
    File,
    Header,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


# ====================== КОНФИГУРАЦИЯ ======================
def _env_bool(name: str, default: bool = False) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on", "y")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


BASE_DIR = Path(os.getenv("BASE_DIR", Path(__file__).resolve().parent)).resolve()

DB_PATH = BASE_DIR / os.getenv("DB_PATH", "music.db")
MUSIC_DIR = BASE_DIR / os.getenv("MUSIC_DIR", "music")
LOG_PATH = BASE_DIR / os.getenv("LOG_PATH", "server.log")

LOG_MAX_BYTES = _env_int("LOG_MAX_BYTES", 5 * 1024 * 1024)
LOG_KEEP_LINES = _env_int("LOG_KEEP_LINES", 1000)

PORT = _env_int("PORT", 8000)
HOST = os.getenv("HOST", "127.0.0.1")

CORS_ORIGINS = [x.strip() for x in os.getenv("CORS_ORIGINS", "*").split(",") if x.strip()] or ["*"]
TRUSTED_HOSTS = [x.strip() for x in os.getenv("TRUSTED_HOSTS", "*").split(",") if x.strip()] or ["*"]
MAX_UPLOAD_BYTES = _env_int("MAX_UPLOAD_MB", 200) * 1024 * 1024
ENABLE_GZIP = _env_bool("ENABLE_GZIP", True)
ENABLE_DOCS = _env_bool("ENABLE_DOCS", True)

# --- auth: два режима, cookie (приоритет) и Bearer-токен (fallback) ---
SERVER_API_TOKEN = os.getenv("SERVER_API_TOKEN", "").strip()

AUTH_ADMIN_USER = os.getenv("AUTH_ADMIN_USER", "").strip()
AUTH_ADMIN_PASSWORD_HASH = os.getenv("AUTH_ADMIN_PASSWORD_HASH", "").strip()
AUTH_LISTENER_USER = os.getenv("AUTH_LISTENER_USER", "").strip()
AUTH_LISTENER_PASSWORD_HASH = os.getenv("AUTH_LISTENER_PASSWORD_HASH", "").strip()
AUTH_SESSION_SECRET = os.getenv("AUTH_SESSION_SECRET", "").strip()
AUTH_SESSION_TTL_HOURS = _env_int("AUTH_SESSION_TTL_HOURS", 168)
AUTH_COOKIE_NAME = os.getenv("AUTH_COOKIE_NAME", "mp_session").strip() or "mp_session"
_default_cookie_secure = HOST not in ("127.0.0.1", "localhost", "::1", "0.0.0.0")
AUTH_COOKIE_SECURE = _env_bool("AUTH_COOKIE_SECURE", _default_cookie_secure)

AUTH_COOKIE_ENABLED = bool(
    _BCRYPT_AVAILABLE
    and _ITS_DANGEROUS_AVAILABLE
    and AUTH_SESSION_SECRET
    and (
        (AUTH_ADMIN_USER and AUTH_ADMIN_PASSWORD_HASH)
        or (AUTH_LISTENER_USER and AUTH_LISTENER_PASSWORD_HASH)
    )
)

if AUTH_ADMIN_PASSWORD_HASH and not _BCRYPT_AVAILABLE:
    print("[AUTH] ВНИМАНИЕ: AUTH_ADMIN_PASSWORD_HASH задан, но bcrypt не установлен.")
if (AUTH_ADMIN_PASSWORD_HASH or AUTH_LISTENER_PASSWORD_HASH) and not AUTH_SESSION_SECRET:
    print("[AUTH] ВНИМАНИЕ: хэши заданы, но AUTH_SESSION_SECRET пуст — cookie-auth выключен.")
if AUTH_SESSION_SECRET and not _ITS_DANGEROUS_AVAILABLE:
    print("[AUTH] ВНИМАНИЕ: itsdangerous не установлен — cookie-auth выключен.")

_serializer = (
    URLSafeTimedSerializer(AUTH_SESSION_SECRET, salt="mp-session")
    if AUTH_COOKIE_ENABLED
    else None
)

MUSIC_DIR.mkdir(exist_ok=True)

_log_enabled = _env_bool("LOG_ENABLED", False)


# ====================== БД ======================
def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
    except sqlite3.OperationalError:
        pass
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
        CREATE INDEX IF NOT EXISTS idx_tracks_source ON tracks(source);
        CREATE INDEX IF NOT EXISTS idx_tracks_created ON tracks(created_at DESC);

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


# ====================== ЛОГИ ======================
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


# ====================== PYDANTIC ======================
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


class LoginIn(BaseModel):
    username: str
    password: str


# ====================== AUTH ======================
def _verify_credentials(username: str, password: str) -> Optional[str]:
    """Возвращает роль ('admin'/'listener') или None."""
    if not bcrypt:
        return None
    if AUTH_ADMIN_USER and AUTH_ADMIN_PASSWORD_HASH and username == AUTH_ADMIN_USER:
        try:
            if bcrypt.checkpw(password.encode("utf-8"), AUTH_ADMIN_PASSWORD_HASH.encode("utf-8")):
                return "admin"
        except (ValueError, TypeError):
            pass
    if AUTH_LISTENER_USER and AUTH_LISTENER_PASSWORD_HASH and username == AUTH_LISTENER_USER:
        try:
            if bcrypt.checkpw(password.encode("utf-8"), AUTH_LISTENER_PASSWORD_HASH.encode("utf-8")):
                return "listener"
        except (ValueError, TypeError):
            pass
    return None


def _issue_session(username: str, role: str) -> Optional[str]:
    if not _serializer:
        return None
    return _serializer.dumps({"u": username, "r": role})


def _read_session(token: Optional[str]) -> Optional[dict]:
    if not token or not _serializer:
        return None
    try:
        data = _serializer.loads(token, max_age=AUTH_SESSION_TTL_HOURS * 3600)
    except (SignatureExpired, BadSignature):
        return None
    if not isinstance(data, dict) or "r" not in data:
        return None
    return data


def _check_bearer(authorization: Optional[str]) -> bool:
    if not SERVER_API_TOKEN:
        return False
    if not authorization or not authorization.lower().startswith("bearer "):
        return False
    return authorization.split(" ", 1)[1].strip() == SERVER_API_TOKEN


# Отдельный токен только для /api/stream (query-параметр ?token=).
# Если пусто — используется SERVER_API_TOKEN (менее безопасно: один токен
# на всё). Рекомендуется задать отдельный STREAM_TOKEN, чтобы утечка
# query-параметра (логи, история, Referer) не давала доступа к API.
STREAM_TOKEN = os.getenv("STREAM_TOKEN", "").strip()


def _effective_stream_token() -> str:
    """Токен, которым можно авторизовать /api/stream через ?token=."""
    return STREAM_TOKEN or SERVER_API_TOKEN


def _stream_auth_ok(request: Request) -> bool:
    """
    Аутентификация для GET /api/stream.

    Порядок:
      1) открытый режим (ни cookie-auth, ни токенов) — пускаем;
      2) cookie-сессия (admin или listener) — пускаем;
      3) Authorization: Bearer <SERVER_API_TOKEN> — пускаем;
      4) ?token=<STREAM_TOKEN или SERVER_API_TOKEN> — пускаем.

    <audio> не умеет Authorization, поэтому для стриминга допускается
    query-токен. Он попадает в access-log — поэтому в Dockerfile
    рекомендуется --no-access-log, а STREAM_TOKEN — отдельный от
    SERVER_API_TOKEN.
    """
    if not AUTH_COOKIE_ENABLED and not SERVER_API_TOKEN and not STREAM_TOKEN:
        return True  # открытый режим

    if AUTH_COOKIE_ENABLED:
        cookie_token = request.cookies.get(AUTH_COOKIE_NAME)
        if _read_session(cookie_token) is not None:
            return True

    auth_header = request.headers.get("authorization")
    if SERVER_API_TOKEN and _check_bearer(auth_header):
        return True

    eff = _effective_stream_token()
    if eff:
        q_token = request.query_params.get("token")
        if q_token and q_token == eff:
            return True

    return False


def current_session(
    mp_session: Optional[str] = Cookie(default=None, alias=AUTH_COOKIE_NAME),
    authorization: Optional[str] = Header(default=None),
) -> Optional[dict]:
    """
    Возвращает словарь сессии или None.

    Поведение:
    - ни cookie-auth, ни token-auth не настроены — открытый режим,
      возвращаем {'u': 'anonymous', 'r': 'admin'};
    - настроен только SERVER_API_TOKEN — пускаем при валидном Bearer
      с ролью 'listener' (чтение/стриминг, без изменений);
    - настроена cookie-auth — читаем подписанную cookie;
      Bearer-токен тоже принимается как fallback (роль listener).
    """
    cookie_active = AUTH_COOKIE_ENABLED
    token_active = bool(SERVER_API_TOKEN)

    if not cookie_active and not token_active:
        return {"u": "anonymous", "r": "admin"}

    # Bearer-токен как fallback: даёт права только listener.
    if token_active and _check_bearer(authorization):
        return {"u": "token", "r": "listener"}

    if cookie_active:
        return _read_session(mp_session)

    return None


def require_login(session: Optional[dict] = Depends(current_session)) -> dict:
    if session is None:
        raise HTTPException(status_code=401, detail="Login required")
    return session


def require_admin(session: dict = Depends(require_login)) -> dict:
    if session.get("r") != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return session


def _require_auth(authorization: Optional[str] = Header(default=None)) -> None:
    """
    Устаревшая проверка только по SERVER_API_TOKEN.
    Оставлена для обратной совместимости: используется в /api/log,
    который должен работать и без cookie.
    """
    if not SERVER_API_TOKEN:
        return
    if not _check_bearer(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")


# ====================== ПРИЛОЖЕНИЕ ======================
app = FastAPI(
    title="Music Player Local Server",
    version="0.3.1",
    docs_url="/docs" if ENABLE_DOCS else None,
    redoc_url="/redoc" if ENABLE_DOCS else None,
    openapi_url="/openapi.json" if ENABLE_DOCS else None,
)

# CORS: если среди origin есть '*' или 'null' — credentials выключаем.
# Браузер запрещает `Access-Control-Allow-Origin: null` вместе с
# `Access-Control-Allow-Credentials: true`, поэтому для file:// (Origin: null)
# и для '*' режим с куками невозможен в принципе.
# CORS: если среди origin есть '*' или 'null' — credentials выключаем.
_cors_has_wildcard = ("*" in CORS_ORIGINS) or ("null" in CORS_ORIGINS)

if CORS_ORIGINS != ["*"]:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        # Если в списке есть null (для file://), мы не можем ставить True,
        # иначе браузер выдаст ошибку. Поэтому ставим False для всех.
        allow_credentials=not _cors_has_wildcard, 
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
    )

app.add_middleware(TrustedHostMiddleware, allowed_hosts=TRUSTED_HOSTS)

if ENABLE_GZIP:
    app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start) * 1000
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
    added = _scan_music_dir()
    if AUTH_COOKIE_ENABLED:
        auth_mode = "cookie+roles"
    elif SERVER_API_TOKEN:
        auth_mode = "bearer-token"
    else:
        auth_mode = "off"
    print(f"[START] Сервер запущен на http://{HOST}:{PORT}")
    print(f"[START] BASE_DIR: {BASE_DIR}")
    print(f"[START] Музыка:   {MUSIC_DIR}")
    print(f"[START] БД:       {DB_PATH}")
    print(f"[START] Auth:     {auth_mode}")
    print(f"[START] Добавлено новых треков: {added}")


# ====================== СКАН / УТИЛИТЫ ======================
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
    conn = get_db()
    added = 0
    for path in sorted(MUSIC_DIR.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in AUDIO_EXTS:
            continue
        rel = path.relative_to(MUSIC_DIR).as_posix()
        row = conn.execute("SELECT id FROM tracks WHERE path = ?", (rel,)).fetchone()
        if row:
            continue
        raw = path.name
        display_name = raw.split("__", 1)[1] if "__" in raw else raw
        tid = f"server-{uuid.uuid4().hex[:12]}"
        conn.execute(
            """INSERT INTO tracks (id, name, path, duration, source, stream_url, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (tid, display_name, rel, 0, "server", f"/api/stream/{tid}", time.time()),
        )
        added += 1
    conn.commit()
    conn.close()
    return added


def sanitize_filename(name: str) -> str:
    bad = '<>:"/\\|?*'
    for ch in bad:
        name = name.replace(ch, "_")
    return name.strip() or "track"


def _track_to_dict(r: sqlite3.Row) -> dict:
    d = dict(r)
    if d.get("source") == "server":
        d["stream_url"] = f"/api/stream/{d['id']}"
    else:
        d["stream_url"] = None
    return d


# ====================== HEALTH / VERSION ======================
@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "version": "0.3.1",
        "db": str(DB_PATH),
        "log_enabled": _log_enabled,
        "auth_enabled": AUTH_COOKIE_ENABLED or bool(SERVER_API_TOKEN),
        "auth_mode": (
            "cookie" if AUTH_COOKIE_ENABLED
            else ("bearer" if SERVER_API_TOKEN else "off")
        ),
        "music_dir": str(MUSIC_DIR),
    }


@app.get("/api/version")
def version() -> dict:
    return {"name": "music-player-server", "version": "0.3.1"}


# ====================== AUTH ENDPOINTS ======================
@app.post("/api/auth/login")
def auth_login(data: LoginIn, response: Response) -> dict:
    if not AUTH_COOKIE_ENABLED:
        # Открытый режим: роль admin; token-режим: роль admin (токен = полный доступ).
        mode = "off" if not SERVER_API_TOKEN else "bearer"
        return {
            "ok": True,
            "role": "admin",
            "auth_enabled": bool(SERVER_API_TOKEN),
            "mode": mode,
        }

    role = _verify_credentials(data.username, data.password)
    if role is None:
        write_log("login_failed", {"username": data.username})
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = _issue_session(data.username, role)
    if not token:
        raise HTTPException(status_code=500, detail="Session serializer unavailable")

    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=AUTH_SESSION_TTL_HOURS * 3600,
        httponly=True,
        secure=AUTH_COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    write_log("login_ok", {"username": data.username, "role": role})
    return {"ok": True, "role": role, "auth_enabled": True, "mode": "cookie"}


@app.post("/api/auth/logout")
def auth_logout(response: Response) -> dict:
    response.delete_cookie(AUTH_COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/api/auth/me")
def auth_me(session: Optional[dict] = Depends(current_session)) -> dict:
    if not AUTH_COOKIE_ENABLED and not SERVER_API_TOKEN:
        return {
            "auth_enabled": False,
            "logged_in": True,
            "role": "admin",
            "username": "anonymous",
            "mode": "off",
        }
    return {
        "auth_enabled": True,
        "logged_in": session is not None,
        "role": (session or {}).get("r"),
        "username": (session or {}).get("u"),
        "mode": "cookie" if AUTH_COOKIE_ENABLED else "bearer",
    }


# ====================== LOG ======================
def require_any_auth(
    session: Optional[dict] = Depends(current_session),
    authorization: Optional[str] = Header(default=None),
) -> None:
    """
    Пропускает, если:
      - пользователь авторизован cookie-сессией (cookie-auth), или
      - передан валидный Bearer SERVER_API_TOKEN, или
      - сервер работает в открытом режиме (нет ни cookie-auth, ни токена).
    Иначе — 401.
    """
    if not AUTH_COOKIE_ENABLED and not SERVER_API_TOKEN:
        return  # открытый режим
    if session is not None:
        return
    if SERVER_API_TOKEN and _check_bearer(authorization):
        return
    raise HTTPException(status_code=401, detail="Unauthorized")


@app.post("/api/log", dependencies=[Depends(require_admin)])
def log_event(data: LogIn) -> dict:
    write_log(data.event, data.payload)
    return {"ok": True}


@app.post("/api/log-config", dependencies=[Depends(require_admin)])
def log_config(data: LogConfigIn) -> dict:
    global _log_enabled
    _log_enabled = data.enabled
    print(f"[LOG] Логирование {'включено' if _log_enabled else 'выключено'}")
    if _log_enabled:
        write_log("log_config", {"enabled": True})
    return {"ok": True, "enabled": _log_enabled}


# ====================== TRACKS ======================
@app.get("/api/tracks", dependencies=[Depends(require_login)])
def list_tracks() -> list:
    conn = get_db()
    rows = conn.execute("SELECT * FROM tracks ORDER BY created_at DESC").fetchall()
    conn.close()
    return [_track_to_dict(r) for r in rows]


@app.post("/api/tracks", dependencies=[Depends(require_admin)])
def create_track(track: TrackIn) -> dict:
    tid = track.id or f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}"
    conn = get_db()
    existing = conn.execute("SELECT created_at FROM tracks WHERE id = ?", (tid,)).fetchone()
    created_at = existing["created_at"] if existing and existing["created_at"] else time.time()
    conn.execute(
        """INSERT OR REPLACE INTO tracks
           (id, name, path, duration, source, archive_id, stream_url, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (tid, track.name, track.path, track.duration, track.source,
         track.archive_id, track.stream_url, created_at),
    )
    conn.commit()
    conn.close()
    write_log("track_create", {"id": tid, "name": track.name})
    return {"id": tid, "name": track.name}


@app.delete("/api/tracks/{track_id}", dependencies=[Depends(require_admin)])
def delete_track(track_id: str) -> dict:
    conn = get_db()
    row = conn.execute("SELECT path, source FROM tracks WHERE id = ?", (track_id,)).fetchone()
    if row is None:
        conn.close()
        raise HTTPException(status_code=404, detail="Track not found")
    if row["source"] == "server" and row["path"]:
        file_path = MUSIC_DIR / row["path"]
        try:
            if file_path.exists():
                file_path.unlink()
        except Exception as e:
            print(f"[DB] Не удалось удалить файл {file_path}: {e}")
    conn.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
    conn.execute("DELETE FROM tags WHERE track_id = ?", (track_id,))
    conn.execute("DELETE FROM volume_intervals WHERE track_id = ?", (track_id,))
    conn.commit()
    conn.close()
    write_log("track_delete", {"id": track_id})
    return {"ok": True}


@app.get("/api/tracks/search", dependencies=[Depends(require_login)])
def search_tracks(q: str = "") -> list:
    if not q.strip():
        return list_tracks()
    conn = get_db()
    like_query = f"%{q.strip()}%"
    rows = conn.execute(
        "SELECT * FROM tracks WHERE source = 'server' AND name LIKE ? ORDER BY created_at DESC",
        (like_query,),
    ).fetchall()
    conn.close()
    return [_track_to_dict(r) for r in rows]


@app.get("/api/tracks/radio", dependencies=[Depends(require_login)])
def get_radio_tracks(tag: Optional[str] = None, limit: int = 20) -> list:
    limit = max(1, min(200, limit))
    conn = get_db()
    if tag and tag.strip():
        like_tag = f'%"{tag.strip()}"%'
        rows = conn.execute(
            """SELECT t.* FROM tracks t
               JOIN tags tg ON t.id = tg.track_id
               WHERE t.source = 'server' AND tg.value LIKE ?
               ORDER BY RANDOM() LIMIT ?""",
            (like_tag, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM tracks WHERE source = 'server' ORDER BY RANDOM() LIMIT ?",
            (limit,),
        ).fetchall()
    conn.close()
    return [_track_to_dict(r) for r in rows]


# ====================== STREAM ======================
@app.get("/api/stream/{track_id}")
def stream_track(track_id: str, request: Request):
    # Аутентификация: cookie / Bearer / ?token= (см. _stream_auth_ok).
    if not _stream_auth_ok(request):
        raise HTTPException(status_code=401, detail="Unauthorized")

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
            _, rng = range_header.split("=")
            start_s, end_s = rng.split("-")
            start = int(start_s) if start_s else 0
            end = int(end_s) if end_s else file_size - 1
        except Exception:
            raise HTTPException(status_code=416, detail="Invalid Range header")
        if start < 0 or start >= file_size:
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

        return StreamingResponse(
            iter_file(), status_code=206,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(length),
                "Cache-Control": "no-store",
            },
            media_type=media_type,
        )

    return FileResponse(
        file_path, media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-store",
        },
    )


# ====================== UPLOAD / SCAN ======================
@app.post("/api/upload", dependencies=[Depends(require_admin)])
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
        safe_name = f"{uuid.uuid4().hex[:12]}__{original}"
        dest = MUSIC_DIR / safe_name
        try:
            written = 0
            with dest.open("wb") as f:
                while True:
                    chunk = await uf.read(1024 * 1024)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > MAX_UPLOAD_BYTES:
                        raise ValueError(
                            f"Файл больше лимита {MAX_UPLOAD_BYTES // (1024 * 1024)} МБ"
                        )
                    f.write(chunk)
        except Exception as e:
            print(f"[UPLOAD] Ошибка сохранения {uf.filename}: {e}")
            if dest.exists():
                try:
                    dest.unlink()
                except Exception:
                    pass
            continue
        tid = f"server-{uuid.uuid4().hex[:12]}"
        conn.execute(
            """INSERT INTO tracks (id, name, path, duration, source, stream_url, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (tid, uf.filename, safe_name, 0, "server", f"/api/stream/{tid}", time.time()),
        )
        added.append({"id": tid, "name": uf.filename})
    conn.commit()
    conn.close()
    write_log("upload", {"count": len(added), "files": [a["name"] for a in added]})
    return {"ok": True, "added": added}


@app.post("/api/scan", dependencies=[Depends(require_admin)])
def scan_music() -> dict:
    added = _scan_music_dir()
    write_log("scan", {"added": added})
    return {"ok": True, "added": added}


# ====================== SETTINGS ======================
@app.get("/api/settings/{key}", dependencies=[Depends(require_login)])
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


@app.post("/api/settings", dependencies=[Depends(require_admin)])
def set_setting(data: SettingIn) -> dict:
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (data.key, json.dumps(data.value, ensure_ascii=False)),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/api/settings", dependencies=[Depends(require_login)])
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


# ====================== TAGS ======================
@app.get("/api/tags/{track_id}", dependencies=[Depends(require_login)])
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


@app.put("/api/tags/{track_id}", dependencies=[Depends(require_admin)])
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


@app.get("/api/tags", dependencies=[Depends(require_login)])
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


# ====================== PLAYLISTS ======================
@app.get("/api/playlists", dependencies=[Depends(require_login)])
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


@app.post("/api/playlists", dependencies=[Depends(require_admin)])
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


@app.delete("/api/playlists/{playlist_id}", dependencies=[Depends(require_admin)])
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


# ====================== QUEUE ======================
@app.get("/api/queue", dependencies=[Depends(require_login)])
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


@app.put("/api/queue", dependencies=[Depends(require_admin)])
def set_queue(data: QueueIn) -> dict:
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO queue (key, value) VALUES ('queue', ?)",
        (json.dumps(data.value, ensure_ascii=False),),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


# ====================== VOLUME INTERVALS ======================
@app.get("/api/volume-intervals/{track_id}", dependencies=[Depends(require_login)])
def get_intervals(track_id: str) -> dict:
    conn = get_db()
    row = conn.execute(
        "SELECT intervals FROM volume_intervals WHERE track_id = ?", (track_id,)
    ).fetchone()
    conn.close()
    if row is None:
        return {"track_id": track_id, "intervals": []}
    try:
        v = json.loads(row["intervals"])
    except Exception:
        v = []
    return {"track_id": track_id, "intervals": v}


@app.put("/api/volume-intervals/{track_id}", dependencies=[Depends(require_admin)])
def set_intervals(track_id: str, data: VolumeIntervalsIn) -> dict:
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO volume_intervals (track_id, intervals) VALUES (?, ?)",
        (track_id, json.dumps(data.intervals, ensure_ascii=False)),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/api/volume-intervals", dependencies=[Depends(require_login)])
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


# ====================== BACKUP ======================
@app.get("/api/backup/export", dependencies=[Depends(require_admin)])
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


@app.post("/api/backup/import", dependencies=[Depends(require_admin)])
def backup_import(data: BackupIn) -> dict:
    conn = get_db()
    cur = conn.cursor()

    for t in ["tracks", "queue", "settings", "tags", "tag_volumes", "playlists", "volume_intervals"]:
        cur.execute(f"DELETE FROM {t}")

    def ins_tracks(rows):
        for r in rows or []:
            src = r.get("source", "local")
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
                        (r.get("trackId") or r.get("track_id"),
                         json.dumps(r.get("value", []), ensure_ascii=False)))

    def ins_tag_volumes(rows):
        for r in rows or []:
            cur.execute("INSERT OR REPLACE INTO tag_volumes (tag, volume) VALUES (?, ?)",
                        (r.get("tag"), r.get("volume", 1.0)))

    def ins_playlists(rows):
        for r in rows or []:
            cur.execute("INSERT OR REPLACE INTO playlists (id, name, tracks) VALUES (?, ?, ?)",
                        (r.get("id"), r.get("name"),
                         json.dumps(r.get("tracks", []), ensure_ascii=False)))

    def ins_intervals(rows):
        for r in rows or []:
            cur.execute("INSERT OR REPLACE INTO volume_intervals (track_id, intervals) VALUES (?, ?)",
                        (r.get("trackId") or r.get("track_id"),
                         json.dumps(r.get("intervals", []), ensure_ascii=False)))

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


# ====================== СТАТИКА ======================
@app.get("/")
def index() -> FileResponse:
    index_path = BASE_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="index.html not found")
    return FileResponse(index_path)


if (BASE_DIR / "js").exists():
    app.mount("/js", StaticFiles(directory=BASE_DIR / "js"), name="js")


@app.get("/styles.css")
def styles() -> FileResponse:
    p = BASE_DIR / "styles.css"
    if not p.exists():
        raise HTTPException(status_code=404)
    return FileResponse(p)


@app.get("/{filename:path}")
def static_files(filename: str) -> FileResponse:
    if filename.startswith("api/") or filename.startswith("js/"):
        raise HTTPException(status_code=404)
    path = (BASE_DIR / filename).resolve()
    if not str(path).startswith(str(BASE_DIR)):
        raise HTTPException(status_code=404)
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(path)


# ====================== ЗАПУСК ======================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
