# Toolbox 重構計劃

稽核日期：2026-09-24。基準 commit：`edd1495`。

本計劃以現有程式碼、設定與測試結果為依據，目標為行為正確、程式風格一致、視覺一致，以及可持續擴充。第 1 節記錄初始稽核；實作狀態與驗證數據會在「實作進度」更新。

「沒有錯誤」應落實為可重現的測試、明確的錯誤處理、關鍵流程驗收與可回退發布；測試全綠不能證明不存在所有錯誤。

## 實作進度（2026-09-24）

本分支已完成可靠性修正、五個主要前端工作流程的邏輯抽離、YouTube 批次使用案例服務、第一批共用 UI 與前端品質門檻。以下只將有程式碼及測試證據的工作列為完成；整份路線圖仍有明確未完成項目。

最新本機驗證：前端 62 個 Vitest 檔案、301 項通過；ESLint、TypeScript `typecheck`、Stylelint、Prettier 檢查與 production build 通過。後端隔離副本 226 項 pytest 通過，Ruff lint／format 通過；新工具目錄契約、Weverse interrupted 工作對帳、多程序更新及 YouTube workflow FastAPI dependency 注入測試亦通過。Playwright 在本機 Edge 上於 390／768／1440 px 完成版面溢位斷言並生成截圖，`npm run test:e2e -- --workers=1` 正常結束（1 項通過）。CI 會安裝 Chromium 執行相同測試，但此環境尚未執行 GitHub Actions。環境未安裝 Docker／actionlint；未使用真實 Google／YouTube 帳號驗收。

已完成：

- YTMusic token 字串解析改為純函式；離線測試會阻止解析時建立 client。Weverse 儲存失敗、損毀 JSON、先保存後入列、入列失敗、關閉時排空及重新啟動時標記未完成工作均有明確錯誤處理及測試。JSON read-modify-write 以穩定 sidecar lock 在本機檔案系統序列化；新增獨立程序同時建立任務、驗證不遺失更新的測試。
- Plugin 啟動失敗反映在工具健康與 API readiness；Weverse executor 延遲建立並納入停機生命週期。重啟時將 pending／上傳中工作標示 interrupted 並提示先查 YouTube Studio，不自動重送。
- `youtube.py` 的批次預覽、批次 metadata 更新及發布清理協調移至 `YoutubeWorkflowService`，保留 router 與既有 API 契約。
- YouTube 批次 workflow service 改由 FastAPI dependency 提供，允許 endpoint 層替換 service，並以 HTTP 測試驗證 override 能確實注入；目前 adapter 仍從 router 模組組裝，settings、repository 與 provider client 的 app factory 注入仍待完成。
- Playlist Sort、Weverse 上傳、FFmpeg 影片與命令流程、Photo Curator 分配／匯出、Batch Update 的狀態與使用案例邏輯抽至 feature hook；Weverse hook 已移入 feature 目錄，Weverse 與 YouTube Batch 增加 feature API 邊界，Playlist Sort 保留型別化 API。Weverse 歷史及既有 batch 預覽內容使用獨立元件。既有頁面互動測試維持通過。
- Dashboard、系統資訊、系統設定與便利貼頁開始採用共用 PageHeader、Button、Badge、EmptyState 與 LoadingState；新增可存取元件狀態展示頁。根 token／基礎樣式已集中，新增 Prettier、ESLint 未使用變數與 Hooks 錯誤門檻、Stylelint 及漸進 TypeScript 檢查。
- 各工具的前端 manifest 已拆到 feature 目錄，彙整工具 metadata、導覽、dashboard cards 與受保護 routes；catalog 啟動時拒絕重複 ID／路由及不在 PATHS 的 destination，AppRoutes 由 registry 組裝 feature routes。
- Playwright 增加 390／768／1440 px 展示頁溢位與截圖測試。前後端工具 ID 與路由契約測試發現並修正 `youtube-integrations`／`integrations-quota` 漂移。
- 發布 workflow 只會發布已通過驗證的同一個 main SHA；README 的支援平台與前端路徑已修正。

尚待完成：

