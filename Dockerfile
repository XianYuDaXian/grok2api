# ── Builder ───────────────────────────────────────────────────────────────────
FROM python:3.13-alpine AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv

ENV PATH="$UV_PROJECT_ENVIRONMENT/bin:$PATH"

# Rust/Cargo are required to compile curl-cffi wheels on musl/Alpine.
RUN apk add --no-cache \
    ca-certificates \
    build-base \
    linux-headers \
    libffi-dev \
    openssl-dev \
    curl-dev \
    cargo \
    rust

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.6 /uv /uvx /bin/
COPY pyproject.toml uv.lock ./

RUN uv sync --frozen --no-dev --no-install-project \
    && find /opt/venv -type d \
         \( -name "__pycache__" -o -name "tests" -o -name "test" -o -name "testing" \) \
         -prune -exec rm -rf {} + \
    && find /opt/venv -type f -name "*.pyc" -delete \
    && find /opt/venv -type f -name "*.so" -exec strip --strip-unneeded {} + 2>/dev/null; true \
    && rm -rf /root/.cache /tmp/uv-cache

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM python:3.13-alpine

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=Asia/Shanghai \
    VIRTUAL_ENV=/opt/venv \
    SERVER_HOST=0.0.0.0 \
    SERVER_PORT=8000 \
    SERVER_WORKERS=1

ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN apk add --no-cache \
    tzdata \
    ca-certificates \
    libffi \
    openssl \
    libgcc \
    libstdc++ \
    libcurl

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY pyproject.toml uv.lock config.defaults.toml ./
COPY main.py ./
COPY app ./app
COPY scripts ./scripts

RUN mkdir -p /app/data /app/data/tmp /app/logs \
    && chmod +x /app/scripts/entrypoint.sh /app/scripts/init_storage.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["sh", "-c", "wget -qO /dev/null http://127.0.0.1:${SERVER_PORT}/health || exit 1"]

ENTRYPOINT ["/app/scripts/entrypoint.sh"]
CMD ["sh", "-c", "exec granian --interface asgi --host ${SERVER_HOST} --port ${SERVER_PORT} --workers ${SERVER_WORKERS} app.main:app"]
