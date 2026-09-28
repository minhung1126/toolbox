# Toolbox 重構計劃：剩餘工作

本文件只追蹤尚未完成的重構工作。已完成的修正、測試與 CI 紀錄保留在 Git 歷史及各次提交中；各項工作以對應 GitHub issue 作為後續追蹤與驗收來源。

## 待辦 issues

| Issue | 工作 | 驗收重點 |
| --- | --- | --- |
| [#3](https://github.com/minhung1126/toolbox/issues/3) | 共用 UI 與語意樣式 | 剩餘頁面採用共用元件、清理固定 inline layout 與重複樣式，三種視窗寬度及鍵盤操作驗收 |
| [#4](https://github.com/minhung1126/toolbox/issues/4) | Feature API 契約與 TypeScript | 盤點剩餘 API/model 邊界；格式錯誤與結果不明不得顯示為成功；補相關測試 |
| [#5](https://github.com/minhung1126/toolbox/issues/5) | 能力矩陣與授權分支 | 複合工作流逐操作核對前端提示、`required_scopes` 與 API 端拒絕行為 |
| [#6](https://github.com/minhung1126/toolbox/issues/6) | 後端組裝與依賴傳遞 | 清理剩餘匯入副作用，逐條以明確 dependency 取代隱式 request context |
| [#7](https://github.com/minhung1126/toolbox/issues/7) | 真實 provider smoke test | 專用帳號驗證 OAuth callback、token refresh 與 Weverse 流程；記錄對帳結果 |
| [#8](https://github.com/minhung1126/toolbox/issues/8) | 部署與回退演練 | 隔離環境用固定 SHA 與資料副本演練中斷、備份、回退及舊版讀取 |
| [#9](https://github.com/minhung1126/toolbox/issues/9) | 依賴公告處理 | 重新稽核並評估 Vite／Vitest 升級及 React Router 公告 |
| [#10](https://github.com/minhung1126/toolbox/issues/10) | 視覺 CI 與測試收尾 | Linux Chromium 建立獨立基準，修正 Windows Playwright／Vite 收尾 |

## 執行順序

1. #3、#4、#5、#6、#9、#10 可分批平行處理；每批限定一個頁面、功能流程或明確的依賴邊界。
2. #7 在對應 API 契約與權限分支可驗證後執行，真實操作使用專用帳號與事先定義的測試資料。
3. #8 使用已通過同 SHA CI 的映像與資料副本，並把演練發現的限制寫回部署文件。

## 每批交付的共同要求

- 維持既有 URL、API 語意、使用者資料與 localStorage key 相容；若必須變更資料格式，另行規劃備份、舊版讀取及回退。
- 對非可逆操作保留「結果不明先對帳」規則，避免因逾時或格式錯誤直接重送。
- 使用對應的單元、HTTP、瀏覽器與視覺測試驗證變更。預設 CI 使用假 provider，不呼叫真實 Google／YouTube 帳號。
- 發布使用與檢查結果相同的 commit SHA；分支保護與 required checks 的實際設定納入 #8 核對。

目前維持單體部署及既有 JSON 格式。多主機實例、網路檔案系統鎖定語意、資料庫或外部佇列須在確有部署需求時另行設計與驗證。
