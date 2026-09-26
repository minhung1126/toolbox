# Toolbox 重構計劃

稽核日期：2026-09-24。基準 commit：`edd1495`。

本計劃以現有程式碼、設定與測試結果為依據，目標為行為正確、程式風格一致、視覺一致，以及可持續擴充。第 1 節記錄初始稽核；實作狀態與驗證數據會在「實作進度」更新。

「沒有錯誤」應落實為可重現的測試、明確的錯誤處理、關鍵流程驗收與可回退發布；測試全綠不能證明不存在所有錯誤。

## 實作進度（2026-09-25）

本分支已完成可靠性修正、五個主要前端工作流程的邏輯抽離、YouTube 批次使用案例服務、第一批共用 UI 與前端品質門檻。以下只將有程式碼及測試證據的工作列為完成；整份路線圖仍有明確未完成項目。

最新本機完整驗證：前端 69 個 Vitest 檔案、324 項通過；ESLint、TypeScript `typecheck`、全部 CSS 的 Stylelint、Prettier 檢查與 production build 通過；`npm audit --offline --json` 對目前 lockfile 回報 0 項漏洞。全域 CSS 不再從 Stylelint 忽略；foundation.css 的 reset selector 以單檔規則例外保留通用 reset 所需的 element／universal selector。對原有全域樣式的 330 項 lint 發現先修正可自動等價轉換的色彩語法，再整理重複 selector 與固定 inline heading layout；剩餘頁面樣式仍需逐步歸回 feature。Playwright 使用本機 Edge，共 22 項通過：在 390／768／1440 px 驗證 Dashboard、共用元件展示、登入與初次設定頁、系統設定頁、Quick Token Drawer、YouTube 設定子導覽及九個工具／設定頁版面；provider fake 覆蓋 Weverse 上傳至完成、Google OAuth URL 導向與 Google 帳號設定頁響應式版面、Playlist Sort 新歌單建立、YouTube Batch Update 預覽至執行、Publish Cleaner 預覽至發布完成、Photo Curator ZIP 匯出及 Sticky Notes 自動儲存／置頂／刪除。後端使用內建暫存資料隔離的 232 項 pytest、Ruff lint／format 及 YouTube workflow FastAPI dependency 注入測試通過。GitHub Actions run 15 在 commit `111b1f4` 通過 Python 3.11／Node 20 後端及前端檢查、Chromium E2E、Docker 建置與 Compose 驗證；run 21 在 commit `15860c9`、run 22 在 `4cbaddf`、run 23 在 `2761e6d` 、run 25 在 `3ca7153` 、run 27 在 `4b6da2f` 、run 28 在 `51f5011` 、run 29 在 `cfd1556` 及 run 30 在 `6288a0c` 及 run 32 在 `e75daa6` 均通過同 SHA CI。未安裝 actionlint；未使用真實 Google／YouTube 帳號驗收，也未演練實際部署回退。

已完成：

