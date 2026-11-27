# Google API 與 OAuth 2.0 設定

Toolbox 採用徹底解耦的模組化授權架構，將身分認證與各工具權限完全分離為 3 個獨立維度：
1. **控制台身分登入**（OpenID Connect: `openid`, `userinfo.email`, `userinfo.profile`）
2. **Google 試算表讀取**（`spreadsheets.readonly`）
3. **YouTube 頻道管理**（YouTube Data API: `youtube`）

Google OAuth 憑證（Client ID 與 Client Secret）可在首次啟動時透過**網頁安裝精靈 (`/setup`)** 或後續於「系統安全與白名單 (`/settings/system`)」直接配置，並支援熱更新與 AES-256 加密保存。

## Google Cloud 設定

1. 建立 Google Cloud 專案。
2. 啟用所需 API：
   - Google Sheets API
   - YouTube Data API v3
3. 建立 Web application OAuth client。
4. 設定 OAuth consent screen，加入測試帳號或送審上線。
5. 將下列 callback URI 加入「已授權的重新導向 URI (Authorized redirect URIs)」：

```text
http://localhost:8000/api/v1/auth/callback
https://your-domain.example/api/v1/auth/callback
```

正式 callback 必須是 `PUBLIC_BASE_URL` 加上 `/api/v1/auth/callback`。`BIND_HOST`、`PORT` 與 `HOST_PORT` 不會被用來猜測公開網址；若反向代理使用非標準 port，公開 URL 必須保留該 port。

## 憑證配置方式

### 方式 A：網頁控制台配置（推薦）

啟動服務後：
- 首次運行若尚未配置 Google 憑證，系統會引導至 `/setup` 初始化精靈，輸入 Client ID、Client Secret 與管理者 Email 即可一鍵完成啟用。
- 登入後可隨時至「帳號與 Google 設定 -> 系統安全與白名單」更新憑證。
- YouTube Primary 槽位可一鍵勾選「沿用控制台 Google OAuth 憑證」，Secondary 備用槽位亦可填入獨立 Client 憑證。

### 方式 B：傳統環境變數配置（可選相容）

若偏好以靜態 `.env` 管理所有設定，亦支援直接於 `.env` 配置：

```env
PUBLIC_BASE_URL=https://your-domain.example
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
ALLOWED_GOOGLE_EMAILS=admin@example.com
```

> **安全提示**：Client Secret、`SECRET_KEY`、`CREDENTIAL_ENCRYPTION_KEY` 與使用者 Refresh Token 一律僅由後端保存在 `data/` 受保護的加密保險庫中，絕不會傳送至前端。

## 啟動與檢查

```powershell
copy .env.example .env
python -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

確認 `http://localhost:8000/api/v1/health` 回傳 `status: "healthy"`，並檢查 `ready`、`configuration`、`youtube` 與 `warnings`。health response 只回報設定狀態，不回傳 client secret。
