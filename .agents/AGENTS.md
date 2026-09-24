# Toolbox 開發規範

Toolbox 是一個高擴充性的多功能模組化工具箱平台，採用 FastAPI (Python 3.11+)、React 18 / Vite 與 Docker 容器化技術構建。系統核心架構遵循 **「平台核心 (Platform Core) + 工具外掛 (Tool Plugins)」** 解耦設計，內建模組涵蓋 YouTube 創作者工作流、YouTube Music 音樂庫排序、Google 試算表工具、便利貼備忘錄、Instagram 排版工作台與系統維運控管。

---

## 1. 架構與安全規範

- **網路與位址配置**：OAuth bind 位址使用 `BIND_HOST`／`PORT`；callback URL 使用 `PUBLIC_BASE_URL`／`FRONTEND_URL`。
- **白名單保護**：正式環境必須設定 `ALLOWED_GOOGLE_EMAILS`。
- **金鑰與憑證管理**：Google Client ID、Client Secret、各類 API Token 與加密密鑰一律由後端安全保存，嚴禁傳送至前端或寫入 Git 版本庫。
- **配置持久化與動態同步**：
  - 非 secret 執行期設定保存於 `data/runtime_config.json`，優先級高於 `.env` 預設值。
  - `data/` 目錄在容器中必須掛載持久化磁碟（包含加密憑證、Session、配額帳本、工作台狀態與工具資料庫）。
- **模組化解耦授權**：
  - 控制台登入限縮為純身分認證（`openid`, `userinfo.email`, `userinfo.profile`）。
  - 第三方服務（Google 試算表 `spreadsheets.readonly`、Google 雲端硬碟 `drive.readonly`、YouTube 創作者頻道 `youtube`、YouTube Music 個人音樂庫 `youtube`）採獨立解耦授權。
  - FastAPI 認證依賴注入分別使用：
    - `require_login_credentials`：控制台身分登入驗證。
    - `require_account_subject`：解析登入帳號唯一 ID (OIDC `sub`)，用於多用戶資料隔離。
    - `require_sheets_credentials`：試算表讀取權限（具備 legacy 憑證自動 fallback 相容）。
    - `require_drive_credentials`：雲端硬碟讀取權限（具備 legacy 憑證自動 fallback 相容）。
    - `require_youtube_context`：YouTube 創作者頻道操作與配額槽位選擇。
    - `require_ytmusic_context`：YouTube Music 專屬音樂授權（具備 YouTube 頻道與 legacy 憑證自動 fallback 相容）。
- **日誌與錯誤標準化**：
  - 正式程式一律使用標準庫 `logging`，嚴格禁止使用 `print()`。
  - 後端 API 錯誤一律使用 `backend.app.core.error_contract.http_error(status_code, code, message)` 拋出，確保前端接收標準格式 `{ "detail": { "code", "message", "retryable", "field_errors" } }`。
- **請求保護**：所有 `/api/v1` 路由已由中介層／依賴注入自動套用同源檢查 (`require_same_origin`) 與頻率限制 (`enforce_api_rate_limit`)。

---

## 2. 撰寫新工具的方法 (How to Develop a New Tool)

在 Toolbox 平台開發一個新工具模組，需遵循「全端自包含外掛」架構，完整流程包含後端外掛宣告、路由自動掛載、資料持久化、前端路徑與模組目錄登記、UI 頁面開發、側邊導覽選單（目錄）註冊與全端測試。

### 步驟 1：建立後端外掛模組 (`ToolPlugin`)

在 `backend/app/tools/builtin/<tool_name>.py`（或 `backend/app/tools/<tool_name>/`）建立外掛檔案：

1. **繼承抽象類別 `ToolPlugin`**（來自 `backend.app.tools.base`）。
2. **宣告元數據 `ToolMetadata`**：
   - `id`：工具唯一英文識別碼（如 `my-tool`）。
   - `name`：英文名稱（如 `My Tool`）。
   - `title`：中文本地化名稱（如 `我的新工具`）。
   - `description`：工具功能簡述。
   - `category`：分類（如 `日常生產力`、`影音創作`、`資料處理`、`實用工具`）。
   - `icon`：Lucide 圖示名稱字串（如 `Wrench`、`StickyNote`）。
   - `version`：版號（如 `1.0.0`）。
   - `status`：狀態（`active`、`beta`、`disabled`）。
   - `entry_url`：前端主入口路徑（如 `/my-tool`）。
   - `routes`：子路由列表 `[ToolRoute(path="/my-tool", label="工具首頁", description="...")]`。
   - `required_scopes`：若需第三方 OAuth 權限則填寫對應 scope 名稱，無則為空清單 `[]`。
