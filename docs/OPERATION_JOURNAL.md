# 持久作業紀錄與對帳（TB-09）

保留原有同步批次更新、發布與歌單排序端點，成功回應新增 `operation_id`。`request_id` 為可選欄位；舊呼叫端以完整輸入與簽署預覽產生穩定識別。同一帳號、操作、請求 ID 與輸入版本在 SQLite 同一交易中確認受理，不會因重送、程序重啟或新增另一個請求 ID 重跑同一份已受理計畫。重新預覽的 token 包含隨機 nonce，以區分使用者重新核對後的新計畫。

新資料為 `data/operations.sqlite3`，schema 與 document version 均為 1。資料包含來源、頻道、計畫、輸入摘要、遠端 ID、各寫入階段與回應證據；不保存 OAuth token 或 preview token。舊 JSON、已退役憑證與外部影片沒有轉換或刪除。維持原本 `data` Volume 掛載即可保存新紀錄。

每次 provider 寫入前先落盤 running 階段，收到回應後再保存證據。無法確認的寫入保留 `needs_reconciliation`，不能憑本機 request ID 宣稱外部 exactly-once。公開與清理分開記錄；清理期間配額例外可能發生在 delete 後，保守標成待核對。既有 provider 內部的存在性檢查與確認讀取仍保留。

- `prepared`：受理紀錄已保存，尚未開始服務流程。
- `running`：流程正在本程序執行。未在本程序活動集合中的 prepared/running 讀取時視為待核對，可能是中斷或另一程序執行中；不自動接手。
- `completed`：同步流程已確認完成，或遠端讀取符合完整計畫。
- `partial`：保留已知成功與未完成項目。
- `needs_reconciliation`：有結果不明的階段；查詢與核對不重送任何寫入。
- `failed_before_write`：在進入寫入前失敗。

`GET /api/v1/operations` 回傳目前帳號最近 100 筆紀錄；`GET /api/v1/operations/{id}` 查單筆。帳號 B 不能查帳號 A 的 ID。前端 `/operations` 提供證據匯出與對帳入口。

`POST /api/v1/operations/{id}/reconcile-youtube` 使用目前獨立 YouTube 授權讀回影片標題／說明或公開狀態與清單成員；頻道必須相符。未嘗試或缺少證據的項目不能當作完成。`reconcile-music` 以音樂連線讀回清單順序。新歌單沒有已知 ID 時維持待核對，請使用者在 YouTube Music 核對，不能再次建立。

對帳只證明目前遠端狀態是否符合計畫；即使吻合，也不改寫歷史上已知的回應證據。其他程序仍可能執行中時，不能將核對當成取消或接手。需要再次執行者必須重新讀取來源與預覽，原快照不會獲得新的寫入授權。

`OperationStore.backup(path)` 使用 SQLite backup API 取得一致快照。還原僅限停止服務的離線維護：先備份目前檔案，再 `OperationStore(...).restore(backup)`；還原前檢查 SQLite integrity、schema 與 document version，未知版本拒絕。測試涵蓋並行受理、防重送、程序重新組裝、逐項成功／未知、帳號隔離、provider 唯讀對帳、備份還原與拒絕壞版本；也確認既有 notes JSON 不受新紀錄影響。這不替代正式部署回退演練。
