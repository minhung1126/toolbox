# YouTube 整合變更與驗收對照

基準 `be7cd22f468db976c8111d7657cd54af35105162`（PR #21），分支 `codex/youtube-integrated-workflow`。本次只實作及驗證，未部署、合併或關閉 GitHub issue。提交與最終檢查見 [進度紀錄](YOUTUBE_INTEGRATION_PROGRESS.md)。

## 五個 open issue 的實作與證據

| Issue | 最終行為 | 可重現證據 |
| --- | --- | --- |
| #19 僅清理 public | cleanup v2 簽署確切 item；刪除前及每次 retry／fallback 重驗 public 與成員；不呼叫 videos.update/delete；重複影片逐 item 計數 | `test_youtube_publish_cleanup.py`：public→private、duplicate 中途轉 private、舊 token、遺失回應、quota fallback、unknown 後再變 private；`test_youtube_direct_workflows.py` 同頻道 guard；清理 Chromium E2E |
| #20 持久化與安全跳過 | journal 單一事實來源，交易式 v1→v2、可重建投影、索引查詢與原子寫入目標保留；歷史＋人物＋目標＋最新 public 全符才 default skip，可重新納入 | `test_youtube_operation_state.py`：並行 claim／>100 精確查找／backup restore；`test_youtube_processing_state.py`：parts、失敗保留舊成功、舊紀錄缺證據 unknown；`test_youtube_default_skip.py`：改人物／模板／遠端／privacy／pending；前端重新納入測試 |
| #22 全文可讀性 | 最終標題與描述直接顯示，獨立標籤、主文字對比、較大字級／行距；主內容無 clamp／固定高度裁切；modal 儲存即時反映 | `youtube-staging.spec.ts`：Video／Shorts、100 字標題、5,000 字描述、長 URL／空行、390／768／1440 px 的全文高度及水平溢位；modal Esc／未存提示／焦點；已人工檢視三種寬度截圖。平台 golden 比對仍受環境限制 |
| #23 真正逐片進度 | app-owned 有界 runner＋202＋唯讀 polling；完整 rows／互斥 counts／revision；精確 request／stage 恢復；unknown 不重送；排隊過期不放寬時效 | `test_youtube_publish_jobs.py`：阻塞第 2 片時 202 與第 1 片成功已可見、queue full、雙 app、互斥 writer、重啟及 shutdown；`useDraftPublishOperation.test.tsx`：單一 in-flight、退避、Retry-After、舊 revision／晚到回應、壞契約；`youtube-publish-progress.spec.ts`：10 片第 3 片 unknown、刷新、202 遺失且只一個 POST |
| #24 三階段分工 | ① 快速套用不寫 YouTube；② 編輯確認才公開，成功只提供清理連結；③ 清理可獨立開啟且只移除清單成員；五個原 URL 與 storage keys 保留 | batch／draft page tests、manifest／Navbar／catalog／route tests、清理及 staging E2E；單次合併 snippet,status／status-only／unchanged 的 fake provider 與 quota 斷言 |

## 必要情境與寫入上限

- private＋文字變更：一次 snippet,status／50 units；public＋文字變更一次 snippet；文字相同＋private 一次 status，不能新增人物成功；全部已符合為 unchanged、0 write。
- 快速套用、modal、preview、篩選均 0 YouTube write。只有確認後發布或清理會寫入；手動內容不被 Sheet 覆寫。
- 公開歷史不授權刪除。private、unlisted、排程未公開、找不到或無法確認者保留。刪除結果以 item 判定；重新加入產生新 ID，不繼承舊移除狀態。
- 同 request／同 signed plan 去重；兩份不同預覽同片以 SQLite 原子保留阻擋；新 async、舊 sync、一般 metadata API 使用相同保護。
- 重啟時成功保留、running 待核對、queued not_attempted；不自動重寫。唯讀 reconcile 拒絕 active 作業及錯誤頻道。
- 讀取與每個 attempt 的實際成本均留在既有 ledger。cleanup 預估及 max_items_today 不含任何 videos.update。

## 11 個 closed issue 的保障

| Issues | 本輪回歸依據 |
| --- | --- |
| #3／#4 | shared Button／Dialog／tokens；TypeScript、runtime contracts、format/lint/styles/typecheck/build 全套 |
| #5 | test_decoupled_auth：新清理無 Sheets 要求；prepare／preview／sync／async publish 缺 Sheets 在 provider 前回 403；頻道 mismatch 拒絕 |
| #6 | app factory／repository scope tests；publish_jobs 雙 app provider／credentials 隔離；無 import-time executor；共享 store 多 runner 拒絕 |
| #9 | production audit 0；full audit 27 個開發依賴公告（21 high／5 moderate／1 low），與基準相同，未升級工具鏈 |
| #10 | Linux 系統 Chromium 功能／responsive E2E 與人工畫面審視；鎖定版 Linux／Windows Edge golden 未驗證，未混用基準 |
| #13 | 完整 photo curator 單元／E2E，原排序行為保留 |
| #14 | 簽署最終預覽、手動內容、單次必要 parts 更新與 readonly reconcile；依 #19／#24 移除清理頁公開副作用 |
| #16／#17／#18 | 直接沿用 PR #21 的全部預設篩選、Dialog、prepareDraftAvailability、disabled reason、重建取消／finally 解鎖與回歸測試 |

## 平台與部署界線

支援單一 Linux uvicorn process／單副本，沒有 Redis／Celery／SSE。只有 fake provider 測試；未觸碰真實影片或使用者 data。備份／恢復以暫存 SQLite fixture 驗證，未做真實帳號回退。

鎖定的 Playwright Chromium 153.0.8010.12 下載遭 403 Domain forbidden；系統 Chromium 156.0.8078.79 的功能 E2E 全套通過，但不能宣稱通過鎖定版 golden。Windows/Edge 本環境不可用。既有兩套視覺基準未自動接受差異，Dashboard 文案／卡片變更仍待對應平台審核及更新。

原 Dockerfile 的直接 build 被此環境代理 CA 信任鏈阻擋。以工作目錄中的暫存 Dockerfile，只在 npm/pip 安裝步驟掛載 host 受信任 CA（保留 TLS 驗證）後，完成三階段 image build 與容器 lifespan／runner 啟停測試。產品 Dockerfile、lockfiles 與 `.env` 未改；Compose 僅以 `.env.example` 的暫存 config 驗證，未啟動服務部署。