3. **實作 `APIRouter`**：
   - 建立 `router = APIRouter(prefix="/<tool-prefix>", tags=["..."])`。
   - 端點參數使用 Pydantic `BaseModel` 定義請求與回應模型。
   - 使用 `Depends(require_account_subject)` 取得當前使用者身分以隔離資料；若需要特定 API 憑證則注入對應依賴（如 `require_sheets_credentials`）。
   - 異常處理一律使用 `raise http_error(status_code, code, message)`。
4. **生命週期勾子（可選）**：
   - 若工具需背景初始化或排程資源，可覆寫 `async def on_startup(self, app: FastAPI)` 與 `async def on_shutdown(self, app: FastAPI)`。
   - 若需提供健康度檢測，可覆寫 `def health_check(self) -> Dict[str, Any]`。

```python
# 範本：backend/app/tools/builtin/my_tool.py
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from backend.app.core.dependencies import require_account_subject
from backend.app.core.error_contract import http_error
from backend.app.tools.base import ToolMetadata, ToolPlugin, ToolRoute

router = APIRouter(prefix="/my-tool", tags=["My Tool"])

class ActionRequest(BaseModel):
    text: str = Field(default="", max_length=1000)

@router.get("/data")
def get_data(subject: str = Depends(require_account_subject)) -> Dict[str, Any]:
    return {"status": "ok", "items": []}

@router.post("/action")
def run_action(payload: ActionRequest, subject: str = Depends(require_account_subject)) -> Dict[str, Any]:
    if not payload.text:
        raise http_error(400, "empty_text", "輸入內容不得為空。")
    return {"status": "success", "result": payload.text}

class MyToolPlugin(ToolPlugin):
    def __init__(self) -> None:
        self._metadata = ToolMetadata(
            id="my-tool",
            name="My Tool",
            title="我的新工具",
            description="用於說明新工具用途的簡要描述。",
            category="日常生產力",
            icon="Wrench",
            version="1.0.0",
            status="active",
            entry_url="/my-tool",
            routes=[
                ToolRoute(path="/my-tool", label="工具首頁", description="功能主頁面"),
            ],
            required_scopes=[],
        )
        self._router = router

    @property
    def metadata(self) -> ToolMetadata:
        return self._metadata

    @property
    def router(self) -> Optional[APIRouter]:
        return self._router
```

### 步驟 2：註冊後端外掛

在 `backend/app/tools/builtin/__init__.py` 中匯入並加入 `register_builtin_tools()`：

```python
from backend.app.tools.builtin.my_tool import MyToolPlugin
# ...
plugins = [
    # ...現有外掛
    MyToolPlugin,
]
```

- **自動掛載機制**：`backend/app/api/router.py` 在初始化時會呼叫 `tool_registry.mount_routers(api_router)`，外掛的 `router` 將自動掛載於 `/api/v1` 下（即 `/api/v1/my-tool/...`），無需手動更動主路由。
- **目錄探索端點**：`/api/v1/tools` 與 `/api/v1/tools/{tool_id}` 將自動包含新工具的元數據與路由清單。

### 步驟 3：資料持久化規範 (若有狀態儲存需求)

- 若新工具需要儲存用戶個人資料或設定，建議在 `backend/app/core/` 建立專屬 Store 類別（參考 `backend/app/core/notes_store.py`）。
- 資料檔案一律儲存於持久化目錄 `data/<tool_name>.json`，嚴禁寫入代碼目錄。
- 頂層結構必須以使用者的 `subject` 作為隔離鍵，確保多用戶間資料互不干擾。
- 檔案讀寫必須注意執行緒安全（使用 `threading.Lock`）與原子寫入。

