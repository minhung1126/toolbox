# Toolbox 重構計劃：剩餘工作

本文件只追蹤尚未完成的重構工作。已完成的修正、測試與 CI 紀錄保留在 Git 歷史及各次提交中；各項工作以對應 GitHub issue 作為後續追蹤與驗收來源。

## 待辦 issues

| Issue | 工作 | 驗收重點 |
| --- | --- | --- |
| [#7](https://github.com/minhung1126/toolbox/issues/7) | 真實 provider smoke test | 專用帳號驗證 OAuth callback、token refresh 與 Weverse 流程；記錄對帳結果 |
| [#8](https://github.com/minhung1126/toolbox/issues/8) | 部署與回退演練 | 隔離環境用固定 SHA 與資料副本演練中斷、備份、回退及舊版讀取 |

#7 與 #8 依使用者指示暫緩，等待專用 provider 測試帳號及隔離部署環境與資料副本。

## 本次工作流修正

2026-10-06 已完成寫入安全性、型別化前端 reducer／工作流、後端 ports 及 YTMusic 職責拆分；交付與完整驗證見 [工作流漸進式修正紀錄](WORKFLOW_REFACTOR_2026-10-06.md)。339 項後端與 455 項前端測試通過。兩項既有 E2E 版面問題及本機 Linux 截圖基準差異已在原始版本對照重現，正式上線前須另完成一致環境驗收；#7／#8 保持暫緩。

## 已完成

| Issue | 交付紀錄 |
| --- | --- |
| [#3](https://github.com/minhung1126/toolbox/issues/3) | [共用 UI 盤點](SHARED_UI_AUDIT.md) |
| [#4](https://github.com/minhung1126/toolbox/issues/4) | [API 契約盤點](API_CONTRACT_AUDIT.md) |
| [#5](https://github.com/minhung1126/toolbox/issues/5) | [能力矩陣](CAPABILITY_MATRIX.md) |
| [#6](https://github.com/minhung1126/toolbox/issues/6) | [App context 盤點](APP_CONTEXT_AUDIT.md) |
| [#9](https://github.com/minhung1126/toolbox/issues/9) | [依賴稽核](DEPENDENCY_AUDIT_2026-09-29.md) |
| [#10](https://github.com/minhung1126/toolbox/issues/10) | [瀏覽器測試與視覺基準](../frontend/e2e/README.md) |

上述工作已由 [GitHub CI](https://github.com/minhung1126/toolbox/actions/workflows/browser-tests-main.yml) 驗證，瀏覽器測試均在 GitHub 執行。

## 執行順序

1. #7 取得專用帳號後，使用事先定義的測試資料執行真實 provider 流程。
2. #8 取得隔離環境與資料副本後，使用已通過同 SHA CI 的映像演練，並把限制寫回部署文件。

## 每批交付的共同要求

- 維持既有 URL、API 語意、使用者資料與 localStorage key 相容；若必須變更資料格式，另行規劃備份、舊版讀取及回退。
- 對非可逆操作保留「結果不明先對帳」規則，避免因逾時或格式錯誤直接重送。
- 使用對應的單元、HTTP、瀏覽器與視覺測試驗證變更。預設 CI 使用假 provider，不呼叫真實 Google／YouTube 帳號。
- 發布使用與檢查結果相同的 commit SHA；分支保護與 required checks 的實際設定納入 #8 核對。

目前維持單體部署及既有 JSON 格式。多主機實例、網路檔案系統鎖定語意、資料庫或外部佇列須在確有部署需求時另行設計與驗證。
