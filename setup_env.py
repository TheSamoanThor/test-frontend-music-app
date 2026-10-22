"""
Интерактивный генератор .env на основе .env.example.

Сохраняет комментарии и порядок строк из .env.example, подставляя
значения, которые ввёл пользователь. Всё, что пользователь пропустил,
остаётся как в шаблоне.

Использование:
    python setup_env.py
    python setup_env.py --example .env.example --output .env --force
    python setup_env.py --non-interactive   # только сгенерировать секреты
"""

from __future__ import annotations

import argparse
import getpass
import os
import re
import secrets
import stat
import sys
from pathlib import Path

try:
    import bcrypt
    _BCRYPT_AVAILABLE = True
except ImportError:
    bcrypt = None
    _BCRYPT_AVAILABLE = False

BASE_DIR = Path(__file__).resolve().parent

# Поля, значения которых можем сгенерировать автоматически, если
# пользователь попросит «оставить по умолчанию/сгенерировать».
FIELDS_PROMPT = {
    # key: (prompt_text, default_from_template_behavior)
    "HOST": ("Адрес сервера (127.0.0.1 — локально, 0.0.0.0 — для контейнера)", "keep"),
    "PORT": ("Порт HTTP-сервера", "keep"),
    "CORS_ORIGINS": ("CORS_ORIGINS (через запятую, * для локального режима)", "keep"),
    "TRUSTED_HOSTS": ("TRUSTED_HOSTS (через запятую, * для локального режима)", "keep"),
    "MAX_UPLOAD_MB": ("Максимальный размер загружаемого файла, МБ", "keep"),
    "LOG_ENABLED": ("Включить логирование в server.log при старте (true/false)", "keep"),
}

ASK_GENERATE = {
    # key: (prompt_text, generator, post_processor)
    "AUTH_SESSION_SECRET": (
        "Сгенерировать AUTH_SESSION_SECRET (секрет для подписи cookie)?",
        lambda: secrets.token_urlsafe(48),
        None,
    ),
    "SERVER_API_TOKEN": (
        "Сгенерировать SERVER_API_TOKEN (устаревший Bearer-токен, если нужен)?",
        lambda: secrets.token_urlsafe(32),
        None,
    ),
}

ASK_PASSWORD = {
    # key_prefix: (role_label, env_user_key, env_hash_key)
    "AUTH_ADMIN": ("admin", "AUTH_ADMIN_USER", "AUTH_ADMIN_PASSWORD_HASH"),
    "AUTH_LISTENER": ("listener", "AUTH_LISTENER_USER", "AUTH_LISTENER_PASSWORD_HASH"),
}

LINE_RE = re.compile(r"^(?P<key>[A-Z_][A-Z0-9_]*)=(?P<value>.*)$")


# ---------- утилиты ----------
def _is_template_comment_line(line: str) -> bool:
    return line.lstrip().startswith("#")


def _ensure_secure_permissions(path: Path) -> None:
    """Ставит 0600 на Linux/macOS; на Windows молча пропускает."""
    try:
        if os.name != "nt":
            os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    except Exception:
        pass


def _ask_yes_no(prompt: str, default: bool = False) -> bool:
    suffix = " [Y/n]" if default else " [y/N]"
    answer = input(prompt + suffix + ": ").strip().lower()
    if not answer:
        return default
    return answer in ("y", "yes", "д", "да")


def _ask_value(prompt: str, default: str, secret: bool = False) -> str:
    if secret:
        value = getpass.getpass(f"{prompt} [{default}]: ")
    else:
        value = input(f"{prompt} [{default}]: ")
    value = value.strip()
    return value if value else default


def _bcrypt_hash(password: str) -> str:
    if not _BCRYPT_AVAILABLE:
        raise RuntimeError(
            "bcrypt не установлен. Выполните: pip install -r requirements.txt"
        )
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


# ---------- чтение .env.example ----------
def read_template(path: Path) -> list[str]:
    if not path.exists():
        raise FileNotFoundError(f"Шаблон не найден: {path}")
    return path.read_text(encoding="utf-8").splitlines()


def parse_template(lines: list[str]) -> dict[str, str]:
    """Возвращает текущие значения полей из шаблона (без учёта комментариев)."""
    values: dict[str, str] = {}
    for raw in lines:
        line = raw.rstrip()
        if not line or _is_template_comment_line(line):
            continue
        m = LINE_RE.match(line)
        if m:
            values[m.group("key")] = m.group("value")
    return values


