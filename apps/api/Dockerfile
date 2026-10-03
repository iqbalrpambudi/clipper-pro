FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_SYSTEM_PYTHON=1 \
    UV_LINK_MODE=copy

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        curl \
        fontconfig \
        fonts-dejavu-core \
        fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/fonts \
    && mkdir -p /etc/fonts \
    && echo '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>/app/fonts</dir><dir>/app/app/fonts</dir></fontconfig>' > /etc/fonts/local.conf \
    && fc-cache -f

COPY --from=ghcr.io/astral-sh/uv:0.5.24 /uv /usr/local/bin/uv

WORKDIR /app

# Dependency layer
COPY pyproject.toml ./
RUN uv pip install --system -r pyproject.toml --extra dev

COPY . .

FROM base AS dev
# --timeout-graceful-shutdown: SSE streams never end on their own, so without a cap
# uvicorn --reload waits on them forever and every backend edit hangs the API.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--reload", "--timeout-graceful-shutdown", "5"]