- YTMusic token 字串解析改為純函式；離線測試會阻止解析時建立 client。Weverse 儲存失敗、損毀 JSON、先保存後入列、入列失敗、關閉時排空及重新啟動時標記未完成工作均有明確錯誤處理及測試。JSON read-modify-write 以穩定 sidecar lock 在本機檔案系統序列化；新增獨立程序同時建立任務、驗證不遺失更新的測試。
- Plugin 啟動失敗反映在工具健康與 API readiness；Weverse executor 延遲建立並納入停機生命週期。重啟時將 pending／上傳中工作標示 interrupted 並提示先查 YouTube Studio，不自動重送。
- `youtube.py` 的批次預覽、批次 metadata 更新及發布清理協調移至 `YoutubeWorkflowService`，保留 router 與既有 API 契約。
- YouTube 批次 workflow service 改由 FastAPI dependency 提供，允許 endpoint 層替換 service，並以 HTTP 測試驗證 override 能確實注入；adapter 組裝及底層依賴已移出 router 至獨立的 `youtube_workflow_dependencies.py`。settings、repository 與 provider client 的 app factory 注入仍待完成。
- Sticky Notes repository 由 FastAPI dependency 提供，可從 `app.state` 替換不同 store；預設檔案延至首次使用才開啟，兩個 app 使用獨立 store 的 HTTP 測試確認資料隔離。其他 settings、repository 與 provider client 的注入仍待推進。
- Playlist Sort、Weverse 上傳、FFmpeg 影片與命令流程、Photo Curator 分配／匯出、Batch Update 的狀態與使用案例邏輯抽至 feature hook；Weverse hook 已移入 feature 目錄，Weverse、YouTube Batch、Sheet Copy、Publish Cleaner、YouTube Settings、Notes、Auth 與 YTMusic Token 有各自 feature API 邊界。Publish Cleaner、YouTube Settings、YouTube Batch、Notes、Login／Setup Auth、YouTube Music OAuth／Token 及 Weverse upload API 已增加 TypeScript request／response 契約並透過包裝器呼叫；Sheet Copy 的 metadata／表格回應也有 TypeScript contract 和執行期格式驗證，格式錯誤會進入頁面既有錯誤處理，不會先寫入畫面狀態。Sticky Notes 已改用 Notes API wrapper。Weverse 歷史及既有 batch 預覽內容使用獨立元件。Weverse 兩個確認對話框修正為共用元件實際支援的 `confirmText` prop；端到端測試由此發現舊 prop 名稱造成的錯誤按鈕文案。
- Photo Curator 匯入修正為先複製瀏覽器的即時 FileList，再清空 file input；原順序會在清空 input 後遺失所選照片，ZIP 匯出 E2E 覆蓋該實際操作流程。YouTube Batch Update 的 hydration effect 現在只會在未完成請求被取消時重試，避免系統設定載入途中錯誤地永久停在未 hydration 狀態，也避免完成 hydration 後因一般狀態更新而重跑並覆蓋使用者輸入；延遲草稿設定回應的瀏覽器測試覆蓋完整預覽及執行。
- Dashboard、系統資訊、系統設定與便利貼頁開始採用共用 PageHeader、Button、Badge、EmptyState 與 LoadingState；新增可存取元件狀態展示頁。Sheet Copy、YouTube 批次更新、Publish Cleaner、Sticky Notes、Photo Curator 與 FFmpeg 的專屬樣式已移入各自 feature；Google Account Settings 的固定 inline 版面改由 settings feature CSS 管理並使用語意色彩 token。批次更新預覽成功狀態的 CSS class 也統一為 kebab-case。Weverse 資料夾選擇、路徑輸入、複查表單、字幕表格、配額資訊、上傳進度及完成畫面版型已移入頁面 CSS，版面改用共用 token；固定 inline layout 已移除，只保留會隨任務更新的進度寬度。多個表單 label 已關聯至輸入欄，進度列具備輔助科技可讀的數值語意。跨頁說明面板標題移入 shared UI，並移除 Sheet Copy 重複主題覆寫、未使用便利貼 icon 樣式及 Photo Curator 的無必要 `!important`。FFmpeg 在 390／768 px 下改用單欄工作區並讓 shell 選項換行，E2E 因此發現且修正原有 390 px／768 px 橫向溢位。後續已將登入與初次設定頁樣式移入 auth feature CSS，清除 index／theme 中重複登入覆寫；Dashboard 主視覺、狀態卡片、工具卡片與分類區、YouTube 設定子導覽、Google Sheet 設定標頭、YouTube Batch 表單及 Quick Token Drawer 版型亦改由 feature CSS 管理並使用語意 token，對應 Dashboard 舊有全域重複樣式已移除。Setup 欄位標籤現在正確關聯輸入欄，secret 切換具備明確名稱與 pressed 狀態。最新主樣式 chunk 為 55.01 kB／gzip 10.18 kB，初始稽核為 99.06 kB／gzip 18.06 kB；其餘全域舊樣式仍待逐頁清理。根 token／基礎樣式已集中，新增 Prettier、ESLint 未使用變數與 Hooks 錯誤門檻、Stylelint 及漸進 TypeScript 檢查。
- System Settings 頁的憑證、允許新帳號、白名單與確認刪除區塊已改用頁面專屬 CSS 和語意 token；移除固定 inline layout 與玻璃擬態 class，操作按鈕改用共用 Button，新增信箱欄位的 label／說明與密鑰切換的 pressed 狀態。390／768／1440 px E2E 及畫面截圖驗證頁面無水平溢位，排列與深色設計系統一致。
- Playlist Sort 頁及其預覽表格、曲目副標、排序規則列的固定 inline 版面已全部移入 YTMusic feature CSS，兩種預覽共用列表、曲目、狀態與拖曳類別；釘選清單改用並列的獨立按鈕，移除互動元件巢狀錯誤。390 px 釘選／取消、預覽與建立新歌單流程的 E2E 已通過。
- YouTube Music 設定頁的固定 inline 版面已移入 YTMusic feature CSS；Token 驗證成功／失敗、憑證說明、地區與語言選擇及快捷導覽使用語意 token 與明確的狀態 class。新增 390／768／1440 px E2E，驗證自訂地區欄位顯示且頁面無水平溢位。
- YouTube 授權槽位編輯卡、路由警告與播放清單標頭的固定版面及狀態色已移入 feature CSS，憑證與播放清單欄位標籤、密鑰切換補上可存取名稱；390／768／1440 px E2E 驗證編輯區與播放清單設定頁無水平溢位。
- System Settings 的 OAuth 憑證、允許登入白名單與新增使用者政策已有 feature API wrapper 和明確的 TypeScript request／response contract；SystemSettingsPage 不再直接呼叫全域 api 物件，wrapper 與頁面互動各有測試。
- Google Sheets OAuth 連線／解除及共用試算表設定寫入已移入 Sheets feature API wrapper，附 request／response TypeScript 契約與 wrapper 測試；Google Account Settings 與共用資料來源面板已改用對應的 feature API 邊界。YouTube 配額面板也改用具回應型別的 feature API，並以後端實際回傳的 `updated_at` 顯示資料時間。
- 試算表隊伍／人物選項與帳號共用篩選新增 Sheets feature API wrapper、型別與執行期格式檢查；App 與相關 hook 改經此邊界呼叫，格式錯誤會進入既有錯誤狀態，不會被誤當空清單。共用 filter panel 的分散樣式亦集中至 shared UI CSS，清除 `index.css` 與 `app-theme.css` 兩份覆寫；390／768／1440 px E2E 驗證面板與頁面無水平溢出。
- Playlist Sort 頁的 YouTube Music OAuth 改用 YT Music feature API；Weverse 上傳頁的專屬 uploader OAuth 已併入 Weverse typed API boundary。YouTube Settings 與 Publish Cleaner 的播放清單正規化也改由 YouTube feature API 提供，頁面不再直接依賴全域 API service。
- 各工具的前端 manifest 已拆到 feature 目錄，彙整工具 metadata、導覽、dashboard cards 與受保護 routes；catalog 啟動時拒絕重複 ID／路由及不在 PATHS 的 destination，AppRoutes 由 registry 組裝 feature routes。
- Playwright 增加 390／768／1440 px 共用元件展示溢位與截圖測試，並驗證九個工具／設定頁的樣式載入及多尺寸版面、Weverse 資料夾拖曳／掃描／複查與 fake provider 上傳至完成、Google OAuth URL 導向、Playlist Sort 新歌單、YouTube Batch Update 預覽與執行、Publish Cleaner 清單／配額／快照確認至發布完成、Photo Curator ZIP 匯出及 Sticky Notes API 生命週期。前後端工具 ID 與路由契約測試發現並修正 `youtube-integrations`／`integrations-quota` 漂移。
- 發布 workflow 只會發布已通過驗證的同一個 main SHA；README 的支援平台與前端路徑已修正。