- 共用 UI 尚未逐頁遷移；大量舊 CSS 與固定 inline layout 仍保留。Stylelint 對 `.stylelintignore` 列出的既有全域樣式設有過渡例外，需以逐檔遷移方式移除。
- Feature hook 已從頁面抽離，但其他 feature 的 API/model 邊界及較完整的 TS 型別尚未完成；E2E 目前只涵蓋共用元件展示頁，沒有完整驗證排序、OAuth、批次更新、Weverse 上傳及媒體匯出的瀏覽器流程。
- YouTube service 已由 FastAPI dependency 注入，但 adapter 仍由 router 模組函式組裝；settings、repository 與外部 client 的 app factory/dependency 注入尚未完成。
- Weverse sidecar lock 只承諾在支援作業系統檔案鎖定語意的本機檔案系統上協調合作程序；NFS／網路檔案系統或跨主機多實例仍需驗證鎖語意，或改採資料庫／外部鎖服務。沒有真實 provider smoke test，也未演練 Docker 部署回退。
- `npm install` 顯示 9 項安全公告；本機 npm audit registry 請求逾時，尚未取得可驗證的 advisory 清單，因此沒有執行盲目升級或宣稱已修復。

本輪驗收不代表不存在所有錯誤，也不代表已完成第 2、4、5 階段全部停止條件；應依本節未完成項目繼續分階段交付。

## 1. 已驗證的基準

| 檢查 | 結果 | 解讀 |
| --- | --- | --- |
| 前端 ESLint | 通過 | 尚未限制未使用變數；Hooks 相依檢查僅為 warning |
| 前端 Vitest | 56 個測試檔、281 項通過 | 存在 React `act(...)` 與 jsdom navigation 警告，應修正測試等待及瀏覽器邊界模擬 |
| 前端 production build | 通過 | CSS 99.06 kB／gzip 18.06 kB；主入口 JS 256.83 kB／gzip 81.60 kB，不含其他分塊 |
| Ruff format / check | 91 個檔案格式通過；lint 通過 | Python 已有可沿用的格式基準 |
| 後端 pytest | 207 項通過、8 項失敗 | 8 項皆在 YouTube Music token 解析相關測試觸發外部連線，受到目前網路限制而失敗 |

測試環境：Windows、Python 3.12.10、Node 22.18.0；目前 CI 使用 Python 3.11、Node 20，因此本機結果不能取代 CI。後端在 HEAD 的獨立暫存副本執行，避免測試接觸工作目錄的實際 `data/`。首次執行有 pytest 共用暫存目錄權限問題，改用獨立 `--basetemp` 後已排除；表格採用排除後的結果。

本次未執行 Docker 建置、正式 Google／YouTube 操作、瀏覽器端到端操作或畫面截圖比對。視覺問題是依樣式來源判斷的維護風險，尚未宣稱已完成所有頁面的視覺驗收。

## 2. 問題與優先順序

| 優先級 | 證據 | 問題與影響 |
| --- | --- | --- |
| P0 | `backend/app/core/weverse_upload_store.py` 的 `_save_all()` 捕捉例外後僅記錄日誌；`create_task()` 繼續回傳 task | 持久化失敗可能被當作成功；應在啟動外部上傳前確認工作已可靠保存 |
| P0 | `backend/app/services/ytmusic_service.py:271` 於 token 解析時建立 `YTMusic`；相關測試沒有完整隔離網路 | 本機／離線／CI 的結果可能依賴外部服務，無法提供可靠的重構保護 |
| P1 | `frontend/src/main.jsx` 依序載入 `index.css`、工具 CSS、`flat-theme.css`；前兩份主樣式分別為 4,683、1,600 行 | token、按鈕、卡片等重複定義，呈現結果依賴載入順序，修改容易波及其他工具 |
| P1 | `WeverseUploaderPage.jsx` 有大量固定 inline layout；README 仍以 Glassmorphism 描述元件，而 `flat-theme.css` 宣告簡約風格 | 共用視覺語言與實作分散，新增頁面容易各自發展 |
| P1 | `PlaylistSortPage.jsx` 1,247 行、`FfmpegGeneratorPage.jsx` 1,119 行、`WeverseUploaderPage.jsx` 1,095 行 | 畫面、狀態、資料處理與非同步流程集中；行數是拆分檢視訊號，不是缺陷本身 |
| P1 | `backend/app/api/youtube.py` 1,093 行，包含配額切換、預覽驗證、批次更新與發布流程 | HTTP 與業務協調耦合，難以獨立驗證部分失敗與重試行為 |
| P1 | `ToolRegistry.run_startup()` 捕捉啟動失敗；預設 plugin health 仍回報 ok | 啟動失敗與健康狀態可能不一致，需明確定義平台與工具的 readiness |
| P1 | Weverse executor 在模組載入時建立，plugin 未覆寫生命週期 hook | 停機排空、重啟後工作狀態與重試策略需要明確契約 |
| P1 | 前端 `tools/catalog.js`、`routes/paths.js`、`AppRoutes.jsx` 與後端 plugin metadata 分別維護 | 工具 ID、入口、啟用狀態及導覽容易漂移；現有測試主要驗證各自內容 |
| P1 | `.github/workflows/publish-container.yml` 在 main push 直接發布；檔案內未串接測試工作 | 需確認發布 SHA 已通過完整檢查；未查閱 GitHub 分支保護設定，不能斷言線上沒有保護 |
| P2 | `.eslintrc.cjs` 關閉 `no-unused-vars`、`react/prop-types`；前端未配置型別檢查、格式器、視覺回歸 | JS 資料契約與風格約束不足；逐步補強，避免一次全面改寫 |
| P2 | README 描述 multi-arch，但發布設定僅 `linux/amd64`；README 列出的 uploads 路徑未見於目前 AppRoutes | 文件與功能演進不同步，新開發者難判斷正確入口與支援範圍 |

