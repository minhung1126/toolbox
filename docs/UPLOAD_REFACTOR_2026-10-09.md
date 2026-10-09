# 上傳工作流與頁面重構交付紀錄

日期：2026-10-09（Asia/Taipei）。基準：`21e97f4`。

## 使用者可見變更

- Weverse 完成頁與歷史能區分全部完成、字幕部分完成及結果待核對。每軌字幕列出語言、檔名與結果。
- 歷史的「任務詳情」開啟 `?task=<id>`；重新整理後重新讀取同一任務，活動任務持續輪詢。讀取停止後可以重新開啟同一任務。
- 有已知影片 ID 與逐軌紀錄的任務可建立字幕補傳子任務。重新選取同名 SRT／VTT，核對原影片與檔案清單後執行；也可不選檔案、只核對 YouTube 已有字幕。
- 結果未知的字幕不因遠端清單暫時不存在就重送。使用者須先在 YouTube Studio 核對並勾選確認，才能補傳該檔案；已查到的同語言／名稱字幕只記錄為完成。
- 批次中繼資料更新、發布清理、Weverse 字幕結果提供 CSV／JSON。排序結果提供已知的成功／失敗總數與失敗項目，不推測 API 未回傳的個別成功 ID。
- 拖曳資料夾會讀取所有批次，並處理讀取權限錯誤。Photo Curator 標題輸入框可縮小，YouTube slot 卡片依可用寬度排列並換行。

## 寫入安全與相容性

- 影片上傳和字幕操作分離；補傳 worker 接收伺服器保存的 `existing_video_id`，不執行 `videos.insert`。
- 字幕 API 呼叫前先持久化 `unknown`，每一軌成功後保存 caption ID。缺少檔案、未執行、結果未知與已完成分開保存。遠端例外文字只記錄於伺服器日誌，HTTP 邊界也清理舊紀錄中的原始例外。
- `POST /api/v1/weverse-uploader/tasks/{id}/retry-captions` 接受 multipart `expected_updated_at`、`confirmed_missing`（JSON 檔名陣列）及 `subtitles`。要求登入帳號和專用上傳授權；已知原頻道須與目前授權一致。
- 在同一檔案鎖定交易中檢查父任務版本、終止狀態及既有子任務，再建立唯一子任務。相同請求或並行請求不能重複排程；父子鏈保留歷史。仍有 worker 執行的任務不能補傳。
- 保持既有 URL、JSON 檔案與 `completed` 等公開狀態；新增 `caption_results`、`channel_id`、父子任務 ID 等欄位。舊紀錄仍可讀取，沒有逐軌紀錄時引導至 Studio，不猜測可重送的字幕。
- 瀏覽器上傳暫存檔在 worker 結束後清理，補傳需重新選檔。恢復追蹤不代表跨程序影片位元組續傳；服務重啟仍將活動任務標記為中斷，不自動重傳影片。
- 保持單體部署與既有 JSON repository，未新增外部佇列或資料庫。

## 模組邊界

- `weverse_captions.py`：字幕計畫、逐軌 checkpoint、provider 核對及公開錯誤清理。
- `useUploadPackage.ts`：資料夾讀取與複查表單；`useUploadTasks.ts`＋`taskState.ts`：型別化任務狀態、歷史與輪詢；`useWeverseUploadWorkflow.ts`：啟動／重設協調，使用同步防重送鎖。
- 任務切換忽略過期回應；帳號切換重建頁面狀態，已離開的頁面不再以延遲寫入結果更新網址。
- Weverse 拆出選檔、複查與任務詳情；FFmpeg 拆出播放器、編碼控制及指令輸出；Playlist Sort 拆出授權、規則、套用區塊與 controller；YTMusic Settings 拆出 Token、偏好與 controller。
- 新的 Weverse 工作流與匯出核心由 TypeScript 檢查；其他既有 JSX 維持漸進遷移，不宣稱全站已完成 TypeScript 遷移。
- CSV 使用 UTF-8 BOM、完整引用及試算表公式轉義；JSON 保留原始文字。下載後釋放 Blob URL。

## 驗證

| 檢查 | 結果 |
| --- | --- |
| 後端完整 pytest | 352 項通過 |
| 最後影片 ID 補強及上傳定向回歸 | 39 項通過（含最後新增的 3 項無效 ID 案例） |
| 前端完整 Vitest | 86 個檔案、475 項通過 |
| 最後 Weverse 定向 Vitest | 30 項通過 |
| Ruff 格式與 lint | 通過 |
| Prettier、ESLint、Stylelint、TypeScript | 通過 |
| Production build | 通過 |
| 完整假 provider E2E | 49 項通過 |
| 最終版本 Weverse 定向 E2E | 11 項通過 |

單元測試涵蓋：逾時後不重送、已提交字幕核對、僅補傳缺少字幕、持久化失敗先停止、並行請求僅建立一個子任務、帳號與頻道隔離、過期版本拒絕、重啟保留逐軌證據、無效影片 ID、分批讀取超過 100 個檔案、過期任務回應、CSV 公式轉義與下載 URL 清理。

完整 E2E 覆蓋 390／768／1440 px 的功能與版面；新增任務測試驗證歷史詳情、重新整理後追蹤、CSV 實際下載與字幕補傳請求不包含影片。Windows Edge 視覺基準未於本 Linux 環境執行，未更新任何截圖基準。

所有自動化測試使用假 provider 與測試資料；未操作真實 Google／YouTube 帳號或部署。既有 #7 真實 provider 驗收與 #8 部署回退演練需要專用帳號及隔離環境，本批不以假測試宣稱完成這兩項外部驗收。
