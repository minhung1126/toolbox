# 瀏覽器與視覺驗證

`npm run test:e2e` 執行 provider fake 的功能與 390／768／1440 px 版面驗證。未安裝 Playwright Chromium 的 Windows 環境可先設定 `$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'`。

功能、Windows Edge 視覺與 Linux Chromium 視覺測試分別使用 4173、4174、4175 埠。可用 `PLAYWRIGHT_PORT`、`PLAYWRIGHT_EDGE_VISUAL_PORT`、`PLAYWRIGHT_LINUX_VISUAL_PORT` 避開本機已占用的埠。三套測試各自啟動預覽服務，輸出位於 `test-results/e2e`、`test-results/visual-edge`、`test-results/visual-linux`。用 `--repeat-each=3 --retries=0` 可重跑特定案例，保留每輪的失敗資訊。

測試預覽停用開發 API 代理。瀏覽器在每個情境的 context 內攔截 API，避免導航或關閉頁面時轉送至本機後端。

`npm run test:visual` 使用 Windows／Microsoft Edge，比對 `visual-baselines/` 中已審核的 9 張圖片：三種寬度的元件狀態、鍵盤焦點及 Dashboard／導覽。預設 `updateSnapshots: 'none'`，缺少圖片或出現差異會失敗。

畫面有預期變更時，先執行 `npm run test:visual -- --update-snapshots`，檢視每張變更圖片，再以不帶更新旗標的命令確認可重現。不得將自動更新基準列為 CI 步驟。測試固定 locale、timezone、device scale、color scheme 及 reduced motion，使用固定 API fake；CSS 動畫在截圖時停用。

GitHub CI 在推送 `main` 或 `codex/test-*` 分支時執行 Linux Chromium 功能 E2E、Windows Edge 視覺比對及 Linux Chromium 視覺比對。測試分支另外將 `@responsive` 與 `@recovery` 案例各執行三輪，重試次數為零。Linux 基準位於 `visual-baselines-linux/`，CI 安裝 Noto Sans CJK 並固定 locale、timezone、色彩模式與動畫。基準缺少或比對失敗時，從 `visual-linux-results` artifact 逐張核對實際畫面後更新該平台基準。

瀏覽器測試由 GitHub CI 執行。本機可在需要排查時手動執行上列命令；CI 不會自動接受更新後的基準。

Windows Edge 的 Dashboard 截圖容許最多 20 個不同像素，共用元件與鍵盤焦點截圖容許 1 個不同像素。已人工核對 CI artifact，這些差異來自 Windows 主機間的圖示與邊緣柵格化。Linux Chromium 基準維持逐像素比較。

`npm run test:benchmark` 按需執行六格複製、重複影片更新與讀取失敗後恢復的操作量測。單一 worker 逐一執行，並將點擊、設定頁跳轉與耗時寫入 `test-results/benchmarks/**/workflow-metrics.json`。一般 E2E 有獨立案例驗證草稿清單收到 503 後可重新讀取，並確認過程中沒有提交變更。