## 3. 設計方向

保留 FastAPI + React/Vite、既有 ToolRegistry、錯誤契約、OAuth 隔離與配額機制。採取逐模組替換，每一步都維持既有 URL、API 語意與使用者資料相容。

### 3.1 前端責任分層

建議逐步收斂為以下結構；由正在修改的功能開始搬移，避免僅為整齊而大規模移動檔案。

```text
frontend/src/
  app/                       # 啟動、providers、shell、route 組裝
  shared/
    ui/                      # Button、Field、Card、Dialog、Status 等
    api/                     # request、ApiError、產生的 API 型別
    styles/                  # tokens、base、layout、共用元件樣式
    utils/                   # 無特定領域依賴的純函式
  features/
    youtube/                 # pages、components、hooks、api、model、tests
    ytmusic/
    weverse/
    sheets/
    photo-curator/
    ffmpeg/
    notes/
    settings/
  tools/                     # manifest 彙整與工具註冊
```

- Page 負責組合畫面；hook／reducer 管理流程狀態；純函式處理排序、驗證、命令生成；feature API 包裝端點。
- 保留已拆出的 `playlist-sort`、`batch`、`youtube`、`curator` 元件，逐步整理歸屬，不重新實作已正常運作的功能。
- 共用 `request` 專注 HTTP、timeout、取消、錯誤正規化與 session 通知。YouTube 欄位正規化及槽位資料轉換移回 feature 層。
- 跨頁的登入、設定與工作狀態用範圍明確的 provider／hook 暴露；表單草稿、選取與暫存排序保留在 feature，避免把所有 state 放入全域。
- 新的多步驟流程明確區分 idle、loading、preview、submitting、partial、success、error；重用既有 reducer/hook 即可，不先增加狀態管理套件。
- 先替 API 契約、tool manifest 與純函式加入 TypeScript，再逐步遷移複雜 feature；相容既有 JSX。型別生成以後端明確的 request/response schema 為前提，不能取代執行期驗證。
- feature 透過公開入口依賴其他 feature，禁止直接存取其他 feature 的內部元件／store。

### 3.2 前端美術與互動規範

先以目前 `flat-theme.css` 的「深灰底、靛紫主色、低對比邊框、節制陰影」作為建議基準，再用元件展示頁與代表頁截圖確認細節。重構初期維持已核定外觀，視覺調整另列可比對的變更。

| 項目 | 統一規則 |
| --- | --- |
| 色彩 | 單一語意 token 來源：canvas、surface、text、border、primary、success、warning、danger；工具特色色僅用於內容標示 |
| 字體 | 統一中英文字體堆疊、標題層級、內文與輔助文字尺寸、字重及行高 |
| 間距 | 使用 4／8／12／16／24／32／48 px 間距尺度，集中頁面留白、表單列距、區塊間距 |
| 形狀 | 明確定義輸入框、按鈕、卡片、dialog 的圓角與陰影；沿用目前合理數值並移除重複來源 |
| 圖示 | 統一 Lucide、尺寸與 stroke 規則；圖示按鈕必須有可存取名稱 |
| 元件 | Button、IconButton、Field、Select、Textarea、Card、PageHeader、Toolbar、Badge、EmptyState、LoadingState；沿用現有 Dialog、ConfirmDialog、Toast、StatusMessage |
| 狀態 | hover、focus、active、disabled、loading、error 都有一致規格；錯誤不只依靠顏色傳達 |
| 響應式 | 至少驗收 390、768、1440 px；密集表格可以在容器內橫向捲動，頁面本身不得溢出 |
| 鍵盤操作 | focus 可見、dialog 焦點鎖定與還原、Escape 行為、欄位 label、錯誤提示位置一致 |

