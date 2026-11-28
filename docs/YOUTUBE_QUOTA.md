# YouTube Data API 配額

Creator Tools 會依每個 YouTube OAuth 授權組合保存請求層級的配額估算。這是本機 ledger，不是 Google Cloud Console 的即時專案總用量，也不包含其他應用程式送出的請求。

## 官方基準與本專案使用的成本

Google 官方目前說明：YouTube Data API 專案對搜尋、影片上傳等方法另有每日限制；其他端點合計的預設配額為每日 10,000 單位。官方配額可能調整，正式設定仍應以 Google Cloud Console 為準。

本專案目前登記的請求成本如下：

| API 方法 | 每次請求單位 | 用途 |
| --- | ---: | --- |
| `playlistItems.list` | 1 | 讀取 To-Post、確認項目是否已移除 |
| `videos.list` | 1 | 讀取影片資訊 |
| `videos.update` | 50 | 更新影片資訊或公開狀態 |
| `playlistItems.delete` | 50 | 從播放清單移除影片 |
| `channels.list` | 1 | OAuth 頻道驗證 |
| `playlists.list` | 1 | 讀取播放清單資訊（歌單排序等） |
| `playlistItems.insert` | 50 | 新增播放清單項目（歌單排序等） |

每取得一頁資料就會算一次請求成本。即使請求無效，官方也規定至少會消耗一個配額單位。

官方資料：

- [YouTube Data API 配額成本](https://developers.google.com/youtube/v3/determine_quota_cost)
- [YouTube Data API 概覽與預設配額](https://developers.google.com/youtube/v3/getting-started)
- [YouTube Data API 錯誤，包含 quotaExceeded](https://developers.google.com/youtube/v3/docs/errors)
- [Google Cloud 配額檢視與管理](https://cloud.google.com/docs/quotas/view-manage)

## Creator Tools 的保護邏輯

- 每個授權組合各自使用一份 ledger：`primary` 為 `data/youtube_quota_usage.json`，`secondary` 為 `data/youtube_quota_usage.secondary.json`。
- 請求送出前先保留官方成本；安全預留會從專案可用上限扣除。若預估會超過安全上限，請求不會送出。
- 系統預設專案配額為 10,000 單位，安全預留預設為 1,000 單位；登入後可在 YouTube 設定頁按授權組合調整。
- Google 回傳 HTTP 403 且錯誤原因為 `quotaExceeded`、`dailyLimitExceeded` 或 `dailyLimitExceededUnreg` 時，該授權組合會標記為已確認用完，新的請求會停止，直到官方重設。
- Auto routing 會在新的 workflow 開始時優先檢查 Primary；若本次保守成本無法由 Primary 的安全可用額度支應，會選用 Secondary。若執行途中 provider 或本地 ledger 回報 quota 不足，Auto 模式會在安全的單一操作邊界切換另一個 slot 並重試，不需要使用者重新按兩次。
- `quotaExceeded` 或本地安全上限只會封鎖目前 slot；目前 Auto workflow 會先嘗試另一個 slot，兩個 slot 都不可用時才暫停或回傳 quota 錯誤。下一個 workflow 仍會重新評估，Primary 恢復且足夠時會再次優先使用 Primary。
- YouTube 設定也支援手動模式；手動模式只使用目前作用中的 slot，不會自動 fallback。
- 配額日界線依 `America/Los_Angeles` 的午夜計算；前端同時顯示 Pacific Time 與瀏覽器本地時間。

## 與三階段工作流的關係

快速套用、Modal 儲存、切換篩選及預覽不寫入 YouTube。確認編輯並公開後，每片只有必要 parts：文字＋公開合併為一次 `videos.update(part="snippet,status")`、50 units；僅文字或僅公開一次；已符合為 unchanged、0 write。來源、逐片即時重驗與未知結果的唯讀核對另計。202 受理與本機 operation polling 不消耗 YouTube 配額。

清理 To-Post 完全不使用 `videos.update`／`videos.delete`，只移除預覽授權且刪除前仍為 public 的確切清單成員。重複影片的每個 item 獨立計數、各需 50 units。每次實際 delete（含內部 retry／slot fallback）均重新讀取成員對應與 public，並保留刪除前後存在性確認。private、unlisted、未公開排程、查不到或讀取失敗均保留。

以 `n` 筆清單項目、`p=ceil(n/50)` 估算全部可清理的保守成本：`playlistItems.list = p*(2+n)+2*n`，`videos.list = p+n`，`playlistItems.delete = 50*n`，合計 `p*(3+n)+53*n`。0 筆為 0。這包含預覽／執行清單讀取、每次 guard 的完整成員分頁、逐片 privacy 與前後存在性確認；非候選項目不實際 delete。quota estimate、cost_for 與 max_items_today 使用同一公式。額外 retry、確認讀取、reconcile 成本另計，均逐筆經過 ledger。

刪除回應遺失先唯讀確認，已確認不存在不重刪；確認無法取得則維持待核對。已收到 delete 成功但尚未反映時只重試確認讀取。內部最多三輪、間隔 0.5／1 秒；每次真正重刪仍須新的 public guard。備援 slot 必須仍為同頻道。歷史曾公開不構成清理授權。

YouTube 設定的預設播放清單與 quota 仍為獨立儲存動作。請持續保存完整 `data/` volume，包括 ledger、journal、session、帳號狀態與加密憑證。
