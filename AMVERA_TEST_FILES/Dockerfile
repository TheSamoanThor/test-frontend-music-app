FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py ./
# make_passwords.py — вспомогательная утилита. Копируем, если есть.
COPY make_passwords.py* ./
COPY index.html styles.css ./
COPY js ./js

RUN mkdir -p /app/music
RUN useradd -m -u 10001 appuser && chown -R appuser:appuser /app
USER appuser

ENV HOST=0.0.0.0 \
    PORT=8000 \
    AUTH_COOKIE_SECURE=true

EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
