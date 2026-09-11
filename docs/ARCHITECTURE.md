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
- **憑證保險庫 (`credential_store.py`)**: 採用 AES-256 加密保存 OAuth Refresh Token，持久化於 `/data/credentials.json`。
- **非 Secret 執行期配置 (`runtime_config.py`)**: 保存於 `/data/runtime_config.json`，支援動態變更且優先於 `.env`。
- **請求保護 (`request_protection.py`)**: 內建 Origin / Referer 檢查與防刷 Rate Limiter。
- **錯誤契約 (`error_contract.py`)**: 統一標準化 `{ code, message, retryable, field_errors }` 錯誤回應格式。

### 1.2 外掛與註冊中心 (Tool Plugins - `backend/app/tools/`)
- **`base.py`**:
  - `ToolMetadata`: 定義工具的識別碼 (`id`)、名稱 (`name` / `title`)、圖示 (`icon`)、分類 (`category`)、入口與子路由清單 (`routes`)，以及所需 OAuth Scopes。
  - `ToolPlugin`: 抽象基礎類別，支援宣告 `metadata`、`router`、`on_startup` 與 `on_shutdown` 生命週期勾子。
- **`registry.py`**:
  - `ToolRegistry`: 集中管理所有已安裝工具，負責自動掛載路由、統一執行生命週期勾子（如背景上傳 Worker）與健康度彙整。
- **`builtin/`**:
  - `creator_tools.py`: 創作者工具模組（封裝 YouTube、Google Sheets、Google Drive 批次上傳）。
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

### 步驟 3：在前端註冊工具導覽與路由

在 `frontend/src/tools/catalog.js` 中新增工具條目：

```javascript
{
  id: 'my-tool',
  name: 'My Tool',
  title: '我的新工具',
  description: '說明本工具的用途與功能...',
  category: '實用工具',
  icon: Wrench,
  badge: '新功能',
  status: 'active',
  entryUrl: '/my-tool',
  navItems: [
    { id: 'my_tool_home', to: '/my-tool', label: '工具首頁', icon: Wrench },
  ],
  featureCards: [
    {
      id: 'my_tool_card',
      title: '我的新工具',
      description: '點擊立即使用新工具功能。',
      to: '/my-tool',
      actionLabel: '進入工具',
      icon: Wrench,
      colorTheme: 'accent',
    },
  ],
}
```

在 `frontend/src/routes/AppRoutes.jsx` 中掛載前端頁面元件即可。導覽列 (`Navbar`) 與儀表板 (`DashboardPage`) 將會自動感應用戶介面。

---

## 3. 模組化授權架構 (Decoupled Authentication)

Toolbox 將過去綁定在一起的授權模型徹底解耦為 4 個完全獨立的維度：

1. **控制台身分登入 (Identity)**:
   - 僅請求 `openid`、`email`、`profile`。
   - 用於確認使用者是否在 `ALLOWED_GOOGLE_EMAILS` 白名單內。
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
- `credentials.json`: AES-256 加密保存的第三方 OAuth Refresh Token。
- `sessions.json`: 伺服器端 Session 紀錄。
- `runtime_config.json`: 非敏感動態執行期設定。
- `account_state.json`: 用戶 UI 偏好、導覽列摺疊與表格欄位設定。
- `youtube_quota.json`: YouTube API 當日呼叫量雙桶計帳紀錄。
- `youtube_jobs.json`: 背景影片上傳工作的斷點續傳進度狀態。
