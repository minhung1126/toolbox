# Toolbox 測試修正計畫

2026-11-23。盤點基準為 `776a82e`。原有 156 個測試檔、1,129 項案例，包括參數化輸入及三種寬度的視覺情境。[逐項裁決](validation/TEST_INVENTORY.md)

## 已修正的原因

| 異常 | 重現結果 | 修正 |
| --- | --- | --- |
| 後端無法收集 | Windows CP950 開啟 UTF-8 的 FFmpeg 預設時，有 32 個測試檔無法收集。 | 資源和測試資料明確用 UTF-8 開啟。以非 UTF-8 預設環境的子程序驗證匯入。 |
| 發布測試在 app 啟動時失敗 | 使用 UTF-8 重跑後，Windows app lifespan 呼叫 Unix 專用的 `fcntl`。 | Windows 使用原生排他位元組鎖，並驗證程序內與跨程序競爭、重啟釋放及結果核對。正式部署規格為 Linux 單程序、單副本。[Python 檔案鎖文件](https://docs.python.org/3.11/library/msvcrt.html#msvcrt.locking) |
| FFmpeg 引數測試失敗 | Vitest 有 11 項無法啟動 PATH 上的 Bash。後端另外重現 CMD 引數和 PowerShell 輸出編碼問題。 | Bash 逐版式核對完整 argv。CMD 和 PowerShell 使用固定的引數回顯程式。可攜測試直接驗證每個欄位錯誤。 |
| 清理頁面在 Edge 誤報 | Edge 在 768 px 將同一種對齊回報為 `flow-end`。修正前功能測試為 72 通過、1 失敗。 | 三種寬度都驗證實際控制項位置與溢位。Dashboard 的重複樣式案例由既有功能及視覺測試承接。 |
| 暫存流程容易受操作耗時影響 | 重整前尚未收到人物指定的自動保存確認，造成還原結果依作業時序變動。 | Video 和 Shorts 各自驗證重試、保存及取消重建。等待正確工作狀態回應。另用三個獨立 viewport 驗證長描述與彈窗焦點。 |
| 瀏覽器執行超時 | 本機 768 px 跨團選擇在重整時逾時，系統設定情境在單一案例走三種寬度時也觸及時間上限。 | 重整後由勾選狀態與列數確認還原。改寫的版面案例按寬度獨立執行。 |
| 模擬請求會轉送至本機後端 | 瀏覽器測試通過時，預覽服務仍記錄一筆人物篩選的 API 代理連線失敗。 | 在測試 context 攔截 API，並停用測試預覽的開發代理。 |
| 視覺比對無法進入或基準過時 | Dashboard 把所有路由當成可見卡片。舊 Edge 快照仍包含 Weverse 與改版前的 Dashboard。 | 等待可操作的搜尋與釘選控制項。核對新版畫面後更新七張 Edge 基準。三套 Playwright 組態使用獨立服務埠和輸出目錄。 |
| CI 診斷訊號混在一起 | 近期的 `Test frontend` 失敗實際來自 Stylelint，瀏覽器步驟當時尚未執行。 | 將前端檢查、單元測試、建置、瀏覽器安裝及 E2E 拆為具名步驟。保留失敗的 trace、畫面與錯誤上下文。[失敗紀錄](https://github.com/minhung1126/toolbox/actions/runs/44225929019) [後續成功紀錄](https://github.com/minhung1126/toolbox/actions/runs/44226248500) |

## 修正次序與驗收

| 優先順序 | 工作 | 驗收 |
| --- | --- | --- |
| P0 · 已實作 | 修復編碼、FFmpeg 原生 Shell 與發布工作程序鎖。 | 跑完整 pytest／Vitest，包含 Bash、PowerShell 和 CMD。競爭發布程序無法取得鎖，恢復時依已知進度核對。 |
| P1 · 已實作 | 改寫清理、Dashboard 與暫存 E2E。修復視覺就緒條件與 Edge 基準。 | 三種寬度的功能與 Edge 視覺比對通過。重跑暫存與新版面情境，確定每輪使用獨立 fixture。 |
| P1 · 待 CI 驗證 | 執行 GitHub 的 Linux Chromium 功能、Linux 視覺與 Windows Edge 視覺矩陣。Linux Dashboard 基準早於新的三段 YouTube 流程。 | 用 Linux 的 `visual-linux-results` 核對三張 Dashboard 實際畫面並更新確認有變動的基準。修正案例在 CI 用 0 次 retries 連跑三輪。 |
| P2 · 已實作 | 16 項候選案例已集中或合併，8 項斷言已改為觀察實際狀態、操作與版面。 | 逐項裁決列出承接位置。章節下方列出跨層案例的驗收方式。 |
| P2 · 已實作 | 三項操作量測改由 `npm run test:benchmark` 執行。標準 E2E 驗證讀取 503 後重新讀取成功。 | 量測工作輸出點擊數、設定頁跳轉次數及耗時。503 案例核對兩次讀取及零次準備與發布請求。 |

## 合併後的覆蓋

| 項目 | 承接驗證 |
| --- | --- |
| 目錄 | catalog 的清單、細節及不存在的 ID 涵蓋 HTTP 路徑。FFmpeg 和 Photo Curator 由細節查詢核對 ID、名稱、狀態及入口。 |
| 歌單 | model 核對語系、Topic、合輯與協作者、非專輯項目的日期、專輯曲序及移動計數。頁面驗證變更排序規則後按實際曲序呈現，並更新配額。 |
| FFmpeg | 同一組 fast seek 案例核對兩段裁切時間和說明。舊匯入入口的空白與引號及預設案例提供相容性驗證。 |
| 便利貼 | 頁面測試使用實際契約解析，從矛盾的清單與總數取得錯誤狀態。瀏覽器刪除情境核對通知 live region。 |
| 照片排版 | 390、768、1440 px 均先驗證空工作台的格線與溢位，再匯入相片驗證 3／6／9 格。 |
| 批次更新與版面 | 批次確認驗證使用者看到的本次更新範圍。瀏覽器驗證登入、系統設定、兩個 Token 介面、搜尋和服務連結的可操作性。 |

## 本機重跑

安裝鎖定版本的後端與前端開發依賴後，從專案根目錄執行 pytest。Windows 可把 `TOOLBOX_TEST_BASH` 指向現有 Bash。Linux 預設使用 PATH 的 Bash。CMD 和 PowerShell 的原生測試各自依賴 `cmd.exe` 與支援標準 native argument passing 的 `pwsh`。

```powershell
$env:TOOLBOX_TEST_BASH = 'C:\Program Files\Git\bin\bash.exe'
python -m pytest backend/tests -q -ra

Set-Location frontend
npm test -- --run
$env:PLAYWRIGHT_BROWSER_CHANNEL = 'msedge'
npm run test:e2e
npm run test:visual
```

Linux 的視覺檢查使用 CI 安裝的 Chromium 與 Noto Sans CJK，執行 `npx playwright test --config playwright.visual.linux.config.ts`。[瀏覽器與視覺驗證說明](../frontend/e2e/README.md)

## 本次驗證紀錄

本機使用 Windows、Python 3.12、Node 22、Playwright 1.63 與 Edge 158。

| 項目 | 結果 |
| --- | --- |
| pytest | 482 項通過，包含 Bash、PowerShell、CMD 與發布程序互斥。現有 TestClient 依賴發出兩則棄用警告。 |
| Vitest | 指定 Git Bash 時 88 個測試檔、581 項通過。錯誤邊界案例會在 stderr 記錄刻意觸發的例外。 |
| 前端品質檢查 | Prettier、ESLint、Stylelint、TypeScript 與正式建置通過。 |
| 後端品質檢查 | Ruff lint 與格式通過。執行時排除本機無法讀取的舊 `backend/.pytest-tmp` 目錄。 |
| Playwright 功能 | 初次修改後 Edge 79 項通過，11 項改寫的版面與暫存案例各跑三輪通過。整併及寬度獨立後收集 87 個功能情境。 |
| Playwright 視覺 | Windows Edge 的 6 個情境連續兩輪通過，每輪比對 9 張基準。 |
| 按需量測 | 3 項通過，均產出操作次數與耗時的 JSON。 |
| 測試預覽 | 驗證測試組態無 API 代理，最後一輪 E2E 沒有代理連線錯誤。 |
| GitHub CI | 本機無 Linux 和 Docker 執行環境。Linux 組態已確認能收集 6 個視覺情境，Linux Chromium 與 Docker 實跑待 CI。 |
