# YouTube 整合實作進度

基準：`be7cd22f468db976c8111d7657cd54af35105162`（含 PR #21）。
分支：`codex/youtube-integrated-workflow`；隔離 worktree：`/workspace/work/toolbox-integrated`。
原工作區 `/workspace/toolbox` 無修改，保持原樣。遵循 [實作計劃](ISSUES_IMPLEMENTATION_PLAN_2026-11-17.md)。

| 任務 | 狀態 | 提交／驗證 |
| --- | --- | --- |
| P0 | 完成 | Python 3.11.17、Node 22.23.4；後端 442 passed、2 skipped；ruff 通過。前端 format/lint/styles/typecheck/build 通過；88 檔、561 tests 通過；production audit 0。基準系統 Chromium E2E 71 passed；鎖定版 visual 下載受阻。 |
| P1 | 完成 | schema v2 交易式遷移；request alias／精確查找；逐列 revision／互斥計數；原子目標保留含舊未知作業；備份恢復。78 passed、2 skipped（state、workflow、draft）；import side effects 亦通過。 |
| P2 | 完成 | cleanup v2 簽章／逐 item 結果；每次實際 delete（含 retry/fallback）重驗 public 與成員；新舊 reconcile 分支；配額不含 videos.update。64 tests passed（cleanup/service/quota/routing/direct workflows）。 |
| P3 | 完成 | 移除 metadata／公開入口；逐 item 預覽與互斥計數契約；unknown/quota 獨立呈現；名稱同步。46 前端相關 tests passed、typecheck/lint/build 通過；清理 Chromium E2E 1 passed。 |
| P4 | 完成 | app-scoped runner／有界 queue／202／精確 request 與舊 stage 查找；完整逐片 progress；explicit app resources／重新取得授權；OS file lock＋DB ownership/heartbeat；重啟只復原狀態。背景、同步、state、factory、import 與 workflow 相關測試見 `/workspace/work/p4-complete.log`；額外排隊過期/shutdown 見 p4-extra.log。 |
| P5 | 完成 | 送出前保存 payload/request ID；202 operation reference；單一 in-flight polling、2/5/10 秒退避與 Retry-After；精確 request/stage 恢復；revision/identity/count 契約；保留 unknown 與手動編輯。14 項 page/hook tests passed，typecheck/lint 通過。 |
| P6 | 完成 | journal 與人物/公開觀察/cleanup item 投影同交易；只信實際 snippet parts＋人物關聯；status-only/unchanged 不冒充人物成功；失敗保留舊成功；indexed 批次查詢與可重建投影。8 專項 tests passed；相關回歸見 p6-complete.log。一般單片 metadata 寫入亦使用同一原子目標保護。 |
| P7 | 完成 | prepare 比對可信人物/指紋、最新遠端文字/public、pending；可撤銷 default_skip；單片/整批重新納入不覆蓋手動內容；保持既有篩選與 prepare availability。47 backend tests、41 frontend 回歸通過，補充重新納入 page test 與 typecheck 通過。 |
| P8 | 完成 | 三階段名稱/導覽/dashboard/後端目錄一致；全文標題/描述可見標籤、主文字對比及行距；沿用 modal。67 前端專項 tests、typecheck/styles 通過；Video/Shorts 100 字標題與 5,000 字描述在 390/768/1440 px 無溢位；3 個 staging/cleanup E2E passed。已檢視手機與桌面截圖（work/visual-review），平台 snapshot 限制另列。 |
| P9 | 可執行驗收完成；平台 golden 待驗證 | 新增 10 片進度／刷新／202 遺失 E2E；補清理未知、保存失敗、line ending 最少寫入、缺權限；issue→測試對照見 YOUTUBE_INTEGRATION_REVIEW.md。 |

## 環境與基準

- 使用現有 `/workspace/toolbox/venv/bin/python`（依 lock 安裝的 Python 3.11 環境），避免系統 Python 的唯讀使用者套件目錄；前端使用 `/workspace/.toolbox-tools/node/node_modules/node/bin` 的 Node 22。
- 基準 log：`/workspace/work/baseline/`，安裝 log：`/workspace/work/*-install.log`。npm ci 已完成。
- pytest 維持暫存 data 及第三方網路隔離；所有 provider 寫入測試使用 fake。
- 尚未執行 Windows/Edge 或部署；不自動部署、合併或關閉 issue。

