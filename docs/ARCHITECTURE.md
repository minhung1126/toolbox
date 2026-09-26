# Toolbox 架構設計與模組化開發指南

Toolbox 是一個高擴充性、容器化運行的多功能工具箱平台。本文檔說明系統的模組化分層架構，以及如何開發、註冊並維護新的工具模組。

---

## 1. 系統分層架構 (Architecture Layers)

Toolbox 採用 **「平台核心 (Platform Core) + 工具外掛 (Tool Plugins)」** 的解耦架構：

```text
┌─────────────────────────────────────────────────────────────┐
│                    Toolbox Web Platform                     │
│               (React 18 + Vite SPA Frontend)                │
└──────────────────────────────┬──────────────────────────────┘
                               │ REST / JSON
┌──────────────────────────────▼──────────────────────────────┐
│                    FastAPI Gateway & Auth                   │
│   (Session Management, Rate Limiting, Error Standardization) │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
┌──────────────▼──────────────┐┌──────────────▼──────────────┐
│        Platform Core        ││        Tool Registry         │
│  - Config & Runtime Config  ││  (Central Tool Catalog)     │
│  - Credential Store (AES)   │└──────────────┬──────────────┘
│  - Session Store            │               │
│  - Account State Store      │               ├─► Creator Tools Plugin
│  - Google OIDC Identity Auth│               │   (YouTube, Sheets, Drive)
└─────────────────────────────┘               ├─► System Utility Plugin
                                              │   (API Health, Deployment Info)
                                              └─► [Future Tools...]
                                                  (PDF, Image, Scraper, etc.)
```

### 1.1 平台核心 (Platform Core - `backend/app/core/`)
- **身分驗證與會話 (`session_store.py`)**: 管理登入使用者的短期 Session Cookie，不存放未加密敏感憑證。
- **系統金鑰與加密憑證保險庫 (`system_secrets.py`)**: 支援零設定自動生成持久化系統主密鑰 (`SECRET_KEY`、`CREDENTIAL_ENCRYPTION_KEY`) 保存於 `/data/.secrets.json`；採用 AES (Fernet) 加密保存系統級 Google OAuth 與 YouTube Client 憑證於 `/data/system_credentials.json`；管理首次設置時的一性安全 Setup PIN 碼。
- **動態配置與熱同步 (`config.py`)**: `sync_dynamic_config()` 即時合併靜態 `.env`、`system_credentials.json` 與 `runtime_config.json`，無須重啟容器即可動態切換憑證與設定。
- **OAuth Refresh Token 保險庫 (`credential_store.py`)**: 採用 AES-256 加密保存使用者的第三方 OAuth Refresh Token，持久化於 `/data/credentials.json`。
- **非 Secret 執行期配置 (`runtime_config.py`)**: 保存於 `/data/runtime_config.json`，支援動態變更（包含 Google 登入白名單、YouTube 槽位開關/標籤、配額限制）且優先於 `.env`。
- **請求保護 (`request_protection.py`)**: 內建 Origin / Referer 檢查與防刷 Rate Limiter。
- **錯誤契約 (`error_contract.py`)**: 統一標準化 `{ code, message, retryable, field_errors }` 錯誤回應格式。


### 1.2 外掛與註冊中心 (Tool Plugins - `backend/app/tools/`)
- **`base.py`**:
  - `ToolMetadata`: 定義工具的識別碼 (`id`)、名稱 (`name` / `title`)、圖示 (`icon`)、分類 (`category`)、入口與子路由清單 (`routes`)，以及所需 OAuth Scopes。
  - `ToolPlugin`: 抽象基礎類別，支援宣告 `metadata`、`router`、`on_startup` 與 `on_shutdown` 生命週期勾子。
- **`registry.py`**:
  - `ToolRegistry`: 集中管理所有已安裝工具，拒絕重複工具 ID，負責掛載路由、執行生命週期勾子（如背景上傳 Worker）與彙整健康度。外掛啟動失敗會出現在 `/api/v1/health` 的 `tools` 欄位，並使 `ready` 回傳 `false`。
- **`builtin/`**:
  - `creator_tools.py`: 創作者工具模組（封裝 YouTube、Google Sheets、Google Drive 批次上傳）。
  - `playlist_sorter.py`: YouTube Music 專屬音樂工具箱模組（支援 YouTube Music 獨立帳號授權、智慧多重排序、清單名稱即時搜尋篩選、雙欄模擬預覽與一鍵套用）。
  - `photo_curator.py`: Instagram 貼文排版工具模組。
  - `sheets_tools.py`: 試算表內容複製與跨表設定模組。
  - `sticky_notes.py`: 個人便利貼文字備忘錄模組。
  - `youtube_integrations.py`: YouTube 雙槽位頻道連線、路由分流與配額管理模組。
  - `system_utility.py`: 系統診斷與版本資訊模組。
  - `example_tool.py`: 擴充新工具之開發者參考範本。

