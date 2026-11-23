# Toolbox 工作流實作與驗證

來源：使用者提供的 TB-00–TB-10 計劃。實作基準為 `9740ed6`（包含 `02d8cab` 與發布後清理修正）。環境原本沒有 checkout，從 `minhung1126/toolbox` main 取得；遠端未包含交接文件提到的 TB-00 工作區變更，於本次補齊。

程式變更已在本機完成，沒有部署、推送或操作真實 Google／YouTube 帳號；未清除既有資料。測試仍使用隔離資料目錄與假 provider。下表的「完成」指本機實作，不能解讀為已上線或完成真實 provider 驗收。

| 項目 | 本次改動檔案／範圍 | 最終互動及驗收案例 |
| --- | --- | --- |
| TB-00 完成 | 退役 Weverse feature、API、專用 OAuth、worker、credential accessor、啟動組裝及專屬測試／fixtures | 保留 8 模組。舊頁面找不到、舊 API 404；退役 callback 明確拒絕且不建立 OAuth flow、不交換 token。原持久資料與外部影片保留。 |
| TB-01 完成 | README、兩端 builtin／manifest、GoogleAccountSettingsPage、TOOL_CAPABILITIES | 同一份能力清單對照權限、入口與實際輸出；明示唯讀／剪貼簿、立即公開、本機指令、ZIP。修正多頻道與固定零配額承諾。契約測試核對兩端描述，沒有擴 OAuth scope。 |
| TB-02 完成 | ffmpegCommand.ts、types、presets、workflow／output、ffmpeg_generator.py | Shell 與單／多行分開；每個參數各自引用，保留原檔名，不去掉使用者輸入的引號。CMD 拒絕無法可靠處理的 %／!／雙引號及控制字元。無效時間、倒置、同路徑、已知超過片長時沒有可複製指令。Bash 用假 ffmpeg 的 argv 回顯驗證中文、空白、引號、反斜線、美元、反引號、百分比及括號；MP3→H.264、GIF→剪片保留檔幹並更新格式。後端快速 seek 的絕對終點轉為相對長度。 |
| TB-03 完成 | BatchUpdatePage、PublishCleanerPage、SheetDataSourcePanel | 有效來源預設收合，錯誤／來源失效展開；顯示步驟、數量、目標頻道與完整／有變更／需處理預覽。更新後可帶合法來源前往發布檢查，發布仍重新讀取並使用自己的快照，不會自動公開。既有 Video／Shorts 配置、跨團體人物、髒寫入與逾時保護通過回歸。 |
| TB-04 完成 | SheetCopyPage、clipboardSelection model | 保留點格即複製，增加選格模式與整列選取；按工作表列序與欄序輸出，顯示列數、欄序及貼上預覽。TSV 對多行、Tab 與引號作欄位引用；純文字每格一行。隱藏／篩選外的列不複製，選取與隱藏分開；剪貼簿失敗不能顯示成功，不寫回 Sheet。 |
| TB-05 完成 | ServiceAuthCard、Google／YTMusic 設定、YouTubeSlotCard、PlaylistSortAuthorization | 先顯示帳號／頻道與可執行工作，重新授權、Token 與憑證資訊收於進階。可用連線不反覆推薦換模式；Token 異常會展開相關處理入口。保留同頻道檢查、獨立授權、原歌單／新歌單選擇、排序偏好、配額估算與未知結果停止 fallback。 |
| TB-06 完成 | FFmpeg controls、Photo Curator ProjectFiles／project model／session | 用途預設在前，進階編碼收合，說明流複製受關鍵影格限制。匯出／匯入版本 1 排版 JSON，記錄貼文、順序、封面與本機檔案 metadata；重新整理後須重新選檔。名稱、大小、修改時間須唯一對應，歧義留待補，可手動指定；缺圖時不輸出 ZIP。實測匯出、重載、重新選檔恢復。照片不送往伺服器，檔案修改時間不冒充拍攝時間。 |
| TB-07 完成 | useDebouncedAutosave、StickyNoteCard／Page、NoteDrafts、AppShell | 已儲存／未儲存／儲存中／失敗四種狀態。晚回應不覆蓋新文字；失敗與結果不明保留草稿、可複製及匯出全部／單張。草稿在目前登入工作階段切換工具時保留；不明狀態也保留且停止寫入，讀回一致才顯示已儲存；不一致時先顯示伺服器版本，再明確選擇儲存草稿。離頁提醒不保證重新整理後仍有草稿；帳號切換清除工作階段。 |
| TB-08 完成 | Dashboard、RecentToolRoutes、catalog／Provider、ApiHealthPage、Navbar | 按工作目的呈現工具、連線與管理區；保留釘選。側欄／深連結進入合法可用路由也記最近使用，退役釘選忽略。單一 metadata 錯誤只隔離該工具；無法辨識整份回應仍停止載入，不從本機偷渡開啟工具。健康頁讀取 /api/v1/health，區分部署、工具、個人授權與本機配額。390／768／1440px 流程與版面驗證通過。 |
| TB-09 完成 | operation_store、operation_journal、operations API／Page、YouTube／歌單 adapter、preview nonce | 沿用同步端點，新增 operation_id 與可選 request_id；SQLite 交易保存帳號、請求與輸入版本。每階段寫入前後落盤；重啟不自動接手或重送。查詢、證據匯出及 provider 唯讀核對；缺遠端 ID 不再次建立新歌單。測試並行受理、部分成功／結果不明、重啟拒絕重送、他帳號查不到、備份還原及拒絕壞版本。詳見 OPERATION_JOURNAL。 |
| TB-10 完成 | backend/app/resources/ffmpeg-presets.v1.json、ffmpeg-command-cases.v1.json、Dockerfile、catalog contract、workflow-benchmark E2E | 前後端由同一版本化預設資料取得容器與參數，共用測試案例。保留既有 manifest 分工，不另建工具註冊表。固定假 provider 案例實測基準與修改版；僅保存匿名案例、次數與耗時，不加入正式環境追蹤。 |