執行順序：先抽 tokens → 共用元件 → 頁面版型 → 逐頁替換 → 刪除對應舊規則。過渡期間保留明確的 legacy 樣式區，最終移除整份 `flat-theme.css` 疊加覆寫入口；不要同時保留兩套權威 token。

功能樣式使用 CSS Modules 或明確命名空間隔離。固定布局 inline style 改為類別；FFmpeg 時間軸位置、進度寬度等依資料計算的 inline style 可保留。暫不需要更換 CSS 框架。

### 3.3 後端責任分層與持久化

- router：HTTP request/response schema、身份與權限 dependency、狀態碼及錯誤映射。
- application service：預覽驗證、批次更新、發布清理、配額切換等使用案例協調。
- domain：排序規則、配額政策、輸入與狀態驗證等可獨立測試的規則。
- adapter／repository：Google、YouTube、YTMusic、檔案系統與持久化存取。

優先拆解 `youtube.py` 的預覽、metadata batch、publish cleanup 三條使用案例，保留對外 API。通用元件放 core；YouTube／Weverse 專用規則逐步歸回工具領域，避免 core 成為所有邏輯的集中區。

Weverse 儲存層改用既有 `atomic_write_json`，寫入失敗須拋出可識別錯誤；不能以 log 取代失敗訊號。讀取損毀檔案需回報錯誤並保留原檔，避免把損毀資料當空白後覆寫。注意：原子替換只保證檔案替換完整性，不能保證多程序 read-modify-write 不遺失更新。

透過 app factory／dependency 注入 settings、repository 與外部 client，將存檔、產生金鑰、建立 executor 等副作用由 import 時機移至明確啟動流程。所有測試以隔離的暫存儲存執行。

初期保留 JSON 格式與既有部署方式；在支援多 worker／多實例之前，須先選定程序間交易機制。若採 SQLite，另立 schema 版本、一次性匯入、備份、相容期與回退方案，不能只換儲存實作就宣布支援多實例。

### 3.4 工具註冊與背景工作

- 後端 metadata 作為工具 ID、啟用狀態、入口與能力需求的權威來源；前端保留受控的 component/icon 對應與呈現設定。
- 每個前端 feature 提供 manifest，集中彙整 routes、nav 與 dashboard cards，避免分別手工增補；拒絕未知 ID 與重複路由。
- 以契約測試檢查後端 catalog 的入口對應前端 route；驗證 disabled 工具、缺少能力及不支援版本的呈現與 API 行為。
- 實際權限始終由 API 執行，不能只用導覽隱藏代替授權檢查。
- 明確區分 startup failed、disabled、ready、degraded；registry 啟動失敗必須反映於健康資訊，必要工具失敗使整體 readiness 失敗。
- 將 Weverse executor 納入 startup/shutdown，定義停止接單、排空期限與未完成工作的保存方式。
- 上傳狀態至少區分 queued、running、succeeded、partial、failed、interrupted。重啟後先對帳；無法確認外部操作結果時，要求確認後續處理，不能盲目重送並造成重複影片。
- 工作先成功持久化才接受入列；測試入列失敗、停機、取消與逾時，不在純重構 PR 增加未經驗證的自動重試。

## 4. 分階段交付與驗收

每列可再拆成數個小 PR；單一 PR 只處理一種責任或一條功能流程。通用規範與型別逐步推進，不一次改動所有 feature。

| 階段 | 交付內容 | 驗收與停止條件 |
| --- | --- | --- |
| 0：可靠基準 | 修正 8 項測試的網路隔離；分開純 token 解析與線上驗證；清除前端測試警告；提供隔離測試環境；記錄關鍵頁面截圖 | 預設測試不需外部憑證、不連線第三方、不讀寫實際 data；完整 suite 全綠；故障可穩定重現 |
| 1：資料正確性 | Weverse 寫入／讀取錯誤契約、原子寫入、入列順序；重要故障測試；建立同 SHA 的測試到發布流程 | 模擬磁碟不可寫、損毀 JSON、入列失敗時不得假成功或啟動未追蹤的上傳；發布只能使用通過檢查的 SHA |
| 2：設計系統 | tokens、元件展示頁、基礎 UI 與頁面版型；先遷移 Dashboard、設定頁，再至複雜工具 | 三種視窗寬度與元件狀態驗收；舊畫面與新畫面差異可解釋；同類元件使用共用實作 |
| 3：前端 feature 拆分 | 先 PlaylistSort，再 Weverse、FFmpeg、PhotoCurator、BatchUpdate；分離 hooks/reducer、API 與純函式；漸進型別檢查 | 每個 feature 遷移後單元／互動／端到端測試通過；取消、重新進入頁面、重複點擊與部分失敗行為一致 |
| 4：後端使用案例與生命週期 | YouTube 使用案例服務、client/repository 注入；plugin readiness、worker 停機及中斷工作對帳 | 舊 API 契約保持相容；重啟、權限、配額切換與部分完成測試通過；不能重複執行不可逆操作 |
| 5：擴充契約與收尾 | feature manifest、catalog 契約測試、全面清理 legacy CSS、更新新工具範例與部署文件 | 新增示範工具只需 feature、manifest 與後端 plugin 註冊；無須修改共用元件／核心業務邏輯；舊網址相容 |