上一輪接續交付（已於 `453de4b` 提交並由 `0abaeef` 合併）：

- `Navbar` 完全由 feature manifest 的導覽資料組裝。單項目直接顯示、多項目為展開群組，保留既有 `<groupId>Open` 儲存鍵；`sidebar: false` 保留 YouTube 設定子導覽的位置。新增 manifest 自動顯示及 active 展開的互動測試通過，開發規範與架構範例已同步。
- 新增 `create_app()`，提供獨立 registry／upload worker 與 notes store、YouTube workflow adapter、FastAPI dependency override 的組裝入口。HTTP 測試確認兩個 app 的 notes、上傳工作及 provider fake 相互隔離；預設 app 的既有 URL／錯誤契約維持相容。全平台 settings／auth store 仍未全面改為 app scope。
- Weverse worker 停止接單後最多排空 20 秒；取消排隊工作並清理其暫存目錄，逾時工作持久化為 interrupted。晚到影片 ID 可保存，不能解除 interrupted 或繼續字幕呼叫；測試涵蓋期限、取消、拒絕新工作、完成狀態不被誤改及晚到 provider 回應。Compose grace period 為 45 秒；已開始的 Python 執行緒 I/O 仍須由 provider 返回或容器終止，並非可強制取消的交易。
- 所有預設持久化路徑改由 `TOOLBOX_DATA_DIR` 統一解析，預設位置不變。pytest 在應用匯入前自動使用 TemporaryDirectory 並禁止第三方連線；不再需要人工複製 repository 才能保護實際 data。Weverse store 建構不再建立檔案，首次存取才建立資料目錄與 sidecar lock。
- YouTube 播放清單輸入正規化移入 feature 的 TypeScript model，保留舊 service export 相容性。YouTube 共用樣式及共享媒體樣式分別移至 feature／shared UI，清除原全域重複 selector；index.css 現為 1,231 行，app-theme.css 為 706 行。共用元件展示格線改依內容寬度換欄，修正 768 px 雖無溢位但欄位過窄的問題。
- 新增 Windows／Edge `npm run test:visual`，以禁止自動更新的 `toHaveScreenshot` 比對三種寬度的元件、focus 與 Dashboard，共 6 項／9 張基準。基準已人工檢視；跨平台 CI 基準尚待建立，不能把 Windows 字型結果直接套用於 Linux Chromium。
- 部署文件補上中斷任務與資料副本回退驗收流程，Compose 現在實際支援文件中的 `IMAGE_NAME` 固定 SHA 設定。本機未安裝 Docker，因此未執行容器建置或回退演練。

