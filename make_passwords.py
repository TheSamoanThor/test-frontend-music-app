"""Сгенерировать bcrypt-хэши для .env: AUTH_ADMIN_PASSWORD_HASH / AUTH_LISTENER_PASSWORD_HASH.

Использование:
    python make_passwords.py
    python make_passwords.py admin mypassword
"""
import getpass
import sys

import bcrypt


def main() -> None:
    if len(sys.argv) == 3:
        user, password = sys.argv[1], sys.argv[2]
    elif len(sys.argv) == 1:
        user = input("Username: ").strip()
        password = getpass.getpass("Password: ")
    else:
        print(__doc__)
        sys.exit(1)

    h = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode()
    print(f"\nДля пользователя '{user}' добавьте в .env:\n")
    print(f"AUTH_{'ADMIN' if user.lower() == 'admin' else 'LISTENER'}_PASSWORD_HASH={h}")

    # Пауза в конце
    input('Нажмите Enter для выхода...')
    return 0


if __name__ == "__main__":
    main()
