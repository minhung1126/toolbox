# 工具能力清單

本表對應目前註冊的 8 個模組；登入僅驗證身分，各服務獨立授權。不提供 Drive 影片上傳或排程服務。

| 模組 | 入口 | 資料權限 | 輸入 → 實際輸出 |
| --- | --- | --- | --- |
| creator-tools | /youtube/drafts/videos、/youtube/drafts/shorts、/youtube/publish-cleanup | Sheets 唯讀、YouTube；發布只需 YouTube | Sheet 文案與影片 → 差異預覽、確認後更新遠端影片；發布另行核對後立即公開並移出 To-Post |
| sheets-tools | /sheets/copy、/settings/sheets | Sheets 唯讀 | 試算表 → 篩選後文字複製至剪貼簿；不寫回 Sheet |
| ffmpeg-generator | /ffmpeg-generator | 無 | 本機影片／參數 → FFmpeg 指令；需自行在已安裝 FFmpeg 的電腦執行 |
| photo-curator | /photo-curator | 無 | 本機照片 → 編排 ZIP、對照表及排版專案；不自動發布 Instagram |
| youtube-music | /ytmusic/playlist-sort | 獨立 YTMusic 授權／受支援連線 | 歌單與規則 → 預覽；確認後改原歌單或建立新歌單 |
| sticky-notes | /notes | 登入身分 | 文字／模板 → 帳號隔離保存、剪貼簿或備份檔 |
| youtube-integrations | /youtube/settings/connections 等 | YouTube 獨立授權 | 同頻道連線與路由偏好 → 配額本機估算及授權備援；並非官方即時剩餘量 |
| system-utility | /settings/system、/system/health、/system/info | 登入／現行管理權限 | 部署配置 → 健康結果、版本資訊；與使用者服務授權分開 |

Weverse 已退役，無上傳 worker 或專用 OAuth；不清除舊持久資料。