上一輪接續交付（2026-09-25，已於 `74c9fcf` 提交；未取得同 SHA CI）：

- `create_app(account_state_store=...)` 新增帳號設定與工作狀態 repository 注入。HTTP context 橋接既有 helper、動態 key 驗證及 YTMusic 地區偏好，工具 startup 登錄使用各 app 的 repository。新增同帳號跨 app、同步並行請求、動態 key 與失敗後 context 還原測試。未注入仍沿用 singleton；背景執行緒須明確傳入 repository，其他 settings／credential／session store 尚未完成隔離。
- FFmpeg 純命令模型、preset 與 request/model 型別移至 `features/ffmpeg/model`，頁面及 hooks 使用 feature 入口，舊 utils 保留相容匯出。新增 7 項回歸案例涵蓋裁切、seek、shell 換行、轉碼、音訊與 GIF。
- Dialog、ConfirmDialog 與 Toast 樣式集中至 `shared/ui/feedback.css`，合併等價覆寫；index.css 從 1,231 降至 874 行，app-theme.css 從 706 降至 629 行。新增 390／768／1440 px 確認框版面、Escape 與焦點還原 E2E。主 CSS 53.96 kB／gzip 10.00 kB。
- Manifest 驗證補上重複 index／wildcard、非法 index 子路由與 redirect destination 檢查。Playwright 可用 `PLAYWRIGHT_PORT` 切換連接埠，修正 visual config 合併時額外啟動一般 E2E server 的問題。
- 驗證：後端 238 項 pytest、Ruff lint／format 通過；前端 70 檔／333 項 Vitest、Prettier、ESLint、Stylelint、typecheck 與 production build 通過。Vitest 因本機快取目錄權限改用 `--no-cache`；Edge E2E 23 項及既有 visual 6 項通過，未更新基準圖。因 4173 在本機回報 EACCES，E2E 使用 18473，visual 使用 4174。依既有 lockfile 執行 `npm ci` 修復缺漏依賴，未修改 lockfile。

本輪接續交付（2026-09-25，基於 `74c9fcf`，工作目錄尚未提交）：

- `create_app(session_store=...)` 新增登入 session repository 注入；auth endpoints、身分 dependency 與 Google auth helper 經 request context 取得對應 store，未注入時保留 singleton。HTTP 測試涵蓋跨 app cookie 拒絕、登出隔離、同步並行請求、失敗後 context 還原，以及 OAuth callback 建立／輪替 session 和重新載入持久化資料；settings 與 credential store 仍為 process scope。
- Playlist Sort 純排序模型移入 `features/ytmusic/model/playlistSort.ts`，API 與 UI 共用模型型別，舊 utils 保留相容匯出。頁面、hook 與四個元件改用 feature 入口；回歸測試另修正 null tracks 的 `.map()` 例外，以及 `__proto__` 等專輯／藝人／曲目 ID 撞到物件原型的問題。sub-agent 獨立審查未發現遷移的行為回歸。
- 共用設定版型與狀態呈現移至 `shared/ui/settings.css`、`shared/ui/status.css`，YouTube 配額樣式移至 feature；合併設定頁重複宣告並保持載入順序。`index.css` 874→807 行，`app-theme.css` 629→399 行。主 CSS 53.98 kB／gzip 9.99 kB。
- FFmpeg 檔名、視訊／音訊編碼、畫質、解析度、FPS 與碼率欄位補上 label 關聯。新增 390 px 瀏覽器測試，驗證檔名與剪輯時間、H.264 參數、靜音、PowerShell／CMD／單行格式切換、MP3 與 GIF 預設切換的實際輸出。
- 驗證：後端 242 項 pytest、全 backend Ruff lint／format 通過；前端 71 檔／338 項 Vitest、Prettier、ESLint、Stylelint、typecheck、production build 通過；Edge E2E 24 項與既有 visual 6 項／9 張基準比對通過，未更新圖片。production build 因既有 `dist/assets` 權限限制改輸出至 `test-results/verified-build`，一般 E2E 使用 18473。本輪未取得同 SHA CI、未執行真實 provider 操作或 Docker 回退演練。