依賴順序：0 → 1；2 在 0 完成後可開始；3 依賴對應的共用 UI 與基準；4 依賴 0、1；5 在各模組遷移完成後收尾。

## 5. 品質門檻

### 程式風格

- 前端加入單一 formatter 設定，初始值沿用現有多數檔案慣例；純格式化獨立 PR。
- 逐批清除未使用變數，啟用 `no-unused-vars`；Hooks 相依警告修正後提高至 error；CI lint 不接受未處理的新警告。
- 新增 CSS lint，限制重複 token、頁面全域 selector 與無理由的 `!important`；過渡例外須有刪除條件。
- Python 繼續使用 Ruff；為新 service/repository 介面補充型別與漸進型別檢查，先以變更範圍為門檻。
- 命名統一：JS/TS camelCase、React 元件 PascalCase、Python snake_case；API JSON 明確維持既有契約，避免為改名破壞相容性。YouTube／Ytmusic 名稱調整獨立處理，注意 Windows 大小寫路徑。

### 測試矩陣

| 層級 | 必須涵蓋 |
| --- | --- |
| 純邏輯 | playlist 排序、FFmpeg 參數、YouTube 輸入、配額邊界、token 格式解析、工作狀態轉移 |
| 儲存與 API | 使用者隔離、寫入失敗、損毀檔案、預覽失效、防髒寫入、401/403/422/429、錯誤欄位、配額切槽與部分成功 |
| UI 互動 | 表單驗證、loading/empty/error、重試、取消、晚到的舊回應、頁面切換清理、避免重複送出 |
| 端到端 | 登入與 OAuth 回跳、直接開深層 URL、設定儲存、草稿預覽到提交、發布清理、排序套用、上傳任務狀態、照片匯出及命令生成 |
| 視覺與可存取性 | 登入／setup、dashboard、設定、密集表格、dialog、media 工作台；390/768/1440 px；鍵盤、長文字、錯誤與載入狀態 |
| 部署與恢復 | SPA fallback 與 API 404、靜態資產快取、健康資訊、舊 data 升級讀取、worker 中斷與回復 |

使用瀏覽器自動化加入端到端及視覺截圖基準，固定資料、字型、時間及動畫，避免隨機差異。涉及真實 Google／YouTube 的 smoke test 應獨立且明確啟用，使用專用測試帳號；預設 CI 使用 provider fake，不執行真實發布或清理。

先量測覆蓋率再設定門檻；重構範圍的覆蓋不得下降，關鍵錯誤分支必須有測試。不要用單一全專案百分比或行數上限代替行為驗證。

### 效能與發布

- 將本次 build 數據當作暫時基準；新增 lazy loading 需確認首次載入、切頁載入與 chunk 載入失敗的回復行為。
- 不接受無說明的入口 JS／CSS 成長；CSS 去重與分頁載入後再制定長期預算。
- CI 至少包含 format、lint、typecheck、unit/API、build、瀏覽器回歸與容器檢查。發布 job 明確依賴相同 SHA 的檢查結果，並包含 workflow 本身的變動檢查。
- 分支保護／required checks 需於實施時確認；不要單憑 repository 內 workflow 推定已啟用。

## 6. 相容、資料遷移與回退

每個 PR 附上問題、行為不變條件、測試證據、畫面差異與回退方式。API/URL、localStorage key、account work state、持久化 JSON 欄位變動必須列出相容策略。

純結構與 CSS 遷移可回退該 PR；不要將資料格式升級與頁面拆分放在同一 PR。持久化格式變更先備份，加入 schema version、舊版 reader 與獨立升級工具，在資料副本演練；回退時須說明新版本產生的資料能否被舊程式讀取，不能只還原映像。

保留目前單體部署方式。資料庫、外部工作佇列、多實例或大版本依賴升級，待有容量與部署需求時另立決策及驗證，不作為完成本次重構的前提。

第一個實作批次建議聚焦階段 0 與 Weverse 持久化錯誤：先讓「測試通過」與「操作成功」可信，再逐頁推進設計系統與模組拆分。
