# Toolbox (多功能工具箱網站)

Toolbox 是以 Docker 容器化運行的多功能工具箱平台，採用 **FastAPI (Python 3.11+)** 後端搭配 **React/Vite** 前端，架構清晰好維護。
GitHub Actions 會先執行後端與前端檢查及容器建置，再將 `linux/amd64` 映像發布至 **GitHub Container Registry (`ghcr.io`)**。

平台首要且完整內建的核心模組為 **Creator Tools**（YouTube 與 Google 創作者自動化工作流控制台），後續可透過模組化架構零耦合擴充其他功能工具。
所有帳號工作狀態、加密憑證、工作流日誌與 YouTube 配額估算皆保存於伺服器端 `data/` 目錄，透過 Docker Volume `./data:/app/data` 在容器更新時保留資料。

## 核心功能模組

### 1. 創作者工具模組 (Creator Tools - 核心必要功能)
- **Google OAuth 登入與白名單控制**：僅允許授權的 Google 信箱登入，AES-256 加密保存 Refresh Token。
- **Google Sheets 雙向連動**：欄位自動對應、團體與人物篩選。
- **YouTube 雙授權槽位 (Primary / Secondary)**：支援多頻道或多授權組合切換。
- **YouTube 智慧自動分流 (Auto Routing)**：Primary 配額充足時優先使用，不足時自動切換 Secondary；執行中若遇配額限制自動平滑切換另一個可用 slot 並重試。
- **Video／Shorts 草稿管理**：各自指定工作表、標題與描述欄位，批次預覽與防髒寫入保護。
- **Google Drive 批次上傳**：影片檔名自然排序，以可恢復的背景長任務 (`202 Accepted + job_id`) 串流上傳至 YouTube。
- **發布草稿與播放清單清理**：自動發布為公開影片並移出 To-Post 清單。
- **YouTube 配額安全記帳**：每日 10,000 點安全額度雙桶記帳日誌與預估保護。

### 2. 系統診斷與工具箱目錄模組 (Toolbox Catalog & System Utility)
- **工具箱目錄中心**：`/api/v1/tools` 提供已安裝工具的自描述元數據，便於前端與 API 動態註冊新工具。
- **即時健康度檢查**：`/api/v1/health` 檢測 OAuth 憑證、YouTube 配額就緒度與環境配置。
- **系統部署資訊**：`/system/info` 顯示 Commit SHA、版本一致性與容器運行狀態。

## 系統架構與資料持久化

完整的系統模組化設計、外掛外掛規格與新工具開發指南請參閱 [系統架構設計與模組化開發指南 (docs/ARCHITECTURE.md)](docs/ARCHITECTURE.md)。

```text
toolbox/
├── backend/app/
│   ├── main.py              # FastAPI 啟動入口、Lifespan 管理與 SPA 靜態託管
│   ├── api/                 # /api/v1/ 路由入口
│   ├── tools/               # 工具箱模組擴充目錄 (ToolRegistry, Plugin 規格與內建外掛)
│   ├── core/                # 共享底層 (安全加密、設定、Session、配額限制器)
│   └── services/            # 核心服務 (Google Auth, Drive, Sheets, YouTube)
├── frontend/src/
│   ├── tools/               # 前端模組化工具目錄與動態導覽配置
│   ├── pages/               # 各工具頁面
│   ├── components/          # 共用 UI 元件
│   └── styles/              # 共用設計 token、基礎樣式與主題
├── docs/                    # 架構、部署、Google API 與配額說明手冊
├── data/                    # 執行期持久化資料 (憑證、Session、配額帳本，Git 不提交)
├── Dockerfile               # Node 20 + Python 3.11 兩階段高效率容器映像建置
├── docker-compose.yml       # 本機運行與 GHCR 映像拉取 Compose 配置
└── .github/workflows/       # GitHub Actions (validate-container, publish-container)
```

> **維持 `/data` 結構**：所有敏感加密憑證、登入 Session 與長任務狀態皆固定存放在專案根目錄的 `data/`。Docker 透過 `./data:/app/data` 掛載，保證升級容器映像時資料完全不遺失。

