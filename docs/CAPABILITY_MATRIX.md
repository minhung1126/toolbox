# 工具能力與 API 授權矩陣

工具目錄的 `required_scopes` 表示主要操作所需的能力。前端用它顯示連線提示；實際授權仍由每個 API 的 dependency 檢查，並在呼叫 provider 前拒絕。各設定頁與本機預覽操作可在缺少對應 provider 授權時開啟，以便完成連線或檢查輸入。

| 工具／操作 | API | 所需能力 | 缺少能力時 | 例外與原因 |
| --- | --- | --- | --- | --- |
| Creator 草稿讀取 | `POST /youtube/playlist-items` | YouTube 頻道 | 403 | 僅讀 YouTube；不需 Sheets。 |
| Creator 批次預覽與更新 | `POST /youtube/batch-preview`, `/youtube/batch-update` | YouTube 頻道 + Sheets 唯讀 | 403 | 更新前須讀 Sheet；兩種授權分開檢查。 |
| Creator 發布與清理 | `POST /youtube/publish-and-cleanup` | YouTube 頻道 | 403 | 不讀 Sheet，因此工具路由覆寫為單一能力。 |
| 單片資訊更新 | `POST /youtube/video-metadata` | YouTube 頻道 | 403 | 頻道衝突時在 provider 前回 409。 |
| Sheets 資料操作 | `POST /sheets/metadata`, `/parse-options`, `/people`, `/random-member-preview`, `/copy-table` | Sheets 唯讀 | 403 | 以獨立 Sheets OAuth 授權。 |
| YouTube Music 清單、預覽、套用 | `GET /playlist-sort/playlists`, `POST /playlist-sort/preview`, `/apply` | YT Music 專用授權或可用 YouTube 頻道 | 403 | 專用授權優先，頻道為相容 fallback。設定頁可在未授權時開啟。 |
| Weverse 上傳 | `POST /weverse-uploader/upload-from-path`, `/upload-files` | 專用影片上傳頻道 | 403 | 不沿用 Creator YouTube 頻道；目錄 scope 為 `video_uploader`。 |
| Weverse 掃描、解析、歷史與進度 | `POST /weverse-uploader/scan`, `/parse-files`; `GET /weverse-uploader/tasks/{id}`, `/history`, `/recent-paths` | 登入 session | 401 | 掃描及對帳可在上傳授權前後使用；寫入 API 仍獨立檢查。 |
| 頻道用量與配額估算 | `GET /youtube/quota-usage`, `POST /youtube/quota-estimate` | 登入 session | 401 | 本機帳本和估算不呼叫 provider。 |
| OAuth／工具設定頁 | `/auth/*/url`, `/settings/*` | 登入 session，初始設定例外 | 401 | 用來取得授權網址或設定能力；不以待連線的 provider scope 阻擋。 |

`creator-tools` 的草稿路由宣告兩項能力，發布路由只宣告 YouTube。`youtube-music` 的設定路由宣告空能力。Weverse 的工具入口提示專用影片上傳頻道，即使掃描本身只要登入；頁面仍可進入並顯示連線控制。

驗證依據：`backend/tests/test_decoupled_auth.py` 使用隔離 credential/session store 與假 workflow，檢查缺少 Sheets、YT Music、專用上傳授權及頻道衝突時的 403／409；`backend/tests/test_tool_registry.py` 檢查停用工具不掛載 API，`frontend/src/tools/capabilities.test.js` 與 `frontend/e2e/navigation.spec.ts` 檢查前端提示和不可用工具導覽。