---

## 2. 如何新增一個工具模組 (How to Add a New Tool)

新增一個新功能工具僅需 3 個步驟：

### 步驟 1：建立後端 ToolPlugin

在 `backend/app/tools/` 下建立新目錄或檔案（例如 `backend/app/tools/my_tool/` 或 `backend/app/tools/builtin/my_tool.py`）：

```python
from fastapi import APIRouter
from backend.app.tools.base import ToolPlugin, ToolMetadata, ToolRoute

router = APIRouter(prefix="/my-tool", tags=["My Tool"])

@router.get("/data")
def get_my_tool_data():
    return {"status": "success", "items": []}

class MyToolPlugin(ToolPlugin):
    def __init__(self):
        self._metadata = ToolMetadata(
            id="my-tool",
            name="My Tool",
            title="我的新工具",
            description="說明本工具的用途與功能...",
            category="實用工具",
            icon="Wrench",
            version="1.0.0",
            status="active",
            entry_url="/my-tool",
            routes=[
                ToolRoute(path="/my-tool", label="工具首頁", description="功能主頁面"),
            ],
            required_scopes=[],
        )

    @property
    def metadata(self) -> ToolMetadata:
        return self._metadata

    @property
    def router(self) -> APIRouter:
        return router
```

### 步驟 2：在後端註冊外掛

在 `backend/app/tools/builtin/__init__.py` 的 `register_builtin_tools()` 中加入一行：

```python
from backend.app.tools.builtin.my_tool import MyToolPlugin
tool_registry.register(MyToolPlugin())
```

- `/api/v1/tools` 目錄端點會自動對外公開該工具的完整元數據。
- FastAPI 會自動載入該工具的路由，無須手動修改主程式。

### 步驟 3：建立前端 feature manifest

1. 在 `frontend/src/routes/paths.js` 加入 canonical URL；需要登入回跳的入口也加入既有 return-path 白名單。
2. 在 `frontend/src/features/<tool>/manifest.js` 宣告與後端一致的 ID、metadata、`routes`、`navGroups` 及 `featureCards`，並在 `tools/catalog.js` 匯入此 manifest。
3. `AppRoutes`、`Navbar` 與 Dashboard 自動讀取 catalog。新增工具不需修改上述共用元件。單一導覽項目預設直接顯示連結；多項目顯示可展開群組。`collapsible: true` 可強制單項目使用群組；`sidebar: false` 表示該群組只用於子導覽，例如 YouTube 設定頁。
4. 頁面使用 `shared/ui` 元件與 `styles/tokens.css` 語意 token，固定版面放 feature CSS。API 契約與包裝器放 feature 的 `api/`，領域純函式放 `model/`。
5. 補齊 manifest／路由契約、功能互動與需要的 E2E。Navbar 測試已驗證新增 manifest 群組可直接呈現及展開目前路由。

```javascript
import { lazy } from 'react';
import { Wrench } from 'lucide-react';
import { PATHS } from '../../routes/paths';

const manifest = {
  id: 'my-tool',
  name: 'My Tool',
  title: '我的工具',
  category: '實用工具',
  status: 'active',
  entryUrl: PATHS.myTool,
  navGroups: [{
    id: 'my-tool', label: '我的工具', icon: Wrench,
    items: [{ id: 'my-tool-home', to: PATHS.myTool, label: '我的工具', icon: Wrench }],
  }],
  routes: [{
    path: PATHS.myTool.slice(1),
    component: lazy(() => import('./pages/MyToolPage')),
    getProps: ({ pageProps }) => pageProps,
  }],
  featureCards: [],
};
export default manifest;
```

### 應用組裝與測試隔離

`backend.app.main.create_app()` 接受 `app_settings`、`notes_store`、`account_state_store`、`session_store`、`credential_store`、`upload_worker`、`youtube_workflow_adapters`、`youtube_quota_trackers`、`request_limiter`、`registry` 與 `dependency_overrides`。每次呼叫預設建立獨立 registry 及上傳 worker；有資料隔離需求時傳入不同路徑的 repository。上傳 worker 的 provider factory 可替換成 fake，HTTP 整合測試會確認兩個 app 的 notes、上傳歷史及 provider 呼叫相互隔離。傳入 `app_settings` 可隔離設定與身分驗證政策；未注入的持久化 repository 與配額帳本仍可能共用，不能只傳入 settings 就宣稱整個平台已隔離。