# ---------- сбор значений от пользователя ----------
def collect_values(template: dict[str, str]) -> dict[str, str]:
    overrides: dict[str, str] = {}

    print()
    print("=== Шаг 1. Базовые настройки ===")
    print("Enter — оставить значение по умолчанию из шаблона.")
    for key, (prompt, _) in FIELDS_PROMPT.items():
        if key not in template:
            continue
        default = template[key]
        overrides[key] = _ask_value(prompt, default)

    print()
    print("=== Шаг 2. Секреты ===")
    for key, (prompt, gen, _post) in ASK_GENERATE.items():
        if not _ask_yes_no(prompt, default=False):
            # оставляем как в шаблоне (обычно пустое)
            overrides[key] = template.get(key, "")
            continue
        value = gen()
        overrides[key] = value
        print(f"  {key} сгенерирован, длина {len(value)} символов.")

    print()
    print("=== Шаг 3. Пароли для cookie-auth ===")
    print("Пароли в .env не сохраняются — сохраняется только bcrypt-хэш.")
    print("Пустой ввод — оставить как в шаблоне (без пароля для этой роли).")
    for prefix, (role_label, user_key, hash_key) in ASK_PASSWORD.items():
        if hash_key not in template:
            continue
        user_default = template.get(user_key, "")
        print()
        ask = _ask_yes_no(
            f"Задать пароль для роли '{role_label}'?",
            default=False,
        )
        if not ask:
            overrides[user_key] = user_default
            overrides[hash_key] = template.get(hash_key, "")
            continue

        username = _ask_value("Имя пользователя для этой роли", user_default)
        while True:
            pwd1 = getpass.getpass("Пароль: ")
            if not pwd1:
                print("Пустой пароль не подходит. Отмена — Ctrl+C.")
                continue
            pwd2 = getpass.getpass("Пароль (повтор): ")
            if pwd1 != pwd2:
                print("Пароли не совпадают, попробуйте снова.")
                continue
            break

        try:
            h = _bcrypt_hash(pwd1)
        except RuntimeError as e:
            print(f"[ОШИБКА] {e}")
            sys.exit(1)

        overrides[user_key] = username
        overrides[hash_key] = h
        print(f"  bcrypt-хэш для '{username}' сохранён (длина {len(h)}).")

    return overrides


# ---------- генерация .env ----------
def render_env(lines: list[str], overrides: dict[str, str]) -> str:
    """
    Проходит по шаблону построчно, сохраняя комментарии и пустые строки.
    Если встречается KEY=..., подставляет значение из overrides.
    """
    out: list[str] = []
    for raw in lines:
        line = raw.rstrip()
        if not line or _is_template_comment_line(line):
            out.append(line)
            continue
        m = LINE_RE.match(line)
        if not m:
            out.append(line)
            continue
        key = m.group("key")
        value = overrides.get(key, m.group("value"))
        out.append(f"{key}={value}")

    # Сохраняем перевод строки в конце файла
    text = "\n".join(out)
    if not text.endswith("\n"):
        text += "\n"
    return text


def write_env(path: Path, text: str, force: bool) -> None:
    if path.exists() and not force:
        if not _ask_yes_no(f"{path.name} уже существует. Перезаписать?", default=False):
            print("Отменено. Файл не изменён.")
            sys.exit(0)
    path.write_text(text, encoding="utf-8")
    _ensure_secure_permissions(path)
    print(f"\n[OK] {path} сохранён ({path.stat().st_size} байт).")
    if os.name != "nt":
        print(f"[OK] Права доступа: 0600.")


# ---------- неинтерактивный режим ----------
def build_non_interactive(template: dict[str, str]) -> dict[str, str]:
    """
    Ничего не спрашивает. Генерирует только AUTH_SESSION_SECRET,
    если шаблон содержит пустое значение. Пароли оставляет как есть.
    """
    overrides = dict(template)
    if "AUTH_SESSION_SECRET" in overrides and not overrides["AUTH_SESSION_SECRET"]:
        overrides["AUTH_SESSION_SECRET"] = secrets.token_urlsafe(48)
        print("[OK] AUTH_SESSION_SECRET сгенерирован.")
    else:
        print("[INFO] AUTH_SESSION_SECRET уже задан или отсутствует в шаблоне.")
    return overrides


# ---------- главное ----------
def main() -> None:
    parser = argparse.ArgumentParser(description="Создать .env на основе .env.example")
    parser.add_argument("--example", default=str(BASE_DIR / ".env.example"),
                        help="Путь к шаблону (по умолчанию: .env.example)")
    parser.add_argument("--output", default=str(BASE_DIR / ".env"),
                        help="Куда писать результат (по умолчанию: .env)")
    parser.add_argument("--force", action="store_true",
                        help="Перезаписать .env без подтверждения")
    parser.add_argument("--non-interactive", action="store_true",
                        help="Только сгенерировать AUTH_SESSION_SECRET, без вопросов")
    args = parser.parse_args()

    example_path = Path(args.example)
    output_path = Path(args.output)

    try:
        lines = read_template(example_path)
    except FileNotFoundError as e:
        print(f"[ОШИБКА] {e}")
        sys.exit(1)

    template = parse_template(lines)

    print("=" * 60)
    print("  Music Player — настройка .env")
    print("=" * 60)
    print(f"  Шаблон: {example_path}")
    print(f"  Цель:   {output_path}")

    if args.non_interactive:
        print("\nРежим: non-interactive (только секреты).")
        overrides = build_non_interactive(template)
    else:
        overrides = collect_values(template)

    text = render_env(lines, overrides)
    write_env(output_path, text, args.force)

    print()
    print("Готово. Дальше:")
    print("  1. Проверьте .env глазами.")
    print("  2. Запустите сервер: start_server.bat (Windows) или ./start-server.sh.")
    print("  3. В логе должно быть: [START] Auth: cookie+roles (если задали пароль и секрет).")
    if os.name != "nt":
        print("  (.env создан с правами 0600 — только владелец может читать.)")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nОтменено пользователем.")
        sys.exit(130)
