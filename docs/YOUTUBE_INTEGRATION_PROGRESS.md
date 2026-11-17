# YouTube 整合實作進度

基準：`be7cd22f468db976c8111d7657cd54af35105162`（含 PR #21）。
分支：`codex/youtube-integrated-workflow`；隔離 worktree：`/workspace/work/toolbox-integrated`。
原工作區 `/workspace/toolbox` 無修改，保持原樣。遵循 [實作計劃](ISSUES_IMPLEMENTATION_PLAN_2026-11-17.md)。

| 任務 | 狀態 | 提交／驗證 |
| --- | --- | --- |
| P0 | 完成 | Python 3.11.17、Node 22.23.4；後端 442 passed、2 skipped；ruff 通過。前端 format/lint/styles/typecheck/build 通過；88 檔、561 tests 通過；production audit 0。E2E/visual 因缺 Playwright browser 尚未執行，安裝處理中。 |
| P1 | 完成 | schema v2 交易式遷移；request alias／精確查找；逐列 revision／互斥計數；原子目標保留含舊未知作業；備份恢復。78 passed、2 skipped（state、workflow、draft）；import side effects 亦通過。 |
| P2 | 完成 | cleanup v2 簽章／逐 item 結果；每次實際 delete（含 retry/fallback）重驗 public 與成員；新舊 reconcile 分支；配額不含 videos.update。64 tests passed（cleanup/service/quota/routing/direct workflows）。 |
| P3 | 完成 | 移除 metadata／公開入口；逐 item 預覽與互斥計數契約；unknown/quota 獨立呈現；名稱同步。46 前端相關 tests passed、typecheck/lint/build 通過；清理 Chromium E2E 1 passed。 |
| P4 | 完成 | app-scoped runner／有界 queue／202／精確 request 與舊 stage 查找；完整逐片 progress；explicit app resources／重新取得授權；OS file lock＋DB ownership/heartbeat；重啟只復原狀態。背景、同步、state、factory、import 與 workflow 相關測試見 `/workspace/work/p4-complete.log`；額外排隊過期/shutdown 見 p4-extra.log。 |
| P5 | 完成 | 送出前保存 payload/request ID；202 operation reference；單一 in-flight polling、2/5/10 秒退避與 Retry-After；精確 request/stage 恢復；revision/identity/count 契約；保留 unknown 與手動編輯。14 項 page/hook tests passed，typecheck/lint 通過。 |
| P6 | 完成 | journal 與人物/公開觀察/cleanup item 投影同交易；只信實際 snippet parts＋人物關聯；status-only/unchanged 不冒充人物成功；失敗保留舊成功；indexed 批次查詢與可重建投影。8 專項 tests passed；相關回歸見 p6-complete.log。一般單片 metadata 寫入亦使用同一原子目標保護。 |
| P7 | 完成 | prepare 比對可信人物/指紋、最新遠端文字/public、pending；可撤銷 default_skip；單片/整批重新納入不覆蓋手動內容；保持既有篩選與 prepare availability。47 backend tests、41 frontend 回歸通過，補充重新納入 page test 與 typecheck 通過。 |
| P8 | 待辦 | 三階段導覽及全文閱讀 |
| P9 | 待辦 | 整合驗收、文件、交付 |

## 環境與基準

- 使用現有 `/workspace/toolbox/venv/bin/python`（依 lock 安裝的 Python 3.11 環境），避免系統 Python 的唯讀使用者套件目錄；前端使用 `/workspace/.toolbox-tools/node/node_modules/node/bin` 的 Node 22。
- 基準 log：`/workspace/work/baseline/`，安裝 log：`/workspace/work/*-install.log`。npm ci 已完成。
- pytest 維持暫存 data 及第三方網路隔離；所有 provider 寫入測試使用 fake。
- 尚未執行 Windows/Edge 或部署；不自動部署、合併或關閉 issue。

## 下一步

P8；每項完成相關測試後提交並在此記錄證據。尚未完成的任務不得宣稱通過。

P0 補充：系統 Chromium 執行基準 E2E 71 passed。鎖定版 Playwright 瀏覽器 CDN 被網路政策擋下（403 Domain forbidden），Linux visual 基準暫無法使用指定瀏覽器。
