# ==========================================
# Stage 1: Build Frontend (React + Vite)
# ==========================================
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS frontend-builder
WORKDIR /app/frontend

# 分層快取：只在 package.json 或 package-lock.json 變動時重新安裝 node_modules
COPY frontend/package*.json ./
RUN npm ci

# 複製前端源碼並打包靜態資源
COPY frontend/ ./
ARG APP_COMMIT_SHA=development
ENV VITE_APP_COMMIT_SHA=${APP_COMMIT_SHA}
RUN npm run build

# ==========================================
# Stage 2: Build Python Backend Dependencies
# ==========================================
FROM python:3.11-slim@sha256:db3ff2e1800a8581e2c48a27c3995339d47bdf046da21c7627accd3d51053a93 AS backend-builder
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
FROM python:3.11-slim@sha256:db3ff2e1800a8581e2c48a27c3995339d47bdf046da21c7627accd3d51053a93 AS runner
WORKDIR /app

# 3.1 執行期標準環境變數（禁止寫入 .pyc、無緩衝日誌輸出、啟用虛擬環境與模組解析路徑）
ENV PYTHONDONTWRITEBYTECODE=1 \
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

EXPOSE 8000

CMD ["sh", "-c", "exec uvicorn backend.app.main:app --host \"${BIND_HOST}\" --port \"${PORT}\""]