## 本機開發

**極簡啟動（零設定即可運行）**：
Toolbox 支援**網頁內建初始化精靈與系統設定**，`.env` 最少僅需指定 `PUBLIC_BASE_URL`（本機開發甚至完全不需要設定任何金鑰與憑證即可自動啟動）：

```powershell
copy .env.example .env

python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r backend/requirements-dev.txt
python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

另一個終端機啟動前端：

```powershell
cd frontend
npm ci
npm run dev
```

開啟 <http://localhost:3000>。初次啟動時系統會自動導引至 **初始化精靈 (`/setup`)**，或直接在登入頁點選「立即進行初始化設定」，即可在網頁端完成 Google OAuth 與管理員白名單設定，無需手動填寫複雜的 `.env`。

後端健康檢查為 <http://localhost:8000/api/v1/health>；除 HTTP 200 外，也請確認 JSON 的 `ready` 是否為 `true`。

## 前端主要網址

前端使用 React Router；每個功能都有可直接開啟、重新整理與分享的網址：

- `/setup`：系統初始化設定精靈（首次啟動時設定 Google OAuth 與管理員信箱）
- `/login`：Google 控制台登入
- `/dashboard`：儀表板
- `/system/health`、`/system/info`、`/system/design-system`：API 健康度、部署資訊與共用元件展示
- `/settings/system`：系統安全、Google OAuth 憑證與登入白名單管理
- `/weverse-uploader`：Weverse 影片上傳工作台
- `/ffmpeg-generator`、`/photo-curator`、`/notes`：媒體工具與便利貼
- `/youtube/drafts/videos`、`/youtube/drafts/shorts`：Video／Shorts 草稿
- `/youtube/publish-cleanup`：發布並清理清單
- `/youtube/settings/connections`、`/youtube/settings/routing`、`/youtube/settings/quota`、`/youtube/settings/playlist`：YouTube 子設定
- `/sheets/copy`：Sheet 內容複製
- `/settings/google`、`/settings/sheets`：Google 帳號與預設 Sheet

`/`、`/youtube/settings` 與 `/settings` 會以 replace redirect 到對應的 canonical URL。Production 的 FastAPI SPA fallback 會提供深層前端網址的 `index.html`，但 `/api/*` 仍維持 API 404 行為。

## 驗證

```powershell
cd frontend
npm run format:check
npm run lint
npm run lint:styles
npm run typecheck
npm test -- --run
npm run build
npx playwright install chromium
npm run test:e2e

cd ..
python -m ruff format --check backend
python -m ruff check backend
python -m pytest -q
docker compose config
```

若要執行 Compose，根目錄必須存在 `.env`。

**使用 GHCR 映像啟動（生產推薦）：**

```powershell
copy .env.example .env
docker compose pull
docker compose up -d
docker compose ps
docker compose logs -f toolbox
```

**若欲在本機從原始碼編譯啟動（開發測試）：**

```powershell
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Compose 預設把容器的 8000 port 綁到主機 `127.0.0.1:${HOST_PORT}`，並以 `./data:/app/data` 保存執行期資料。

## 文件

- [Google API 與 OAuth 設定](docs/GOOGLE_API_SETUP.md)
- [YouTube 配額說明](docs/YOUTUBE_QUOTA.md)
- [Docker 與 production 部署](docs/DEPLOYMENT.md)
- [系統架構設計與模組化開發指南](docs/ARCHITECTURE.md)

正式環境僅需在 `.env` 設定 `PUBLIC_BASE_URL`（例如 `https://toolbox.example.com`），`SECRET_KEY` 與 `CREDENTIAL_ENCRYPTION_KEY` 於首次啟動時自動生成並安全保存於 `data/.secrets.json`。Google OAuth 憑證、管理員白名單及 YouTube 槽位皆可在網頁端設定並即時熱更新生效。Google callback 由 `PUBLIC_BASE_URL` 組成：`/api/v1/auth/callback`。

