# 持久作業紀錄與唯讀核對

`data/operations.sqlite3` 是操作事實的唯一來源。SQLite schema v2 以交易從 v1 升級，保留 document v1 可讀性；新操作 document 為 v2。未知 schema／document 的備份拒絕還原。`youtube_video_state`、`youtube_cleanup_state` 為可從 journal 重建的索引投影，證據與投影在同一交易保存；provider 呼叫在交易外。

## 受理與防重送

- 同 owner／kind／request ID 的輸入不同時回 `409 operation_input_changed`；相同輸入傳回原 operation。不同 request ID 仍不能重跑同一已簽署計畫。
- `(owner, channel_id, video_id)` 原子保留寫入目標，涵蓋新背景發布、舊同步發布、batch update 與單片 metadata API。既有 active／unknown 操作亦納入保護。確認完成或確定未嘗試的目標可釋放；未知結果須先核對。
- 不保存 OAuth 或 preview token。已受理背景計畫保存原預覽到期時間；排隊不延長簽章效期。stage token 僅用來核實原草稿，不能重授權 preview。
- `GET /operations` 仍為最近 100 筆；`GET /operations/{id}` 本機讀取。request 索引查找與歷史投影不受這個限制。

## 三階段 YouTube 工作流

① 快速套用只讀 Sheet／YouTube 並建立本地草稿。② 編輯草稿並公開以最終手動內容預覽，確認後 `POST /youtube/drafts/publish-jobs` 回 202 `{version:1, operation_id, state, progress}`。③ 清理 To-Post 使用 cleanup v2 確認，只呼叫 `playlistItems.delete`，成功發布不自動清理。

`GET /youtube/drafts/publish-jobs/by-request/{request_id}` 在登入 owner 與目前授權 channel 內精確恢復；舊 pending 沒有 request ID 時，`by-stage/{stage_id}` 只接受唯一匹配，歧義回 409。舊 `POST /youtube/drafts/publish` 維持同步回應並共用執行核心。

progress v1 初始化全部影片，獨立於 provider attempt 列表；`revision` 單調遞增。queued、running、succeeded、unchanged、skipped、failed、not_attempted、needs_reconciliation 互斥，總和等於 total。unchanged 表示目前已符合，不表示曾成功寫入。前端每秒讀取 operation，一次一個查詢；失敗退避 2／5／10 秒並遵守 Retry-After。格式、身份或計數不符時保留 pending、已知成果與手動文字。

## runner 與狀態恢復

runner 由 `create_app()`／lifespan 組裝，預設最多受理 4 個執行中／排隊作業、逐批依序執行。滿載或停止受理回 503／Retry-After，不能先建立永遠無法執行的 accepted job。入列失敗則持久標示未寫入。

工作僅攜帶 owner／channel／slot 與持久計畫 ID，從 app-owned credential repository 重新取得權限，明確注入設定、配額、client factory 與 recorder，不沿用 HTTP Request。worker 重新檢查授權、Sheet／清單、預覽效期及每片最新資料。

Linux Docker 僅支援**單一 uvicorn process／單一副本**。OS file lock 排除共享同 store 的另一 runner；SQLite 記錄 executor 身份、狀態及 heartbeat。heartbeat 過期不授權接手或重送。重新啟動取得獨占鎖後，保留已知成果、running 列轉待核對、queued 列轉 not_attempted，永不自動續送。關機停止受理並清除尚未執行的 queue，有限等待目前工作；仍存活的 worker 繼續持有鎖與所有權。

prepared／running 只有可信 active owner 才顯示執行中。completed 是已確認完成；partial 保留已知成果；needs_reconciliation 表示結果未知；failed_before_write 表示確定尚未寫入。未知不是失敗或成功，也不是重試許可。

## 證據、投影與安全跳過

人物成功須有實際 snippet parts、可信 person_key 與回應／唯讀核對證據。status-only、unchanged、無人物關聯或舊紀錄缺 parts 均不能建立人物套用成功。新失敗不抹除舊成功，pending 另外保留並阻擋寫入。事件依穩定順序投影，較舊核對不能覆蓋較新的成功內容。

指紋為 version 1 canonical JSON（title、description）的 SHA-256，只把 CRLF／CR 轉 LF，保留空白與段落。prepare 只有在人物、目標指紋、可信歷史、最新遠端文字、public 全部一致且無 pending 時回可撤銷 default_skip；前端不可僅依 applied 排除影片。

cleanup 投影以 `(owner, channel_id, playlist_id, playlist_item_id)` 隔離。同影片重新加入產生的新 item，不沿用舊移除證據。

## 唯讀核對與備份

`POST /operations/{id}/reconcile-youtube` 只讀 provider。執行中回 409，頻道不同拒絕；新發布核對最終文字與 public，新 cleanup 只核對該 item 是否移除，不要求影片一直維持 public。保留舊 publish＋cleanup 兩階段的歷史解讀。`reconcile-music` 仍唯讀檢查順序；新歌單無已知 ID 時不得再次建立。

`OperationStore.backup(path)` 使用 SQLite backup API 取得一致快照；`restore` 僅供停止服務後離線維護。恢復前驗證 integrity、schema、document，保留原 journal。**YouTube 已有寫入後，不能直接還原舊 DB 而丟失防重送證據**；須保留新 journal 並逐項核對外部狀態。回退優先停用新受理，保留 store／reconciler／cleanup-only 修正。