計劃中列為「可擴充／後續」的多步復原重做、便利貼伺服器軟刪除／還原、從工具結果建立便利貼，沒有順帶加入。Photo Curator 仍沿用既有單步復原；匯入專案、移除檔案與重置明示會清除復原歷史，沒有以前端假復原掩蓋後端刪除。

機器可讀的最終檢查摘要見 [checks.v1.json](validation/checks.v1.json)。

## 本次完整檢查

| 檢查 | 本次結果 |
| --- | --- |
| Ruff check／format check | 通過。 |
| pytest backend/tests -q | 411 項通過、2 項略過。略過項為缺少原生 PowerShell／CMD 的 argv 測試；沒有把字串單元測試當作原生 Shell 通過。 |
| 前端 format:check／ESLint／Stylelint／TypeScript／build | 通過。 |
| 前端完整 Vitest | 84 個測試檔、519 項通過。 |
| 鎖定 Chromium 功能 E2E | 67 項通過，包含新增剪貼簿失敗、排版專案重新載入、單工具隔離、真正健康資料、持久作業頁與深連結最近使用。 |
| 焦點追查 E12 | 修正前追蹤確認：滑入動畫尚未結束時，Chromium 偶爾忽略對底部按鈕的 focus，原本只重試一個影格仍太早。改為防捲動且在動畫期間短暫重試；使用者移動焦點後停止。原案例及新增動畫案例在 Chromium 153 並行重複 12／12 通過；系統 Chromium 156 的動畫案例獨立埠重複 6／6 通過。保留原 Tab／Shift+Tab 驗收。 |
| Linux 視覺 | 使用鎖定 Chromium 153、Noto Sans CJK TC 與既有 locale／timezone／DPR／reduced motion 規則。先比對取得 actual，逐張檢視三種寬度的 Dashboard、共用元件及鍵盤焦點後，僅更新已檢視的 Linux 圖片。9 張圖（6 個測試）重新比對通過，未放寬像素容差。 |
| Windows／Edge 視覺 | 此環境無 Windows／Edge，尚未檢視或更新其基準；沒有以 Linux 圖片覆蓋 Windows 基準。這項正式視覺驗收仍待指定環境完成。 |
| 真實 provider、部署回退、Docker runtime | 未執行；假 provider、build 與 repository 備份測試不代表已完成正式 smoke test／部署回退演練。 |

完整測試期間遇到的過時文字、單格檔案選取器、折疊面板與新作業路由等測試預期已依最終互動更新，沒有移除快照、防髒寫入、未知結果或帳號隔離驗收。兩次不同 Playwright 組態曾共用輸出目錄或服務埠，造成 trace／連線干擾；最終驗證使用各自輸出目錄與服務埠，不將受干擾的結果計為通過。

## 固定工作流比較

[原始匿名量測](validation/workflow-benchmark.v1.json)。基準版本為實際接手版本 `9740ed6`，不是引用過往測試數字；基準 checkout 只建立靜態前端並使用假 provider。兩端均為鎖定 Chromium 153，單一 worker、各一輪。

| 固定案例 | 基準 → 修改版 | 設定跳頁 | 觀察 |
| --- | --- | --- | --- |
| 擷取六格內容 | 6 次點擊 → 4 次點擊；1100 → 551 ms | 0 → 0 | 基準逐格複製六次，新版選三列後一次複製 TSV。只計 Toolbox 內的點擊，不計外部貼上；原輸出為六次剪貼簿值，新輸出為一次 TSV。 |
| 返回已設定的影片更新 | 4 次點擊＋1 次人物選取 → 相同；1126 → 1223 ms | 0 → 0 | 預覽、確認及寫入保護保留，不為減少點擊省略確認。 |
| 影片讀取失敗後手動重試 | 5 次點擊＋1 次人物選取 → 相同；1207 → 1363 ms | 0 → 0 | 兩端皆完成；各 1／1 次錯誤後成功繼續，不重送寫入。 |

這些是單輪自動化時間，會受主機負載與 runner 影響，不是人類操作時間或正式流量數據。六格案例點擊減少 33%，影片案例點擊未減少；沒有證據宣稱整體完成時間改善或達成原定約 25% 目標。