## 下一步

P9 剩餘：在可取得鎖定瀏覽器的 Linux 環境及 Windows Edge 執行 golden 比對，審視 Dashboard／導覽的預期差異後更新各自基準。本環境已完成所有可執行實作與驗證，不把平台 golden 列為 passed。

P0 補充：系統 Chromium 執行基準 E2E 71 passed。鎖定版 Playwright 瀏覽器 CDN 被網路政策擋下（403 Domain forbidden），Linux visual 基準暫無法使用指定瀏覽器。


## 循序提交

| 任務 | commit |
| --- | --- |
| P0 | `3348539692364d1b48d9328a708d6314a55c5115` |
| P1 | `ca6492a0c9a5371c6fcdc6bf7cc504163876cfd9` |
| P2 | `ee8aba71946cde6f9c55f6f33088cb1282c62c28` |
| P3 | `4e1649e883b03e93c1d3e887e9ef6b2e6b380b05` |
| P4 | `e6fffb45e85e6fb1a38998ad3e295a3f492be715` |
| P5 | `773822deb90e898dd4dd1e976ceaf8619e6cae1c` |
| P6 | `564860d61a57e0054cb818efffcf5a542e4888f6` |
| P7 | `9b9c0ae322b84c54e5dbf94e05f6e6681b3c743c` |
| P8 | `e1d935b6ef2855ea77826412b95643e881a31589` |
| P9 程式／測試／文件 | `0fcd3934cfb8d56a3b83b1119b0517f139bc5056` |

## 最新檢查與剩餘限制

- 後端最終全套：479 passed、2 skipped；ruff check／format check 通過。
- 前端全套：89 files、569 tests passed；format/lint/styles/typecheck/build 通過；最終契約加強後已完整重跑 569 tests；最終 bundle 的發布進度／staging E2E 另 4 passed。
- 系統 Chromium 完整 E2E：73 passed，含既有 Instagram／Sheets／Music 保障；新發布進度與 staging 在最終 bundle 另核對。
- production audit 0；full audit 與基準相同：27（21 high／5 moderate／1 low），均為開發依賴；未因本輪升級工具鏈。
- Docker 原命令被代理 CA 信任問題擋下；以暫存 Dockerfile 掛載 host 受信任 CA 至安裝步驟後 build 通過，TLS 未停用。容器 app lifespan／runner startup/shutdown 通過；Compose 以暫存 `.env.example` config 通過，未覆寫 `.env`、未部署。
- 鎖定版 Linux Chromium（153.0.8010.12）CDN 及官方 mirror 均回 403；Windows Edge 無此環境。系統 Chromium 156.0.8078.79 的 E2E／人工審視不冒充兩平台 golden 通過。未更新或自動接受基準。
- 日誌：`/workspace/work/final-checks/`。畫面：`/workspace/work/visual-review/staged-{Video,Shorts}-{390,768,1440}.png`；已檢視三種寬度。初次 E2E 中途 rebuild 干擾及舊名稱斷言已修正，固定產物重跑 73 passed。
- [整合說明與 issue→測試對照](YOUTUBE_INTEGRATION_REVIEW.md)。未驗證真實帳號、正式部署／回退、多副本；未 merge／關閉 issue。


最終受測程式／測試提交：`0fcd3934cfb8d56a3b83b1119b0517f139bc5056`。本紀錄後續提交僅補 SHA／驗證結果，無程式變更。

- 最終 `pytest-final.log`：479 passed、2 skipped（121.77 秒；同期執行容器／瀏覽器檢查）。
- 最終 `frontend-tests-final.log`：89 files、569 tests passed（94.45 秒）；5 個 polling 契約測試確認不接受缺確認來源的 succeeded。
- `e2e-final.log`：73 passed；`youtube-e2e-final.log`：最終 bundle 再核對 4 passed。
- 最終 CA-assisted image：`sha256:42c8feec840bad96cd75ab6c0d00a0efa9d3a60ecf6e5eb94e60c46198505538`；`container-smoke-final.log` startup/shutdown passed。未推送 image 或啟動正式服務。
- `git diff --check` 通過；原工作區仍為 `fa6df9d947a5724291984debb54b751a7b068b79` 且乾淨；實作僅存在整合 worktree／分支。
