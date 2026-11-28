# ==========================================
# Stage 1: Build Frontend (React + Vite)
# ==========================================
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS frontend-builder
WORKDIR /app/frontend

# 分層快取：只在 package.json 或 package-lock.json 變動時重新安裝 node_modules
COPY frontend/package*.json ./
RUN npm ci

# 複製前端源碼並打包靜態資源
COPY frontend/ ./
COPY backend/app/resources/ /app/backend/app/resources/
ARG APP_COMMIT_SHA=development
ENV VITE_APP_COMMIT_SHA=${APP_COMMIT_SHA}
RUN npm run build

# ==========================================
# Stage 2: Build Python Backend Dependencies
# ==========================================
FROM python:3.11-slim@sha256:7032841967d07aa3353905945dc186901c89b6b319c61425f4439f677a4a8a34 AS backend-builder
WORKDIR /app

# 建立獨立虛擬環境隔離 Python 套件，避免污染最終運行映像
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# 分層快取：僅在 requirements.txt 變動時重新執行 pip install
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# ==========================================
# Stage 3: Production Runtime
# ==========================================
FROM python:3.11-slim@sha256:7032841967d07aa3353905945dc186901c89b6b319c61425f4439f677a4a8a34 AS runner
WORKDIR /app

# 3.1 執行期標準環境變數（禁止寫入 .pyc、無緩衝日誌輸出、啟用虛擬環境與模組解析路徑）
ENV ENVIRONMENT=production \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PATH="/opt/venv/bin:$PATH" \
    BIND_HOST=0.0.0.0 \
    PORT=8000

# 3.2 複製已編譯之 Python 虛擬環境（變動頻率低）
COPY --from=backend-builder /opt/venv /opt/venv

# 3.3 建立執行期持久化資料目錄
RUN mkdir -p /app/data

# 3.4 複製前端打包產物
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 3.5 複製後端應用程式代碼（變動頻率高）
COPY backend/ ./backend/

# 3.6 版本識別資訊
ARG APP_COMMIT_SHA=development
ENV APP_COMMIT_SHA=${APP_COMMIT_SHA}

# Run as non-root user; /app/data must be writable (mount a persistent volume)
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app app \
    && chown -R app:app /app/data
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import os,urllib.parse,urllib.request;hosts=[h.strip() for h in os.environ.get('TRUSTED_HOSTS','').split(',') if h.strip()];host=hosts[0] if hosts else (urllib.parse.urlparse(os.environ.get('PUBLIC_BASE_URL','')).hostname or '127.0.0.1');host='health.'+host[2:] if host.startswith('*.') else ('127.0.0.1' if host=='*' else host);req=urllib.request.Request('http://127.0.0.1:%s/api/v1/health' % os.environ.get('PORT','8000'), headers={'Host': host});urllib.request.urlopen(req, timeout=3)"]

CMD ["sh", "-c", "exec uvicorn backend.app.main:app --host \"${BIND_HOST}\" --port \"${PORT}\" --workers 1"]