本輪接續交付（2026-09-25，憑證 repository 注入）：

- `create_app(credential_store=...)` 提供 OAuth 憑證 repository 注入，授權 callback、登入／服務憑證查詢、解除連線、YouTube 槽位路由、YTMusic token 及 Google refresh 均經 request context 使用 app 對應 store。未注入時保留 singleton 與既有 JSON 格式；設定、加密金鑰與登入政策仍為 process scope。
- 新增 HTTP 測試涵蓋同帳號跨 app 解除 Sheets／寫入及刪除自訂 token、token refresh 及加密持久化、同步並行請求與例外後 context 還原；既有 OAuth callback／session 測試改為 factory 注入，驗證 callback 憑證只寫入所屬 app。
- 修正 ESLint 會掃描 `test-results/verified-build` 的問題，排除測試與 Playwright 報告產物目錄，讓先 build 再 lint 也可重複通過。
- 驗證：後端 246 項 pytest、Ruff lint／format 通過；前端 71 檔／338 項 Vitest、Prettier、ESLint、Stylelint、typecheck 與 production build 通過。build 輸出至 `test-results/verified-build`；本輪未更動 UI 版面。pytest 有一項既有 Starlette/httpx 棄用警告。尚未執行同 SHA CI、真實 provider 或 Docker 回退演練。

本輪接續交付（2026-09-25，settings 與政策注入）：

- 新增 `create_app(app_settings=...)`；`Settings` 接受獨立 RuntimeConfig 與 SystemSecretsManager。HTTP 與 lifespan context 涵蓋設定讀寫、白名單政策、OAuth URL／簽章／cookie、來源保護及健康資訊，CORS／TrustedHost 以該 app 設定組裝。SessionStore／CredentialStore 可明確指定加密金鑰，未注入的 repository 保持原有預設。
- OAuth 簽章器與 cookie 名稱改為依呼叫時設定解析，避免 import 時固定為另一個 app 的值；移除 Google auth 模組對 `OAUTHLIB_INSECURE_TRANSPORT` 的程序全域修改，本機 HTTP callback 的授權 URL 測試通過。
- 首次新增／移除白名單會保留環境變數中的既有名單，修正原先首次新增帳號會遺失環境管理員的問題。
- 新增 6 項測試涵蓋跨 app 設定及密鑰寫入、環境預設、OAuth 回跳／簽章／正式環境 cookie、TrustedHost／來源拒絕、真實身分 dependency 白名單隔離、並行寫入、例外還原、本機 OAuth URL 與 lifespan。後端 252 項 pytest、Ruff lint／format 通過；前端 71 檔／338 項 Vitest 與全部既定品質檢查、production build 通過。未更動 UI；未執行真實 provider、同 SHA CI 或部署回退。
- 尚未將所有 singleton 延後初始化；配額帳本、速率限制與其他外部 client 的 app 注入仍待完成。此交付提供明確組裝能力，不能將未指定 repository 的 factory 呼叫解讀為完整資料隔離。

本輪接續交付（2026-09-25，配額帳本與速率限制隔離）：

- `create_app(youtube_quota_trackers=..., request_limiter=...)` 支援明確組裝；quota mapping 必須包含相符的 primary／secondary ledger。HTTP/provider helpers 使用所屬 app 的帳本，未注入仍沿用原有檔案；YouTubeQuotaLimiter 可綁定 RuntimeConfig，供 HTTP context 外使用正確政策。
- 每個 app 預設擁有獨立 SlidingWindowLimiter，保留 API／workflow 桶與標準 429／Retry-After 契約。單一 app 達上限不再占用其他 app 的限流額度。
- 新增 4 項測試：同步並行 provider 呼叫、實際 quota-usage API 與檔案重新讀取、workflow／API 限流隔離、拒絕請求不得執行工作、limiter 注入、例外後 context 還原與錯誤槽位組裝拒絕。後端 256 項 pytest、Ruff lint／format 通過。前端未變更，最近同工作目錄 338 項 Vitest 與完整品質檢查通過。

本輪接續交付（2026-09-25，auth repository 延後載入與失敗保護）：

