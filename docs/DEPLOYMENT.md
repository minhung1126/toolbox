# Docker 與 production 部署

`Dockerfile` 採用最佳化的多階段分層架構（Stage 1 前端靜態資源打包、Stage 2 後端 Python 虛擬環境獨立依賴建置、Stage 3 極簡生產環境映像），隔離建置環境、有效利用 Docker Layer 快取並縮減最終映像體積。執行中的 FastAPI 應用程式是 `backend.app.main:app`，容器對外提供 port 8000。

## 準備環境

1. 安裝 Docker Engine 與 Docker Compose v2。
2. 在專案根目錄建立 `.env`：

```powershell
copy .env.example .env
```

3. **極簡配置（推薦）**：正式環境最少僅需設定 `PUBLIC_BASE_URL`，其餘皆可在網頁介面動態設定：

```env
PUBLIC_BASE_URL=https://your-domain.example
```

> **自動金鑰生成與安全保存**：若未在 `.env` 指定 `SECRET_KEY` 與 `CREDENTIAL_ENCRYPTION_KEY`，Toolbox 首次啟動時會自動以密碼學安全方式生成兩把獨立金鑰，並安全保存於 `data/.secrets.json`（檔案權限僅限伺服器端讀寫）。

### 首次啟動與初始化精靈 (Setup Wizard)

1. 啟動容器服務：
   ```powershell
   docker compose up -d
   ```
2. 當系統尚未設定 Google OAuth 憑證時，存取首頁會自動導向至 **/setup（初始化設定精靈）**。
3. **安全防護 PIN 碼 (Setup PIN)**：
   - 若透過反向代理或外部域名存取初始化精靈，後端會在容器日誌中印出**一次性 6 位數 Setup PIN**：
     ```powershell
     docker compose logs toolbox | Select-String "SETUP PIN"
     ```
   - 若直接於本機 (`localhost` / `127.0.0.1`) 存取，則自動豁免 PIN 碼驗證。
4. 在初始化精靈網頁中：
   - 複製畫面上提示的 Google Authorized Redirect URI（格式為 `https://your-domain.example/api/v1/auth/callback`）。
   - 貼入 Google Cloud Console 建立的 **Client ID** 與 **Client Secret**。
   - 輸入首位管理者 Google 信箱。
   - 點擊「儲存並啟用系統」，系統立即熱更新（Hot-reload）生效，隨即可使用該 Google 信箱登入控制台。

### 網頁後續維護與管理

- **系統憑證與白名單維護 (`/settings/system`)**：
  登入後可隨時至「帳號與系統設定 -> 系統安全與白名單」新增/刪除授權 Google 登入信箱（內建自我鎖定防護，禁止刪除當前登入者唯一帳號），或隨時更換 Google OAuth 憑證。
- **YouTube 槽位憑證設定 (`/youtube/settings/connections`)**：
  Primary 槽位可直接勾選「沿用系統 Google OAuth 憑證」，或自行輸入專用 Client ID/Secret；Secondary 槽位亦可隨時於網頁介面啟用、自訂標籤與設定專用憑證。

### 傳統環境變數覆寫（完全向下相容）

若偏好傳統以靜態 `.env` 管理所有設定，仍完全支援下列環境變數；若環境變數已設定，將優先採用：

```env
ENVIRONMENT=production
BIND_HOST=0.0.0.0
PORT=8000
HOST_PORT=8000
PUBLIC_BASE_URL=https://your-domain.example
FRONTEND_URL=https://your-domain.example
TRUSTED_HOSTS=your-domain.example
SECRET_KEY=可選，留空則自動生成並保存於data/.secrets.json
CREDENTIAL_ENCRYPTION_KEY=可選，留空則自動生成並保存於data/.secrets.json
ALLOWED_GOOGLE_EMAILS=user1@gmail.com,user2@gmail.com
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
YOUTUBE_OAUTH_PRIMARY_CLIENT_ID=
YOUTUBE_OAUTH_PRIMARY_CLIENT_SECRET=
YOUTUBE_OAUTH_SECONDARY_ENABLED=false
YOUTUBE_OAUTH_SECONDARY_CLIENT_ID=
YOUTUBE_OAUTH_SECONDARY_CLIENT_SECRET=
YOUTUBE_OAUTH_DEFAULT_SLOT=primary
```

`PUBLIC_BASE_URL` 是 OAuth callback 與 health response 的公開來源。Google Authorized redirect URI 必須逐字設定為：

```text
https://your-domain.example/api/v1/auth/callback
```