`account_state_store` 注入後，HTTP middleware 以 ContextVar 將既有 account helpers、動態 key 驗證與 YTMusic 地區偏好導向該 app 的 repository；同步 endpoint 的 threadpool 會繼承此 context，請求結束或失敗都會還原。工具 startup 也會向該 repository 登錄 key。未注入時保留預設 singleton；手動建立的背景執行緒需明確接收 repository，不能假設會繼承 HTTP context。此橋接保留既有函式契約，後續可逐步改為明確 service dependency。

`session_store` 使用相同 request context 機制，涵蓋登入 callback 建立／輪替 session、身分驗證、服務授權 owner 查詢與登出。兩個 app 即使接收到同一 cookie，也只會讀寫各自 session repository；未注入時仍使用既有 singleton。SessionStore 與 CredentialStore 可用 `encryption_key=` 明確傳入各 app 的加密金鑰；未指定時保留既有設定來源。

所有預設資料路徑統一由 `core/data_paths.py` 解析；`TOOLBOX_DATA_DIR` 未設定時仍使用專案的 `data/`。pytest 的 `conftest.py` 會在應用匯入前配置暫存資料目錄，並禁止第三方網路連線（保留 Windows asyncio 所需的 loopback socket）。預設測試不需要复制整個 repository 才能保護正式資料。

Weverse worker 在首次入列時才建立執行緒。停機先拒絕新工作，最多等待 20 秒；逾時工作標記 `interrupted`，排隊工作取消並清理暫存檔案，執行中工作在下一個 provider 呼叫前停止。晚到的影片 ID 可保留，但不能解除中斷狀態。Python 執行緒不能強制中止已進行的網路 I/O；容器另以 45 秒 grace period 作最後終止界線。重啟只提示確認 YouTube Studio，不會自動重送。

---

## 3. 模組化授權架構 (Decoupled Authentication)

Toolbox 將過去綁定在一起的授權模型徹底解耦為 4 個完全獨立的維度：

1. **控制台身分登入 (Identity)**:
   - 僅請求 `openid`、`email`、`profile`。
   - 用於確認使用者是否在 `ALLOWED_GOOGLE_EMAILS` 白名單內。
   - 支援於頂級系統設定頁 (`/settings/system`) 動態切換「是否允許新增使用者帳號」，並具備管理員防自鎖保護。
2. **Google 試算表授權 (Google Sheets)**:
   - 請求 `spreadsheets.readonly`。
   - 僅在用戶進入試算表相關功能時於設定頁或面板中獨立授權。
3. **Google 雲端硬碟授權 (Google Drive)**:
   - 請求 `drive.readonly`。
   - 僅在上傳 YouTube 影片時於 Drive 上傳頁面獨立授權。
4. **YouTube 頻道授權 (YouTube Data API)**:
   - 請求 `youtube` scope。
   - 獨立支援 Primary 與 Secondary 雙槽位，配備自動切換與配額保護。

> **向下相容性**: 若舊帳號之登入憑證已包含 Sheets 或 Drive 權限，後端依賴注入 (`require_sheets_credentials` / `require_drive_credentials`) 會自動 Fallback，無須強制舊用戶重新登入。

---

## 4. 資料持久化保證 (`/data`)

正式環境部署中，Docker 容器以唯讀根目錄與持久化掛載運行：

```yaml
volumes:
  - ./data:/app/data
```

`/data` 目錄存放以下關鍵狀態（嚴格禁止放入 Git 版本庫）：
- `.secrets.json`: 自動生成的持久化系統金鑰（`SECRET_KEY`、`CREDENTIAL_ENCRYPTION_KEY`）。
- `system_credentials.json`: AES 加密保存的系統 Google OAuth 與 YouTube 槽位 Client 憑證。
- `credentials.json`: AES-256 加密保存的第三方 OAuth Refresh Token。
- `sessions.json`: 伺服器端 Session 紀錄。
- `runtime_config.json`: 非敏感動態執行期設定（含 Google 白名單、YouTube 槽位開關/標籤/配額）。
- `account_state.json`: 用戶 UI 偏好、導覽列摺疊與表格欄位設定。
- `youtube_quota.json`: YouTube API 當日呼叫量雙桶計帳紀錄。
- `youtube_jobs.json`: 背景影片上傳工作的斷點續傳進度狀態。


`credential_store` 注入涵蓋 OAuth callback、服務授權查詢／解除、YouTube 槽位路由、YTMusic 自訂 token 與 Google token refresh 的讀寫。HTTP request context 會傳入 FastAPI 同步 threadpool，並在例外後還原；獨立背景執行緒須明確傳入 repository。未注入時維持既有 singleton 及 JSON 格式。獨立設定與金鑰透過下列組裝方式注入；未指定的 repository 仍可能使用預設路徑。