- SessionStore 與 CredentialStore 建構不再讀取 JSON；首次存取在既有 RLock 內載入，並行首次寫入不會重複載入或遺失原有記錄。
- auth repository 使用 strict JSON read：只有不存在的檔案視為空資料，讀取錯誤、損毀 JSON、null／錯誤頂層結構會拋出例外並保留原檔。修復檔案後同一 store 可重試載入；HTTP 仍由既有標準錯誤 handler 處理。
- 寫入失敗會使記憶體快取失效，下次操作重新讀取持久化結果，避免未成功儲存的刪除／新增被回傳或帶入下一次成功存檔。
- 新增 14 項回歸驗證延後讀取、保留舊資料、損毀檔案拒絕覆寫／修復重試、讀寫權限失敗及並行首次寫入。後端 270 項 pytest、Ruff lint／format 通過。此改動未增加跨程序交易保證；Settings 的預設建構與其他 singleton 初始化仍待後續移至明確組裝流程。

本輪接續交付（2026-09-25，系統設定持久化錯誤契約）：

- RuntimeConfig 改為首次存取才載入；損毀資料拒絕覆寫，寫入失敗回復上次成功保存的快取，不再吞掉例外或同步未保存的政策。
- SystemSecretsManager 的主金鑰／OAuth 憑證寫入失敗會拋出錯誤，不再返回成功；損毀 JSON、錯誤頂層結構或無法解密的系統憑證保留原檔並拒絕覆寫。Setup PIN 寫入成功後才保存快取，失敗後可重試。
- 新增 13 項測試，包含 HTTP 設定更新失敗回傳標準 500、原有政策／憑證保持一致、損毀資料及錯誤金鑰不得覆寫、主金鑰與 Setup PIN 失敗重試。後端 283 項 pytest、Ruff lint／format 通過。
- 各 JSON 檔案的原子寫入不代表跨檔案交易；setup 的多檔案更新仍可能部分完成後回報錯誤，不能宣稱整個 setup 可原子回退。其餘重構與外部驗收仍按未完成清單繼續。

本輪接續交付（2026-09-25，共用版型與狀態 CSS 收斂）：

- 共用表單、頁面／卡片版型移至 `shared/ui/layout.css`；執行結果與 metadata 版型移至 `shared/ui/results.css`；動畫與 reduced-motion 規則集中至 `shared/ui/motion.css`，loading／error-state 歸入既有 status.css。
- 合併頁面標頭與 icon box 的重複 theme 覆寫；Batch Update PreviewField 與 API Health 配額頁版型歸回 YouTube feature。`index.css` 807→375 行，`app-theme.css` 399→339 行，剩餘內容集中於 app shell／導覽，其重複規則仍待最後收斂。
- 前端 71 檔／338 項 Vitest、Prettier、ESLint、Stylelint、typecheck 與 production build 通過；Edge E2E 24 項與 visual 6 項／9 張基準比對通過，未更新截圖。Playwright 在 Windows 收尾時未能停止其 Vite，逐項完成後手動停止本次啟動的 Vite，兩組 runner 均回傳 exit 0；此環境收尾問題仍需改善。

本輪接續交付（2026-09-25，移除舊全域樣式入口與導覽驗收）：

- `index.css` 與 `styles/app-theme.css` 已移除；app shell／導覽樣式合併至 `app/shell.css`，解開舊 base／theme 的重複覆寫。共用版型、狀態、動畫及 feature CSS 各有單一載入入口；token 檢查已同步至新檔案。
- 修正舊行動選單在遮罩下方的 z-index、桌面收合狀態讓手機選單只剩圖示、關閉時 offscreen 導覽仍可取得焦點等問題。收合樣式限於桌面；焦點循環略過隱藏控制，關閉按鈕只過渡顏色，避免 visibility 過渡讓開啟焦點失敗。
- 新增實際瀏覽器導覽驗收：桌面收合→390 px 展開、點選便利貼路由、Tab／Shift+Tab 焦點循環、Escape 焦點還原與返回桌面保留收合狀態。
- 驗證：後端 283 項 pytest／Ruff，前端 338 項 Vitest、全部品質檢查、Edge E2E 25 項、visual 6 項／9 張原基準與 production build 通過。主 CSS 51.20 kB／gzip 9.52 kB。使用明確啟動的 Vite 供測試重用，測試正常退出後停止該 server，避免 Windows 自動收尾問題。

本輪接續交付（2026-09-25，帳號工作狀態 API 邊界）：

- App 的工作狀態載入與 `useAccountWorkState` 儲存改經 settings feature 的 TypeScript API wrapper，明確定義帳號工作狀態 response 與工具值型別；既有 endpoint、key 與 JSON 格式不變。保留未提供 version 的舊回應相容性，明確提供非 1 版本時拒絕處理。
- wrapper 驗證 state 與每個工具值都是物件，格式錯誤不再被誤標示為已儲存；hook 保留使用者待存值並允許重試。測試涵蓋錯誤格式、版本、傳輸錯誤、未知工具 key 的透傳，以及失敗後重試與既有並行儲存行為。
- 驗證：前端 72 檔／349 項 Vitest、Prettier、ESLint、Stylelint、typecheck 與 production build 通過；`git diff --check` 通過。本次未改後端或版面，未重跑瀏覽器截圖或後端 suite；同 SHA CI、真實 provider 與 Docker 回退仍未驗收。