`BIND_HOST`、`PORT` 控制應用程式在容器內的監聽位址；Compose 的 `HOST_PORT` 控制主機端 port。Compose 預設只將主機 `127.0.0.1:${HOST_PORT}` 映射到容器 8000，反向代理若位於另一台主機，請將 bind address 改為明確的私有 LAN 位址並以防火牆限制來源。


### 推薦方式：使用 GitHub Container Registry (ghcr.io) 預先建置映像

當代碼推送至 GitHub `main` 分支時，GitHub Actions (`.github/workflows/publish-container.yml`) 會自動建置映像 (`linux/amd64`) 並推送到 `ghcr.io/minhung1126/toolbox`。

伺服器上無須安裝 Node.js 或 Python，直接拉取並啟動：

```powershell
copy .env.example .env
docker compose pull
docker compose up -d
docker compose ps
docker compose logs -f toolbox
```

- 預設會拉取 `ghcr.io/minhung1126/toolbox:latest`。
- 若欲鎖定特定版號（例如 `v1.0.1`）或 Commit SHA，可直接在 `.env` 設定 `IMAGE_NAME=ghcr.io/minhung1126/toolbox:v1.0.1`。
- 若伺服器已運行 Watchtower，可配置自動偵測 `ghcr.io` 更新並無縫重啟。

### 替代方式：從本機原始碼自建映像 (Local Build)

若在本機開發階段欲直接從原始碼編譯映像：

```powershell
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
docker compose ps
docker compose logs -f toolbox
```

> **注意**：若要在 GitHub Actions 中自動回寫 Git Tag，請確認 GitHub 倉庫設定 `Settings -> Actions -> General -> Workflow permissions` 設定為 **Read and write permissions**。

`docker compose config` 需要先存在 `.env`，也可用來確認 interpolation 與 volume 路徑。Compose 使用 `./data:/app/data` 保存執行期資料。

## 前端快取與版本驗證

FastAPI 會對首頁及其他 HTML 回傳：

```text
Cache-Control: no-store, max-age=0, must-revalidate
```

Vite 產生的 `/assets/*-<hash>.js` 與 `/assets/*-<hash>.css` 則回傳一年 immutable 快取。若前方使用 Cloudflare 或其他 CDN，請確認 Browser Cache TTL 沒有覆寫 origin 的 HTML header，也不要對首頁套用一年 immutable 規則；不需要使用 `Clear-Site-Data`。

部署後至少確認：

```powershell
$base = "https://your-domain.example"
(Invoke-WebRequest "$base/" -UseBasicParsing).Headers['Cache-Control']
$html = (Invoke-WebRequest "$base/" -UseBasicParsing).Content
$assets = [regex]::Matches($html, '/assets/[^"'']+\.(?:js|css)') | ForEach-Object Value | Sort-Object -Unique
foreach ($asset in $assets) {
  $response = Invoke-WebRequest "$base$asset" -UseBasicParsing
  "$asset :: $($response.StatusCode) :: $($response.Headers['Content-Type']) :: $($response.Headers['Cache-Control'])"
}
```

`APP_COMMIT_SHA` 會同時傳給 backend runtime 與 frontend builder 的 `VITE_APP_COMMIT_SHA`；health API 的 `commit_sha` 可用來辨識前後端版本是否一致。部署策略必須保留至少前一版 hashed assets，直到所有可能仍在使用舊 HTML 的分頁都能自然失效；若使用 Docker image 直接替換，請由 CDN 或共享靜態資產儲存保留舊版 `/assets/*`。HTML 的 `no-store` 只能避免新的 HTML 被重複使用，不能補回已被刪除的舊 JS/CSS。

## 健康檢查與資料保存

- Health endpoint：`/api/v1/health`。部署後可確認 HTTP 200 與 JSON 的 `ready` 為 `true`。
- OAuth callback：`/api/v1/auth/callback`。
- `data/` 包含加密憑證、session、帳號工作狀態、runtime 設定與兩個 YouTube 配額 ledger。服務重建或搬遷時必須保留整個 volume。
- 不要提交 `.env`、`data/` 或任何 client secret。修改 `.env` 後要重新建立或重啟容器。
- 正式環境若遇到 `409 stale_preview`，請讓使用者重新讀取並確認完整預覽；不要在 proxy 或 client 層自動重送寫入請求。
- API 錯誤的公開格式固定為 `detail.code`、`detail.message`、`detail.retryable`、`detail.field_errors`；不要把 provider 原始錯誤 body 寫入 response 或 log。
