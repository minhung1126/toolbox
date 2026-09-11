# Toolbox 開發規範

Toolbox 是一個高擴充性的多功能模組化工具箱平台，使用 FastAPI (Python 3.11+)、React/Vite 與 Docker，內建首要核心套件為 Creator Tools（整合 Google Sheets、Google Drive 與 YouTube 創作者自動化工作流）。

## 架構與安全

- OAuth bind 位址使用 `BIND_HOST`／`PORT`；callback URL 使用 `PUBLIC_BASE_URL`／`FRONTEND_URL`。
- 正式環境必須設定 `ALLOWED_GOOGLE_EMAILS`。
- Google Client ID、Client Secret 與所有 token／secret 只能由後端管理，不得傳至前端或寫入版本庫。
- 非 secret 執行期設定保存於 `data/runtime_config.json`，優先於 `.env` 預設值；`data/` 目錄必須持久化（包含加密憑證、Session、配額帳本與長任務狀態）。
- 授權採模組化解耦架構：
  - 控制台登入限縮為純身分認證（`openid`, `userinfo.email`, `userinfo.profile`）。
  - Google 試算表（`spreadsheets.readonly`）、Google 雲端硬碟（`drive.readonly`）與 YouTube（`youtube`）為獨立授權。
  - FastAPI 認證依賴注入分別使用：
    - `require_login_credentials`：控制台身分驗證。
    - `require_sheets_credentials`：試算表讀取權限（具 legacy 憑證自動 fallback 相容）。
    - `require_drive_credentials`：雲端硬碟讀取權限（具 legacy 憑證自動 fallback 相容）。
    - `require_youtube_context`：YouTube 頻道操作與配額槽位選擇。
- 正式程式一律使用 `logging`，嚴格禁止使用 `print()`。

## 模組化擴充規範 (Toolbox Plugins)

- 新工具後端模組必須繼承 `ToolPlugin` 抽象基類（於 `backend/app/tools/base.py`），宣告 `ToolMetadata`（含 `id`, `name`, `title`, `routes`, `required_scopes` 等）、可選的 `router` 與 `on_startup` / `on_shutdown` 生命週期勾子。
- 新工具後端需註冊至 `backend/app/tools/registry.py` 的全域 `tool_registry`，目錄端點 `/api/v1/tools` 將自動對外公佈其元數據與路由。
- 新工具前端模組必須於 `frontend/src/tools/catalog.js` 登記，導覽列 (`Navbar`) 與儀表板 (`DashboardPage`) 將自動感應並動態渲染其選單與卡片。
- 參考範本：`backend/app/tools/builtin/example_tool.py` 與 `docs/ARCHITECTURE.md`。

## 前端規範

- 禁止使用原生瀏覽器警告／確認對話框（`alert`, `confirm`）；統一使用 `useToast()` 與 `ConfirmDialog`。
- 沿用暗色 Glassmorphism 與 `index.css` 的共用 class，避免重複 inline style。
- 各獨立授權功能需在對應頁面（試算表設定頁、Drive 上傳頁、YouTube 設定頁、帳號總覽頁）就地提供授權狀態、連結與解除按鈕。

## 驗證

- 後端：`python -m ruff check backend`、`python -m ruff format --check backend`、`python -m pytest backend/tests -q`
- 前端：`npm run lint`、`npm test -- --run`、`npm run build`

## Release

- Push `main` 時自動建立 Git version tag，並發布 Docker image 至 GHCR (`ghcr.io/minhung1126/toolbox`)。
- Docker image 必須同時標註 `latest` tag、`v*` semver tag 與 commit sha tag。
- `docker-compose.yml` 預設以拉取 `ghcr.io/minhung1126/toolbox:latest` 方式運行。