`Settings(runtime_store=RuntimeConfig(...), secrets_store=SystemSecretsManager(...))` 使用指定 repository 讀取動態設定、系統 OAuth 憑證、初次設定狀態與主金鑰。RuntimeConfig 綁定該 Settings，避免直接寫入 repository 時通知其他 app。`create_app(app_settings=config)` 將設定套用於 HTTP context、lifespan、CORS／TrustedHost、來源保護、OAuth URL／簽章／cookie、登入白名單與健康資訊。同步 endpoint 繼承 context，例外後會還原；手動背景執行緒應明確取得設定或使用 `settings_context(config)`。

```python
from backend.app.core.config import Settings
from backend.app.core.credential_store import CredentialStore
from backend.app.core.runtime_config import RuntimeConfig
from backend.app.core.session_store import SessionStore
from backend.app.core.system_secrets import SystemSecretsManager
from backend.app.main import create_app

config = Settings(
    runtime_store=RuntimeConfig(data_dir / "runtime_config.json"),
    secrets_store=SystemSecretsManager(data_dir),
)
application = create_app(
    app_settings=config,
    session_store=SessionStore(
        data_dir / "sessions.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY
    ),
    credential_store=CredentialStore(
        data_dir / "credential_store.json", encryption_key=config.CREDENTIAL_ENCRYPTION_KEY
    ),
    # 需要完整資料隔離時，也須注入其餘各 repository 與 worker。
)
```

OAuth provider URL 固定使用 HTTPS；本機 HTTP callback 的授權 URL 產生不需要修改程序的 `OAUTHLIB_INSECURE_TRANSPORT`。未使用真實 provider 驗收 token exchange。預設模組 singleton 仍於 import 時建構，全面延後初始化仍是後續工作。

`create_app(google_client_factory=...)` 可指定符合 `(service, version, *, credentials)` 的 discovery client 建構器，套用於 HTTP／lifespan 中的 Sheets、YouTube 查詢及 OAuth profile／channel 查詢。預設仍使用 Google discovery.build；每次傳入目前請求的 credentials，不快取不同使用者的 client。Context 在例外後還原，並行 app 不共用 factory。自行建立的背景執行緒不自動繼承此 scope；Weverse 上傳仍使用 UploadWorker 的顯式 provider 注入。OAuth token exchange／refresh transport 尚未納入此建構器。

`create_app(ytmusic_client_factory=...)` 接受與 YTMusic 相容的 keyword arguments（`language`、`location`，有瀏覽器 Token 時含 `auth`），同時涵蓋一般查詢與線上 Token 驗證。同步 endpoint 與 Starlette `run_in_threadpool` 繼承此 context；每次操作重新建構 client，不共用認證狀態。Token 解析仍為純函式，既有自訂 Token 優先與公開查詢 fallback 策略維持相容。


`youtube_quota_trackers` 接受含 `primary`、`secondary` 的 YouTubeQuotaLimiter mapping；factory 拒絕缺少槽位或 key 與 ledger.slot 不一致的組裝。每個 ledger 使用獨立檔案路徑；可透過 `runtime_store=` 綁定其 app 的 RuntimeConfig，讓背景呼叫也使用正確配額政策。HTTP 的 OAuth／YouTube service helpers 經 context 取得對應帳本，未注入則保留預設帳本。每個 app 預設建立獨立 SlidingWindowLimiter，亦可注入 `request_limiter`；API 與 workflow 限制分桶，回應仍為含 Retry-After 的標準 429。此限制仍為程序內狀態，並未增加跨程序分散式限流保證。

SessionStore 與 CredentialStore 在首次使用時才載入 JSON，受各自的 RLock 保護。只有檔案不存在視為空資料；無法讀取或 JSON／頂層結構損毀時拒絕繼續寫入，保留原檔供修復。寫入失敗使快取失效，下次操作重讀持久化狀態。這些 store 仍是程序內快取，沒有增加多程序 read-modify-write 交易保證。

RuntimeConfig 同樣採首次存取載入；寫入失敗回復已保存的快取並拋出例外。SystemSecretsManager 對持久化／解密錯誤採明確失敗，Setup PIN 只在寫入成功後快取。設定 HTTP endpoint 使用既有標準錯誤回應，不將儲存失敗回報為成功；setup 的多檔案步驟仍非跨檔案交易。

前端樣式由 `styles/tokens.css`、`styles/foundation.css`、`app/shell.css`、shared UI 與各 feature 管理。舊 `index.css`／`styles/app-theme.css` 已移除；新增頁面不得重建全域覆寫檔。桌面側欄收合與手機 drawer 使用不同響應式規則，drawer 開啟時位於遮罩上方並維持鍵盤焦點循環。
