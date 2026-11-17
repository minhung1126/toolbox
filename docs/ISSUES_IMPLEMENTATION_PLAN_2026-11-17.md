# Toolbox 全 issue 整合修改計劃（交付 6.1-sol）

本文件是實作交接計劃。本輪只建立文件，尚未修改產品程式或執行功能測試。

## 1. 範圍、查核基準與優先順序

- 專案：<https://github.com/minhung1126/toolbox>。
- 查核日期：2026-11-17 UTC。已讀全部 issue 本文及留言；16 個 issue 均無留言。以 REST `issues?state=all&per_page=100&page=1` 交叉核對，共 22 筆，其中 6 筆為 PR，真正 issue 為 16 個；目前沒有開啟中的 PR。
- 最新 main：`be7cd22f468db976c8111d7657cd54af35105162`，已合併 [PR #21](https://github.com/minhung1126/toolbox/pull/21)，完成 #16／#17／#18。
- 本工作區起始版本：`fa6df9d947a5724291984debb54b751a7b068b79`。**實作必須從含 PR #21 的最新 main 開始，不可在這個舊工作區直接重做 #16–#18。** 本計劃已以 GitHub 最新 main 的變更檔案對照本機程式。
- 開啟中的 #19、#20、#22、#23、#24 合成一個 YouTube 工作流改版；已關閉 issue 作為相容性及回歸要求，不重新開發。
- 優先級：先消除清理頁的發布副作用，再建立可靠進度／紀錄，最後整合安全跳過、資訊架構及視覺呈現。

### 全 issue 對照

| Issue | 查核狀態 | 本計劃處理方式 |
| --- | --- | --- |
| [#3](https://github.com/minhung1126/toolbox/issues/3) 共用 UI／語意樣式 | 已關閉 | 沿用 shared/ui、tokens、feature CSS；P8、P9 驗證 |
| [#4](https://github.com/minhung1126/toolbox/issues/4) API 契約／型別 | 已關閉 | 新增契約有 TypeScript 與執行期驗證；P1、P5、P7 |
| [#5](https://github.com/minhung1126/toolbox/issues/5) 能力／權限矩陣 | 已關閉 | 新端點沿用授權，缺權限在 provider 呼叫前拒絕；P9 |
| [#6](https://github.com/minhung1126/toolbox/issues/6) singleton／context | 已關閉 | runner 與 provider 必須 app-scoped；P4 做雙 app 隔離 |
| [#9](https://github.com/minhung1126/toolbox/issues/9) 依賴公告 | 已關閉 | 不為本次改版升級工具鏈；P9 執行現行 audit 門檻 |
| [#10](https://github.com/minhung1126/toolbox/issues/10) 跨平台視覺 | 已關閉 | Linux Chromium、Windows Edge 分開驗證；不混用基準 |
| [#13](https://github.com/minhung1126/toolbox/issues/13) 照片指定位置 | 已關閉 | 不修改 Instagram 排序；保留全套回歸 |
| [#14](https://github.com/minhung1126/toolbox/issues/14) 草稿後單次編輯公開 | 已關閉 | 保留草稿、簽署預覽、單次寫入；舊清理規則由 #19／#24 更新 |
| [#16](https://github.com/minhung1126/toolbox/issues/16) 已套用篩選 | 已關閉 | 保留篩選 UI 與預設「全部」；P6、P7 擴充證據及自動跳過 |
| [#17](https://github.com/minhung1126/toolbox/issues/17) 暫存導航／彈窗 | 已關閉 | 重用現有頁面與 Dialog；P8 僅改善文字層次 |
| [#18](https://github.com/minhung1126/toolbox/issues/18) 建草稿按鈕 | 已關閉 | 保留 `prepareDraftAvailability()`、原因提示與取消／重試保障 |
| [#19](https://github.com/minhung1126/toolbox/issues/19) 僅清理 public | 開啟 | P2、P3；以 playlist item 為單位、刪除前即時核實 |
| [#20](https://github.com/minhung1126/toolbox/issues/20) 持久化／安全跳過 | 開啟 | P1、P6、P7；journal 投影，不另建第二套真相 |
| [#22](https://github.com/minhung1126/toolbox/issues/22) 標題描述可讀性 | 開啟 | P8；完整文字、清楚標示最終內容 |
| [#23](https://github.com/minhung1126/toolbox/issues/23) 逐片發布進度 | 開啟 | P1、P4、P5；202 受理＋後端作業＋唯讀 polling |
| [#24](https://github.com/minhung1126/toolbox/issues/24) 三階段分工 | 開啟 | P2、P3、P7、P8、P9；名稱與實際副作用一致 |

### 已裁定的需求交集

1. #14 當時要求保留「先公開再清理」；最新 #19／#24 明確改為只清理已公開項目，以後者為本輪目標。保留 #14 的草稿發布行為。
2. #17 的「精簡」指減少多餘留白，不限制描述高度；#22 強化可讀性，最終標題與描述皆完整呈現。
3. #16 的「歷史上已套用」與 #20 的「這次可安全跳過」分開：篩選仍預設全部；只有本次目標、可信歷史與最新遠端內容一致時才預設略過。
4. #20、#23 共用 journal 證據與狀態更新。逐片進度可以先完成，不等待歷史投影／自動跳過 UI。
5. 跨瀏覽器一致的是已確認的處理紀錄；本輪不把未送出的本地草稿全面搬到伺服器，也不建立虛擬 To-Post。

## 2. 最終產品行為與不可破壞條件

| 階段 | 入口／CTA | 可做的事 | YouTube 寫入 |
| --- | --- | --- | --- |
| ① 快速套用 | Video／Shorts 快速套用；「套用人物並建立草稿」 | 選人物、讀 Sheet、建立本地草稿、顯示歷史狀態 | 0 次 |
| ② 編輯草稿並公開 | 側欄直接進入、類型切換；「確認編輯並公開」 | 全文閱讀、彈窗編輯、還原、略過、預覽、二次確認、發布進度 | 僅確認後必要的 `videos.update` |
| ③ 清理 To-Post | 可獨立開啟；「清理已公開影片」 | 核實 public、預覽確切項目、確認後移除成員 | 僅 `playlistItems.delete` |

- ② 成功後只提供「前往清理 To-Post」，不自動清理；③ 不要求先跑①②。
- 保持既有五個 URL：`/youtube/drafts/videos`、`/youtube/drafts/shorts`、兩者的 `/staged`，以及 `/youtube/publish-cleanup`。保留儲存 key、帳號／頻道／類型隔離及舊草稿讀取。
- 文字＋公開同時需要修改：一次 `videos.update(part="snippet,status")`、50 units；僅文字或僅公開：一次對應 part；都符合：0 次。保留 tags、category、語言及可寫 status；不回寫唯讀欄位。
- 未指定人物或使用者略過者不可被公開。手動編輯內容優先，preview 及 execute 不重新以 Sheet 覆蓋。
- `private`、`unlisted`、排程未公開、查無資料、權限／quota／API 異常者不清理。歷史「曾公開」不是刪除授權。
- `needs_reconciliation` 不代表失敗，也不代表成功；不盲目重送。唯讀核對不能替仍在執行的作業宣告完成。
- 不新增或使用 yt-dlp。沿用 Primary／Secondary 配額機制，切換後仍核對同頻道。
- 維持 `.agents/AGENTS.md` 的錯誤格式、app factory、共享 UI、測試資料隔離與禁止匯入時建立 executor 等要求。

## 3. 程式現況與需補的缺口

| 已查核入口 | 現況 | 修改焦點 |
| --- | --- | --- |
| `services/youtube_workflows.py::run_publish_and_cleanup` | 仍先 `set_video_public` 再刪清單項目 | 改 cleanup-only；不能只更名 UI |
| `services/youtube_service.py::remove_playlist_item` | 有存在性核對、確認讀取及可能的 delete 重試 | 每一次真正 delete（含內部重試／slot fallback）前都要重驗 public |
| `services/youtube_draft_publish.py::execute` | 同步逐片收集，最後才回傳；無變更與手動略過都回傳 skipped | 每片落盤進度；區分 unchanged；保留最少寫入 |
| `services/operation_journal.py` | `_active` 是 process-global set；`public_operation` 會把非本程序 active 的 prepared/running 當中斷 | 新背景工作必須有 app-scoped runner 與可信執行擁有權 |
| `core/operation_store.py` | SQLite schema/document v1；操作 JSON、claim、防重送；歷史查詢掃過全部 metadata operations | 增加索引、作業目標保留、批次狀態投影及遷移 |
| `services/youtube_edit_status.py`（main） | 成功的 metadata／metadata_publish item 即算 applied，未檢查實際 parts／人物證據 | 不能把 status-only 公開或無人物 metadata 改動算成人物套用 |
| `pages/DraftPublishPage.jsx`（main） | `await publish()` 等整批；核對從最近 100 筆 operations 找 stage | 受理後 polling；以 operation ID／request ID 精確恢復 |
| `model/draftPublishStorage.ts`（main） | `pending` 保存送出 payload，但無獨立 operation 追蹤版本 | 向後相容增加 operation reference；未知結果保留鎖定 |
| `draft-publish.css`（main） | 描述完整換行，但使用 `--text-muted` | 提升描述對比、字級、行距，保留全文 |
| `manifest.js`／後端 `creator_tools.py` | 前後端目錄與產品文案仍有草稿／發布混用 | 同步改標題、導覽、卡片、能力說明 |

表內後端相對路徑皆位於 `backend/app/`，前端相對路徑位於 `frontend/src/features/youtube/`。

## 4. 先固定契約，避免 6.1-sol 邊寫邊改架構

### 4.1 證據、進度與投影

沿用 `operations.sqlite3` 作唯一操作事實來源。增加可重建的查詢表；不是在 localStorage 或另一個 JSON 儲存成功旗標。

- `youtube_video_state` 主鍵 `(owner, channel_id, video_id)`：保存可信人物套用證據、`person_key`、最終內容指紋、時間及 operation ID；公開狀態是附 `checked_at` 的觀察值；另存待核對 operation／錯誤資訊。`video_type` 只用於顯示，不放入主鍵。
- `youtube_cleanup_state` 主鍵 `(owner, channel_id, playlist_id, playlist_item_id)`：含 video ID、confirmed removed／unknown／failed 證據、時間及 operation ID。新加入清單產生新 item ID，不沿用舊移除紀錄。
- 內容指紋使用版本化 canonical JSON（title、description），僅將 CRLF／CR 換為 LF，再 SHA-256；保留有意義的空白、段落。人物鍵沿用現有穩定 `person_key`，不拿顯示名稱當唯一鍵。
- 每個寫入證據記錄實際 `parts`、人物鍵、目標指紋、是否有嘗試寫入、回應確認／唯讀核對來源。`status`-only 只更新公開觀察；`snippet` 寫入且有可信人物關聯才建立人物成功紀錄。
- `unchanged` 是「已符合／無須更新」，不捏造曾寫入；歷史無足夠證據為 unknown。新失敗不抹除舊成功，但 pending reconciliation 仍阻擋新寫入。
- journal evidence 與投影在同一 SQLite 交易更新；外部呼叫不得在交易內。投影失效可由 journal 重建，不反向修改歷史證據。
- 新進度使用 operation document 的版本化 `progress` 區塊，不把 journal 的「每次寫入 attempt」直接當成「每支影片」；同影片可能有 fallback attempts，也可能完全不需寫入。
- `progress.rows` 從已簽署計畫初始化所有影片，欄位至少包含 video ID、最終標題／描述、狀態、原因、`attempted_parts`、確認資訊；清單項目額外含 playlist／item ID。增設單調 `revision`。
- `progress.counts` 為互斥分類：queued、running、succeeded、unchanged、skipped、failed、not_attempted、needs_reconciliation。總和必須等於 total。UI 的「已處理」不暗示全部成功。

發布狀態：`queued → running → succeeded | unchanged | failed | needs_reconciliation`；使用者略過為 `skipped`；quota 等阻止開始為 `not_attempted`。核對可將未知轉為已確認，但不自動再寫入。

### 4.2 發布受理與進度 API（新增；前綴 /api/v1）

| API | 契約 |
| --- | --- |
| `POST /youtube/drafts/publish-jobs` | 使用現有 DraftPublishInput、必填 request_id；驗證授權與 signed plan 後持久受理，回 202 `{version:1, operation_id, state, progress}`，不等待批次完成 |
| `GET /youtube/drafts/publish-jobs/by-request/{request_id}` | 依登入 owner＋目前授權 channel 精確查找；用於 202 遺失。不受最近 100 筆限制；不存在回 404 |
| `GET /operations/{operation_id}` | 既有 API，新增可選 progress/revision；本地讀取，不每輪查 YouTube |
| `POST /operations/{operation_id}/reconcile-youtube` | 既有唯讀核對，補新進度與投影更新；執行中回 409，跨頻道拒絕 |

同 request ID、相同內容重複 POST：回原 operation，不重新排程；內容不同回 409 `operation_input_changed`。不同 request ID 但同一已簽署計畫亦不得繞過 claim。

單靠 request ID 不防止兩份新預覽競爭同影片：另用 SQLite 原子保留 `(owner, channel_id, video_id)` 寫入目標；已有 active／unknown 作業時回 409。新 async 與舊同步發布端點都使用相同保護。已確認完成／確定未寫入可釋放，未知必須先核對。保留既有同 stage 成功列鎖定規則。

舊 `POST /youtube/drafts/publish` 暫留同步契約，委派同一個執行核心，禁止保留第二份發布演算法。舊前端可以完成既有流程，新前端切換 publish-jobs。一般 metadata-update API 的相容性保留，但不得成為新快速套用／清理頁的寫入入口；涉及相同影片的寫入也須尊重未解決作業的保護。

### 4.3 runner 決策

採 **app-scoped、有界背景 runner＋SQLite 持久紀錄＋polling**，本輪不引入 Redis／Celery／SSE。現有 Docker 以單一 uvicorn process 啟動；保持單 worker 部署要求，不能宣稱支援多副本。

- runner 在 `create_app()`／lifespan 組裝與啟停，可注入可控 fake；預設逐批依序執行，queue 有上限，滿載時在受理前回 503／Retry-After，不建立永遠無法執行的 accepted job。
- 工作只攜帶持久化計畫與 owner/channel/slot 識別；憑證由 app-owned repository 重新取得，明確注入 settings、credential、quota、client factory 與 recorder。不得捕捉整個 Request 或依賴 HTTP middleware context 在回應後繼續有效。
- claim、進度初始化與目標保留先落盤，再入 queue；入 queue 失敗保存明確 failed-before-write。進入 worker 後重新核實授權、來源、stale preview，再逐片寫入。
- 排隊過久導致預覽過期：標記未寫入並提示重新預覽，不放寬 token 時效。
- 程序／runner 擁有權與 heartbeat 存於 store；只有可信 active owner 能顯示 running。避免現有 `_active` 把已排隊但尚未執行的工作誤報中斷，也避免另一個程序單憑本地 set 誤判。
- 啟動恢復只處理已確認失去執行者的作業；不得以過期 heartbeat 自動接手並重送。曾 running 的列保守轉待核對；可證明未開始的 queued 列為 not_attempted，保留逐片成果。
- graceful shutdown 停止接新工作、有限等待；未完成紀錄保留。程序重啟恢復的是狀態與核對能力，不默默續送未知寫入。
- 檢測到不支援的重複執行者／多程序共享 queue 時拒絕啟用新 runner，勿把 process-local lock 當跨程序保證。

### 4.4 清理 API 與相容性

- 新增 `POST /youtube/cleanup-preview`：讀取確切 playlist items 與最新影片狀態，回 version 2 snapshot、候選／保留理由、各分類數量、quota、signed token。簽名包含 `mode=cleanup_only`、owner、channel、playlist、精確 item/video 對應及快照。
- 沿用既有 `POST /youtube/publish-and-cleanup` URL 作 cleanup-only 相容入口；內部改呼叫 `run_to_post_cleanup`，沒有 publish 分支。新 request／result 明確 `version:2, mode:cleanup_only`；前端 wrapper 命名 `cleanupPublicItems`。
- 舊清理 preview token 必須回 409 stale_preview，要求刷新新版預覽；不能把舊「公開並清理」確認自動轉成另一種操作。新舊前端／後端應一起發版。
- operation kind 暫留 `youtube.publish_cleanup`，以 document 中的 version/mode 區分新舊語意；歷史操作展示與 reconcile 保留對舊 publish＋cleanup 兩階段的解讀，新操作只依清單成員是否移除判斷清理成功。
- 新版結果以 playlist item 為單位，含 video ID、item ID、observed privacy、status、reason；顯示數量與配額依 item 數，不能以去重影片數代替。前端契約驗證 identity、列數、互斥計數，未知／格式不符不得當成功。
- quota 排除所有 `videos.update`；每個確定需要移除的 item 為 50 units，加實際分頁、隱私重驗與前後存在性確認讀取。額外 retry／reconcile 分開列明。同步更新 `_quota_estimate` 的 breakdown、`cost_for`、`max_items_today`，不只改畫面數字。

### 4.5 狀態查詢與安全跳過

- 保留 #16 既有狀態端點及 `{channel_id, statuses}` 契約；用新投影供值，保留 applied/not_applied/unknown 語意。
- 新增批次 `POST /youtube/video-processing-status`，最多 500 個 video IDs；owner/channel 只能由授權解析，不能信任客戶端傳值。回傳可信歷史、上次公開觀察、pending 等資料。索引查詢，不全掃歷史 JSON。
- 最終的 default skip 由後端 `prepare` 在解析人物與本次目標文字、讀最新 YouTube 資料後計算；前端不能只看到 applied 就移除影片。
- 可自動跳過須同時符合：可信人物＋snippet 成功紀錄、相同人物鍵、相同目標指紋、最新遠端文字相同、目前已 public、無 pending。若遠端已改回 private/unlisted，保留進入②以處理公開，或明確顯示仍待公開，不得整片默默排除。
- changed person/template/text、unknown、沒有人物紀錄但已 public 都可處理。結果未知先核對；強制納入不繞過 pending、權限與 stale-preview。
- prepare 回傳獨立 `default_skip`／`skip_reason`／可重新納入資訊，不把可撤銷的預設跳過混同現有不可編輯的 `status=skipped`（未選人物等）。單片與批次「重新編輯／強制納入」可覆寫預設，仍保留最少必要寫入。

## 5. 6.1-sol 的執行任務

採一個整合分支、循序的小 commit。每個任務完成相關測試後才接下一個；不按 issue 分別重寫同一個頁面。表中「新增」檔名是建議落點，既有檔案以符號定位，不依賴行號。

### P0：同步基準並建立可續作紀錄

依賴：無。

1. 讀 `.agents/AGENTS.md`、本文件、`docs/OPERATION_JOURNAL.md`。查看工作區差異並保護使用者既有修改。
2. fetch 最新 main，建立隔離 worktree／分支（例如 `codex/youtube-integrated-workflow`）；確認包含 `be7cd22`。若 main 又有新提交，先比對 issue 與差異，只調整本計劃受影響部分。
3. 確認 PR #21 的 `youtube_edit_status.py`、`prepareDraftState.ts`、staging Dialog 與測試已存在。記錄確切基準 SHA。
4. 依第 7 節跑一次基準檢查；建立 `docs/YOUTUBE_INTEGRATION_PROGRESS.md`，記錄每個 P 任務狀態、commit、測試、剩餘事項。

完成條件：新任務從最新程式開始；既有失敗與本次新增失敗可區分。

### P1：共用 store、進度／證據契約與遷移

依賴：P0。涵蓋 #20／#23 的共同基礎。

檔案：`backend/app/core/operation_store.py`、`backend/app/services/operation_journal.py`、`backend/app/api/youtube_models.py`；新增 `backend/tests/test_youtube_operation_state.py`。

1. 建立明確 schema v1→v2 遷移（交易、冪等、拒絕未知版本），新增兩個投影表、request 查找索引與寫入目標保留資料。保留舊 document v1 可讀性。
2. 實作 progress 初始化／逐列更新／單調 revision／互斥計數，以及證據欄位。不要在既有 `Recorder.write()` 的 attempts 列表塞假的 queued 寫入。
3. 原子 claim、同一計畫去重及同影片衝突保護；初始化時將可信的舊 active／unknown 操作納入保護，不能只保護新 operation。
4. 更新 backup／restore 的 schema 驗證，覆蓋舊版升級後備份、恢復、未知版本拒絕；不清空原 journal。

驗收：v1 fixture 重複升級結果相同；同 request 並行受理一次；不同 request 同影片不得並行寫；不同帳號／頻道不互鎖；交易失敗不產生半份證據／投影；無 import-time I/O。

### P2：清理後端與核對改為 cleanup-only

依賴：P1。主要完成 #19 後端。

檔案：`backend/app/services/youtube_workflows.py`、`youtube_service.py`、`youtube_workflow_ports.py`、`backend/app/api/youtube.py`、`youtube_models.py`、`operations.py`；測試 `test_youtube_publish_cleanup.py`、`test_youtube_service.py`、`test_youtube_quota.py`、`test_youtube_routing.py`。

1. 建立 cleanup-preview、精確 item 級計畫、候選／保留原因及新版簽章；verify 在任何 delete 前完成。
2. 移除該流程全部 `set_video_public` 與 metadata update；保留其他功能仍使用的 helper，避免全域刪函式。
3. 每個 item 寫入前重新讀該 video 的 privacy 及確認 item 對應正確 playlist/video；只有 public 可繼續。預覽不在候選的項目即使後來變 public，也留待重新預覽。
4. 修改 `remove_playlist_item` 的安全邊界：可加入明確 pre-delete guard，讓每次實際 delete（包含內部 retry）與 slot fallback 都重新驗證，不能只在外層第一次檢查。
5. delete 結果未知先做唯讀確認，無法確認保留 pending；明確不存在才確認移除。重試同一 item 前仍重驗授權、成員及 public；新同 video item 不受舊紀錄影響。
6. 更新新舊 operation 的 reconcile 分支與 item 級結果／配額；新清理成功只證明該成員已移除，不要求影片永遠維持 public。

驗收：`videos.update`／`videos.delete` 呼叫皆為 0；public→private（含兩筆 duplicate item 中途變更）停止刪；未知／讀取失敗／跨頻道無寫入；兩個同 video item 分別計數；delete 回應遺失、quota fallback 不盲重送；0 候選不呼叫寫 API；舊 token 拒絕。

### P3：清理前端與第三階段命名

依賴：P2。

檔案：`frontend/src/pages/PublishCleanerPage.jsx`、`features/youtube/api/publishCleanupApi.ts`、`publishCleanupTypes.ts`、`services/api.js`／`api.d.ts`、`features/youtube/manifest.js`、後端 `tools/builtin/creator_tools.py`。

1. 移除本頁單片 metadata 編輯、發布按鈕與相關呼叫；改用新版清理預覽與 item 級結果。
2. 顯示 public／private／unlisted／未知數量及保留原因；確認視窗說明只移除清單成員。部分失敗、待核對與 quota 中止各自呈現。
3. 導覽、卡片、頁面及通知將本功能統一稱「清理 To-Post」，主 CTA「清理已公開影片」。保留原 URL。
4. 更新 API runtime validator，尤其新增 needs_reconciliation，不能用 succeeded_with_warnings 模糊宣稱整片完成。

驗收：清理頁沒有 metadata／public 寫入入口；0 候選有明確空狀態；核對／重新預覽不重刪成功 item；單元及現有清理 E2E 更新並通過。

### P4：發布背景受理與逐片進度後端

依賴：P1；建議在 P3 後循序做，減少共用檔衝突。主要完成 #23 後端。

檔案：`backend/app/main.py`、`api/youtube.py`、`api/operations.py`、`services/youtube_draft_publish.py`、`services/operation_journal.py`；新增 `services/youtube_publish_jobs.py`、`backend/tests/test_youtube_publish_jobs.py`。

1. 依 4.2／4.3 組裝 runner、202 受理、request 查找及進度讀取；共享同步發布核心。
2. 在 execute 每列開始／結束落盤，包含 unchanged、skipped、failed、not_attempted；不能只有真正發生 update 的影片才有進度。
3. response 確認或可靠唯讀核對完整最終目標後才標 succeeded；僅 metadata 成功但公開未核實，顯示具體原因並維持待核對。
4. 明確證據與本次實際 parts 傳入 recorder。避免 recorder 把所有 `update_and_publish_video` 都無條件當人物 metadata 成功。
5. 完成 queue 滿載、入列失敗、shutdown、重啟、active ownership 與同影片並行保護。更新 `public_operation` 及 reconcile 的 active 判斷。

驗收：用可控 fake provider 阻塞第 2 片，202 已回且第 1 片可由 GET 讀到成功；第 3 片失敗／timeout，其他列有明確實際結果；重複請求僅一作業；跨 app 的 store／設定／client 不串；程序中斷不重寫；polling 本身不消耗 YouTube quota。

### P5：發布前端 polling、恢復與結果呈現

依賴：P4。

檔案：`features/youtube/pages/DraftPublishPage.jsx`、`api/draftPublishApi.ts`、`model/draftPublishStorage.ts`、`services/api.js`／`api.d.ts`；新增 `hooks/useDraftPublishOperation.ts` 與對應測試。

1. 二次確認時先持久保存 request ID／最終 payload，確認保存成功才送出；202 後保存 operation ID，立即呈現全部 rows。
2. 用相同 operation ID 查詢；正常約 1 秒一次、一次只一個 in-flight 查詢，失敗退避至 2／5／10 秒，遵守 Retry-After；停止／離頁取消查詢，不取消已受理寫入。429／網路錯誤顯示暫停更新而非宣稱失敗。
3. 重整／返回從 pending 恢復；沒有 operation ID 時用 by-request 查找，不能只掃最近 100 筆，也不能產生新 ID 重送。尚查不到時保留「受理結果待確認」，提供查詢或相同 ID 的冪等受理重試，不自動建新作業。
4. 契約驗證 operation、channel、stage、所有 video IDs、revision、總數與分類；忽略舊 revision／已切換頻道的晚到回應。格式錯誤保留 pending 與成果。
5. 每列文字狀態與整體計數即時更新；已符合／略過分開。執行期間鎖定會改變計畫的編輯／還原；已成功列保留，失敗／未嘗試重試須重新預覽，unknown 先核對。
6. 舊 pending payload 不需清除：用已保存 request ID 查找；若歷史無 ID，提供以 stage 精確查找的相容恢復（後端查全歷史並排除歧義），不可選錯同 stage 的另一版本。

驗收：fake timers＋分階段 API 回應驗證真正進度；刷新、202 遺失、polling 斷線、切換帳號／頻道、雙點、契約壞資料都不重送；保留原手動編輯與 localStorage 保存失敗處理。

### P6：歷史證據投影、批次狀態查詢

依賴：P2、P4。主要完成 #20 後端。

檔案：`core/operation_store.py`、`services/youtube_edit_status.py`、`services/operation_journal.py`、`api/operations.py`、`api/youtube.py`；可新增 `services/youtube_processing_state.py` 與測試。

1. 將新發布／清理／唯讀核對的確認證據投影；只更新有證據的維度。
2. 回填舊 journal：結合 stage 人物鍵、signed preview 的 parts 與逐項成功／核對結果；缺人物、缺 parts 或僅 status 的紀錄，不建立「成功套用人物」事實。無法確定一律 unknown，不能因操作名稱含 metadata 就推定。
3. 對操作／attempt 有穩定排序，較舊核對不能覆寫較新的確認觀察；歷史成功與最新 pending 分別保留。
4. 新增批次查詢 API；既有 #16 endpoint 改由同一投影映射。可重建索引、同一事件重投影冪等。

驗收：snippet-only／snippet+status／status-only／unchanged／無人物改字分別正確；失敗不抹舊成功；核對後更新；超過 100 筆歷史仍能查；重啟／另一個 client 結果一致；跨帳號／頻道不可讀；重新加入 To-Post 新 item 獨立。

### P7：安全預設跳過與快速套用整合

依賴：P5、P6。

檔案：`services/youtube_draft_publish.py::prepare`、`api/youtube_models.py`、`frontend/src/pages/BatchUpdatePage.jsx`、`features/youtube/hooks/useVideoEditStatus.ts`、`api/videoEditStatusApi.ts`、`api/draftPublishApi.ts`、`model/draftPublishStorage.ts`、`model/prepareDraftState.ts`。

1. prepare 依 4.5 比對本次人物／最終文字與最新遠端內容，回傳可撤銷 default skip；查詢不到的歷史不可靜默剔除。
2. 保留 #16「全部／尚未套用／已套用／未知」及搜尋、分頁、已選人物；新增跳過原因與單片／批次強制納入。
3. 自動跳過是預設選擇，不能把手動改過的舊草稿覆蓋；生成新草稿仍沿用 #18 重建確認及取消。
4. 未公開但已完成文字者仍能走②，最終只做 status 更新；已公開但無人物紀錄者可改文字。
5. `prepareDraftAvailability` 保持 UI 與 handler 同源、具體 disabled reason、finally 解鎖，不重新引入與建立草稿無關的 quota spinner 阻塞。

驗收：目標相同可跳過；改人物／模板／手動文字／遠端文字或 privacy 可再處理；force include 可編輯但不增加無意義寫入；pending 不可被 force 繞過；篩選不觸發 provider 寫入；Video／Shorts、帳號與頻道一致。

### P8：完整視覺與三階段資訊架構

依賴：P3、P5、P7。完成 #22／#24。

檔案：`features/youtube/manifest.js`、`pages/DraftPublishPage.jsx`、`draft-publish.css`、`frontend/src/pages/BatchUpdatePage.jsx`、`PublishCleanerPage.jsx`、`backend/app/tools/builtin/creator_tools.py`、相關 Navbar／catalog／routes／Dashboard 測試、README。

1. 側欄依序 Video 快速套用、Shorts 快速套用、編輯草稿並公開、清理 To-Post、YouTube 設定；共用 staged 導覽的 activePaths 保留，補齊對應 dashboard 卡。
2. 三頁顯示階段及下一步；空狀態、麵包屑／近期入口、按鈕、通知、確認視窗與後端目錄文案一致。發布成功加清理連結，不自動導航觸發清理。
3. 最終標題清楚置頂、較大且較粗；描述有可見標籤、正文對比與合適行距。保留 `white-space: pre-wrap`、`overflow-wrap: anywhere`。主內容不設 line-clamp、ellipsis、固定高度／隱藏捲動裁切。
4. 原內容比對可維持次要 details；最終版本不得依賴展開。編輯按鈕易找，人物／ID／狀態不壓縮閱讀空間。Modal 重用 #17，儲存立即更新列表。
5. 390／768／1440 px、100 字標題、5,000 字描述、長連結、空行、鍵盤及目前實際支援的主題驗證；不為 issue 另增全站主題系統。

驗收：完整全文可直接讀；手機不溢位；Modal 儲存／取消／未存提示／焦點／Esc 不退化；所有產品入口名稱一致；URL 與舊草稿可恢復；本任務不改 provider 演算法。

### P9：跨階段驗收與交付

依賴：P0–P8 全部。

1. 新增／擴充 `frontend/e2e/youtube-staging.spec.ts`、清理與 workflow tests，使用 fake provider，不以使用者真實影片做測試。
2. 更新 `docs/OPERATION_JOURNAL.md`、`YOUTUBE_QUOTA.md`、`CAPABILITY_MATRIX.md`、`API_CONTRACT_AUDIT.md`、`DEPLOYMENT.md`、README；只更新受影響部分。
3. 執行第 6、7 節，保存精確 SHA、測試結果、畫面差異與未驗證事項至 progress 文件；不要引用舊檢查數字當本輪證據。
4. 產出一份整合變更說明與 issue→測試對照。只有符合完整驗收才列為完成；本計劃不要求自動發佈、合併或關閉 GitHub issue。

完成條件：5 個 open issue 各自有可驗證的完成證據，11 個 closed issue 的相關保障沒有退化。

## 6. 必須具備的情境驗收矩陣

| 情境 | 期待結果／實際寫入上限 | 主要任務 |
| --- | --- | --- |
| 快速套用、Modal 儲存、預覽、切篩選 | YouTube write 全部 0 | P7、P8 |
| private＋文字變更 | 確認後一次 snippet,status；50 write units | P4 |
| 已 public＋文字變更 | 一次 snippet；不清理 | P4 |
| 文字相同但 private | 一次 status；不新增人物編輯成功 | P4、P6 |
| 全部已符合但無可信歷史 | unchanged、0 write；不假造已套用 | P4、P6 |
| 10 片、第 3 片 timeout | 前 2 片立即可見；第 3 片真實核對結果；其他列完整保留 | P4、P5 |
| POST 回應遺失／刷新／兩分頁點擊 | 同 request 查到同 operation，成功片不重寫 | P1、P5 |
| 兩個不同 request／preview 同時寫同片 | 原子目標保護，最多一個 active writer | P1、P4 |
| 重啟時第 3 片剛寫入尚未保存結果 | 1、2 保留；3 待核對；未開始列 not_attempted；不自動重送 | P4 |
| 清理 public＋private＋unlisted＋unknown | 只有已確認 public item 可 delete；videos.update/delete=0 | P2、P3 |
| 預覽 public，delete 前／內部 retry 時改 private | 該 delete 不執行，保留原因清楚 | P2 |
| 同影片兩個 item，其中一筆移除結果未知 | item 級成功／pending 分開，不把整部影片算已清完 | P2、P6 |
| 已移除後重新加入同影片 | 新 item 可重新預覽、核實與清理 | P2、P6 |
| 有可信成功但遠端改文字／改 private | 不被舊紀錄靜默排除，重新預覽最少必要寫入 | P7 |
| 超過 100 筆操作、跨瀏覽器查詢 | 精確恢復作業、成功投影一致 | P5、P6 |
| 帳號／頻道／slot 切換與兩個 create_app | 不串資料；不讀寫別人紀錄；fallback 不跨頻道 | P1、P4、P6 |
| 100 字標題＋5,000 字多段描述＋長 URL | 全文顯示、手機無水平溢位，編輯即時反映 | P8 |

## 7. 驗證命令與交付證據

使用 Python 3.11+、Node 22；依 repository lockfile 安裝。pytest 已隔離暫存 `TOOLBOX_DATA_DIR` 並封鎖第三方網路，不得停用保護或讀真實 data。

每個任務先跑改動相關測試；程式完成時跑 AGENTS 要求的完整門檻。若環境不支援 Docker／Windows，明列未驗證，不能填 passed。

後端（repo root）：

```bash
python -m pip install -r backend/requirements-dev.txt
python -m ruff check backend
python -m ruff format --check backend
python -m pytest backend/tests -q
```

前端（frontend 目錄）：

```bash
npm ci
npm run format:check
npm run lint
npm run lint:styles
npm run typecheck
npm test -- --run
npm run build
npm run test:e2e
npx playwright test --config playwright.visual.linux.config.ts
npm audit --omit=dev --audit-level=high
npm audit --json
```

Windows／Edge 另跑 `npm run test:visual`。新增頁面視覺 fixture 使用固定字型、時間、資料與 reduced motion；先檢視實際畫面才更新 snapshot，不能用自動接受差異掩蓋退化。只在需要時安裝 Playwright Chromium。容器改動或最終 CI 依現有 workflow 做 Docker build／Compose 驗證，勿覆寫既有 `.env`。

## 8. 遷移、部署與回退界線

- 新表建立及回填必須在 SQLite 交易內冪等；透過 SQLite backup API 留存一致備份，測試 fixture 先演練。不可刪除使用者 data 或以重建空庫處理問題。
- 草稿讀取接受舊版欄位缺省，新增 pending operation reference；失敗時保留原始手動內容，不能自動清空 localStorage。
- 上線時整合前後端一起更新，使 cleanup v2 與發布受理契約匹配；舊清理 token 失效後明確要求重新預覽。
- schema v2 不保證舊 binary 可讀，且舊清理程式會恢復「先公開」副作用。因此回退優先停用新受理、等待／核對既有作業，保留新 store／reconciler／cleanup-only 安全修正，再回退受影響 UI 或 runner 功能。
- **已對 YouTube 寫入後，不能直接還原較舊 DB 備份而丟失防重送證據。** 災難還原需保留新 journal、逐項核對外部狀態；本輪不自動執行部署或真實帳號回退演練。

## 9. 可直接交給 6.1-sol 的執行指令

```text
請執行 toolbox 的 docs/ISSUES_IMPLEMENTATION_PLAN_2026-11-17.md。

先讀 .agents/AGENTS.md。以最新 main（至少包含 be7cd22／PR #21）建立
隔離分支或 worktree，保護使用者現有變更。依 P0→P9 循序實作，
每個任務做小 commit，更新 docs/YOUTUBE_INTEGRATION_PROGRESS.md，
記錄實際 SHA、改動、測試與下一步；沿用已完成的 #16／#17／#18。

固定採本計劃的三階段邊界、cleanup-only、operation journal 投影、
app-scoped background runner＋202＋polling；不要改成另一套架構。
各階段先通過相關測試，最後跑 AGENTS 全套驗證及 E2E／平台適用的視覺檢查。
未知寫入先核對，不盲重送；保留最少必要 API 寫入及全部手動草稿。

持續完成可執行部分，不每做一個任務就停下請示。
如果發現計劃與更新後程式不同，先記錄具體差異並採最小相容調整；
不能弱化確認、簽署預覽、權限、頻道隔離或防重送規則。
若需跨回合續作，先看 progress 文件，從第一個未完成任務繼續。

完成後回報 5 個 open issue 的驗收證據、測試結果與剩餘限制。
這份交接只授權程式實作與驗證；不自動部署、合併或關閉 issue。
```
