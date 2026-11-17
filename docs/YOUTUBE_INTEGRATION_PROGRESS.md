# YouTube 整合實作進度

基準：`be7cd22f468db976c8111d7657cd54af35105162`（含 PR #21）。
分支：`codex/youtube-integrated-workflow`；隔離 worktree：`/workspace/work/toolbox-integrated`。
原工作區 `/workspace/toolbox` 無修改，保持原樣。遵循 [實作計劃](ISSUES_IMPLEMENTATION_PLAN_2026-11-17.md)。

| 任務 | 狀態 | 提交／驗證 |
| --- | --- | --- |
| P0 | 已完成基準同步；基準驗證進行中 | Python 3.11.17、Node 22.23.4；後端 442 passed、2 skipped；ruff 通過。前端檢查已啟動。 |
| P1 | 待辦 | schema v2、progress、原子目標保留 |
| P2 | 待辦 | cleanup-only 後端 |
| P3 | 待辦 | 清理前端 |
| P4 | 待辦 | 背景受理與逐片進度 |
| P5 | 待辦 | polling 與精確恢復 |
| P6 | 待辦 | 歷史證據投影與批次查詢 |
| P7 | 待辦 | 安全預設略過 |
| P8 | 待辦 | 三階段導覽及全文閱讀 |
| P9 | 待辦 | 整合驗收、文件、交付 |

## 環境與基準

- 使用現有 `/workspace/toolbox/venv/bin/python`（依 lock 安裝的 Python 3.11 環境），避免系統 Python 的唯讀使用者套件目錄；前端使用 `/workspace/.toolbox-tools/node/node_modules/node/bin` 的 Node 22。
- 基準 log：`/workspace/work/baseline/`，安裝 log：`/workspace/work/*-install.log`。npm ci 已完成。
- pytest 維持暫存 data 及第三方網路隔離；所有 provider 寫入測試使用 fake。
- 尚未執行 Windows/Edge 或部署；不自動部署、合併或關閉 issue。

## 下一步

P1；每項完成相關測試後提交並在此記錄證據。尚未完成的任務不得宣稱通過。