本輪接續交付（2026-09-25，配額共用 UI 與版型）：

- API 健康度頁採用共用 PageHeader／Button，配額面板更新與重試操作採用 Button，載入狀態採用具 live region 的 LoadingState。既有輪詢、切槽、錯誤與重試行為維持相容。
- 截圖檢查發現 quota header／metadata 等 class 缺少版型規則，補入 YouTube feature CSS，讓標頭可換行、資訊分行排列並統一間距。新增 390／768／1440 px 配額頁 E2E，涵蓋全部更新、單次更新失敗與重試；手機與桌面截圖已人工檢視。
- 驗證：前端 72 檔／349 項 Vitest、26 項 Edge E2E、6 項 visual／9 張既有基準通過，未更新基準；Prettier、ESLint、Stylelint、typecheck、production build 通過。本次未更動後端；整體未完成項目維持如下。

本輪接續交付（2026-09-25，Google discovery client 注入）：

- `create_app(google_client_factory=...)` 提供 HTTP 與 lifespan 的 Google client 建構入口；Sheets service、YouTube service 及 OAuth profile／channel 查詢改用此邊界。保留預設 discovery.build 與各請求 credentials，不引入跨使用者 client 快取。
- 新增兩個 app 並行呼叫真實 Sheets metadata endpoint 的隔離測試，確認 factory 與 credentials 正確配對；另驗證例外後 context 還原、預設 builder fallback、YouTube helper 傳遞及 provider 失敗的既有錯誤契約。
- 驗證：後端 286 項 pytest、Ruff lint／format 通過，保留一項既有 Starlette/httpx 棄用警告。OAuth token transport、YTMusic client 與 singleton 初始化仍待處理；Weverse 背景 worker 維持原有明確 provider 注入，不宣稱新 context 自動傳播至執行緒。

本輪接續交付（2026-09-25，YTMusic client 注入）：

- `create_app(ytmusic_client_factory=...)` 提供 HTTP／lifespan 的 YTMusic 建構入口，播放清單查詢與 Token 線上驗證均採用此 factory；保留預設 YTMusic、語言／地區解析及既有 fallback 行為，不快取已認證 client。
- 新增兩個 app 並行呼叫 playlist endpoint 的測試，驗證 Starlette threadpool context 傳播；另覆蓋 Token 驗證、auth／locale 參數、建構失敗、公開 client fallback 與 context 還原。
- 驗證：後端 289 項 pytest、Ruff lint／format 通過；仍有既有 Starlette/httpx 棄用警告。本次未修改前端，OAuth token transport 與初始化副作用仍待處理。

本輪接續交付（2026-09-27，OAuth client 注入與驗證）：

- `create_app(oauth_client_factories=...)` 可為每個 app 指定 OAuth flow 建構器及 Google 憑證 refresh request transport；登入及各服務的授權 URL、PKCE code exchange、token refresh 均經此邊界，預設仍使用原有 Google 函式庫實作。
- 新增授權 URL 的跨 app 併行隔離、PKCE code exchange、真實 Credentials refresh 後只寫入所屬 app 憑證庫，以及例外後 context 還原測試。移除 Google auth 匯入時修改 `OAUTHLIB_INSECURE_TRANSPORT` 的程序全域副作用。
- 預設 settings 的動態 OAuth／runtime 設定同步移到 `create_app()` 組裝時執行，不再於 `core.config` 模組底部主動同步。`Settings()` 建構時的主金鑰解析及預設 auth store 的加密器建構仍有匯入時副作用，後續須以相容既有資料的方式處理。
- 後端 294 項 pytest 與 Ruff lint／format 通過；前端 72 檔／349 項 Vitest、Prettier、ESLint、Stylelint、typecheck 與 production build 通過；Edge E2E 26 項、visual 6 項／9 張既有基準通過，未更新截圖。Windows 的 Playwright 在測試完成後仍卡於 Vite 收尾，停止本次啟動的 server 後兩組 runner 均回傳 exit 0。尚未完成所有 singleton 延後初始化或真實 provider 驗收。

本輪接續交付（2026-09-27，預設 auth 初始化延後）：

