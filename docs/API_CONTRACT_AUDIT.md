# Feature API 契約盤點（#4）

執行期驗證設在 feature API 邊界。格式錯誤的讀取結果不能被當作空資料；會寫入資料的請求若回應缺少確認欄位，顯示「結果無法確認」，請使用者先重新讀取核對。

| 端點／流程 | 缺漏契約與處置 |
| --- | --- |
| `/auth/config`、`/auth/url`、`/system/setup-status`、`/system/setup` | 驗證設定布林欄位、Google 授權 URL、安裝狀態與對應管理者信箱。 |
| `/settings/system-credentials`、`/settings/allowlist` | 驗證憑證摘要及名單結構；新增／移除／切換須確認回應符合要求。 |
| Sheets 授權及共用設定 | 驗證 Google URL、斷線狀態、Sheet ID 與更新後設定。 |
| `/settings/youtube-drafts` | 讀取需有 video、shorts 設定；更新須確認類型與寫入欄位。沿用舊 playlist ID 是後端既有相容行為。 |
| `/settings/youtube-playlist` | Creator 工作流共用設定 API 的確認驗證。 |
| `/youtube/video-metadata` | 單片更新須回傳成功狀態、影片 ID、標題與描述，才顯示成功。 |
| 批次預覽、執行、發布清理、YT Music 排序、Weverse 上傳、便利貼 | 沿用已有快照、計數、工作 ID 及結果驗證；未重複實作。 |

Timeout／網路錯誤由底層 request 傳遞；UI 不會在例外路徑顯示成功。單元測試包括有效、缺欄與錯誤值；CI 執行 Vitest、typecheck、build 和假 provider E2E。