### 步驟 4：定義前端路徑常數 (`frontend/src/routes/paths.js`)

在 `PATHS` 物件中新增工具主路由：

```javascript
export const PATHS = Object.freeze({
  // ...現有路徑
  myTool: '/my-tool',
});
```

- 若該路徑需支援登入後安全跳轉或 OAuth 授權回跳，需同步登錄至 `STATIC_RETURN_PATHS` 集合中。

### 步驟 5：建立 feature 頁面與 API 邊界

- 新頁面放在 `frontend/src/features/<tool>/pages/`；既有頁面可逐步遷移。
- 使用 `shared/ui` 共用元件、`styles/tokens.css` 語意 token 與 feature CSS，避免固定 inline layout。
- API request／response 型別與包裝器放在 feature 的 `api/`；領域純函式放 `model/`。
- 通知使用 `useToast()`；刪除或高危操作使用共用 `ConfirmDialog`。禁止原生 `alert`、`confirm`、`prompt`。

### 步驟 6：註冊 feature manifest

建立 `frontend/src/features/<tool>/manifest.js`，集中宣告 metadata、`routes`、`navGroups` 及 `featureCards`，在 `tools/catalog.js` 匯入登錄。參照 `docs/ARCHITECTURE.md` 的完整範例。

- ID 與後端 plugin 一致，destination 使用 `PATHS`。
- route 以 `React.lazy()` 載入頁面，必要 props 透過 `getProps` 傳入。
- `AppRoutes`、`Navbar`、Dashboard 自動依 catalog 組裝；新增工具不需要修改這些共用元件。
- 單項目導覽預設為連結，多項目為展開群組；`collapsible: true` 強制群組，`sidebar: false` 留給子導覽。
- 既有群組的展開狀態以 `<groupId>Open` 儲存，維持相容。

### 步驟 7：驗證工具擴充契約

新增工具時補齊 feature API／互動测试，並通過 `catalog.test.js`、`AppRoutes.test.jsx`、`Navbar.test.jsx` 及後端 `test_tool_catalog.py`。導覽、路由和 Dashboard 必須由 manifest 自動呈現，禁止再加入逐工具的共用元件分支。

---

## 3. 前端規範

- **對話框規範**：禁止使用原生瀏覽器警告／確認對話框（`alert`, `confirm`）；統一使用 `useToast()` 與 `ConfirmDialog`。
- **視覺一致性**：使用深灰底、靛紫主色與單一語意 token；優先採用 `shared/ui`，頁面樣式由 feature 管理。
- **授權就地原則**：若工具需使用獨立 OAuth 服務（如 Google Sheets、YouTube 等），必須在該工具的頁面或設定面板中就地提供授權狀態卡片、連線連結與解除按鈕，不得強制要求使用者於全站登入時一次性同意。

---

## 4. 驗證與品質標準

每次完成新工具或代碼修改後，必須執行以下驗證並確保全部通過：

- **後端驗證**：
  ```bash
  python -m ruff check backend
  python -m ruff format --check backend
  python -m pytest backend/tests -q
  ```
- **前端驗證**：
  ```bash
  npm run format:check
  npm run lint
  npm run lint:styles
  npm run typecheck
  npm test -- --run
  npm run build
  ```
- **單元測試規範**：
  - 新增後端工具時，需於 `backend/tests/` 新增 `test_<tool_name>.py` 測試主要路由與例外情境。
  - 新增前端模組時，需確認 `frontend/src/tools/catalog.test.js`、`frontend/src/components/Navbar.test.jsx` 與頁面渲染測試均正常通過。


### 測試資料與視覺驗證

- pytest 會自動設定暫存 `TOOLBOX_DATA_DIR` 並禁止第三方網路；不得移除隔離以讓測試讀取實際 `data/`。
- 新增有狀態的流程時優先使用 `create_app()` 傳入 repository／provider adapter；不要依賴全域 monkeypatch 建立新功能。
- 版面變更執行 `npm run test:e2e`。Windows／Edge 的已審核截圖基準以 `npm run test:visual` 比對；只有確認預期畫面後才用 `--update-snapshots` 更新，不能在 CI 自動接受差異。