- 預設 `Settings` 匯入時不再解析／寫入主金鑰；`create_app()` 組裝時解析金鑰並同步動態設定，獨立呼叫簽章 helper 時也會先解析金鑰。預設 SessionStore／CredentialStore 延到首次使用才建立加密器，仍固定使用預設 settings 的加密金鑰；明確建立的 store 保留建構時綁定金鑰的原有語意。
- 新增獨立程序測試，確認只匯入 config、session 與 credential 模組不建立資料目錄。後端 295 項 pytest、Ruff lint／format 通過；前端 72 檔／349 項 Vitest、Prettier、ESLint、Stylelint、typecheck 與 production build 重新驗證通過。本次未更動 UI，未重跑瀏覽器測試；其他 singleton 的初始化與跨程序交易仍待處理。

本輪接續交付（2026-09-27，獨立 auth store 金鑰保護）：

- `SessionStore()`／`CredentialStore()` 若未明確指定加密金鑰，會先解析所屬設定的持久化金鑰，再建立加密器；禁止同時要求延後加密與傳入明確金鑰。這避免在匯入預設設定後、組裝 app 前自行建立 store 時，以空值派生加密金鑰。
- 新增獨立程序測試，驗證組裝 app 前建立兩種 store 會產生持久化主金鑰，session 可由新 store 解密，credential 加解密一致。後端 296 項 pytest、Ruff lint／format 通過。前端未更動，上一輪完整品質檢查仍適用。

本輪接續交付（2026-09-27，帳號狀態與便利貼持久化保護）：

- 預設 AccountStateStore 延至首次資料操作才讀檔，工具 key 註冊不觸發讀取；損毀 JSON、null 或錯誤頂層結構現在拒絕覆寫，修復檔案後同一 store 可重試。寫入失敗使記憶體快取失效，下一次讀取重新取得已保存資料。
- NotesStore 同樣拒絕損毀或錯誤頂層結構；寫入失敗後重新載入已保存資料，避免回傳未持久化的便條內容。新增損毀與寫入失敗回歸測試；後端 304 項 pytest、Ruff lint／format 通過。前端 72 檔／349 項 Vitest、Prettier、ESLint、Stylelint、typecheck 與 production build 重新驗證通過；未更動 UI，未重跑瀏覽器測試。

本輪接續交付（2026-09-27，YouTube 路由模型歸位）：

- YouTube routing mode、授權槽位選擇、連線狀態、原因文案與授權指紋移入 `features/youtube/model/routing.ts`，新增輸入資料型別；頁面、元件及 Batch Update hook 改由 feature model 匯入，舊 `utils/youtubeRouting.js` 保留相容匯出。既有 API 回應與顯示文案不變。
- 驗證：前端 72 檔／349 項 Vitest、Prettier、ESLint、Stylelint、typecheck、production build 通過；Edge E2E 中 Publish Cleaner、Batch Update 與 YouTube 設定相關 4 項通過。後端 304 項 pytest、Ruff lint／format 通過。Windows 的 Playwright runner 在四項測試結束後仍需停止本次啟動的 Vite 才回傳 exit 0；未更新視覺基準。

尚待完成：

- 共用 UI 尚未逐頁遷移，固定 inline layout 也仍有保留。舊 index.css／app-theme.css 已移除，樣式分至 app shell、shared UI 與 feature；Stylelint 涵蓋全部 CSS，foundation reset selector 有單檔規則例外。仍需完成剩餘頁面共用元件遷移與 token 統一。
- Feature hook 已從頁面抽離，但仍有其他 feature 的 API/model 邊界及較完整的 TS 型別尚未完成。E2E 已覆蓋 mock OAuth 導向、排序、Batch Update 與 Publish Cleaner 執行及照片匯出；尚未驗證真實 Google／YouTube OAuth callback 與 Weverse 真實 provider smoke test。
- YouTube workflow adapter、Notes、account-state、session、credential repository 與 Weverse worker／store／provider 已可由 app factory 注入；身分驗證政策與 settings 已可注入；配額帳本、速率限制、Google discovery、YTMusic 及 OAuth client 亦可隔離。預設 auth key／store 與 account-state 的匯入時初始化已延後；其他 singleton 的副作用仍待盤點。Account-state／session／credential／settings 的 context 橋接後續可逐步替換為明確 service dependency。
- Weverse sidecar lock 只承諾在支援作業系統檔案鎖定語意的本機檔案系統上協調合作程序；NFS／網路檔案系統或跨主機多實例仍需驗證鎖語意，或改採資料庫／外部鎖服務。沒有真實 provider smoke test，也未演練 Docker 部署回退。
- 過去 `npm install` 曾顯示 9 項安全公告；本輪 `npm audit --offline --json` 已完成並回報 0 項漏洞。線上 registry 的即時 advisory 查詢仍需在可連線的 CI／維護環境複核。

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
