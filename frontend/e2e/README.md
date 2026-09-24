# 瀏覽器與視覺驗證

`npm run test:e2e` 執行 provider fake 的功能與 390／768／1440 px 版面驗證。未安裝 Playwright Chromium 的 Windows 環境可先設定 `$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'`。

`npm run test:visual` 使用 Windows／Microsoft Edge，比對 `visual-baselines/` 中已審核的 9 張圖片：三種寬度的元件狀態、鍵盤焦點及 Dashboard／導覽。預設 `updateSnapshots: 'none'`，缺少圖片或出現差異會失敗。

畫面有預期變更時，先執行 `npm run test:visual -- --update-snapshots`，檢視每張變更圖片，再以不帶更新旗標的命令確認可重現。不得將自動更新基準列為 CI 步驟。測試固定 locale、timezone、device scale、color scheme 及 reduced motion，使用固定 API fake；CSS 動畫在截圖時停用。

基準目前限 Windows／Edge，沿用作業系統字型。Linux Chromium 的功能 E2E 不會錯用此基準；跨平台 CI 視覺門檻仍需在選定的固定瀏覽器與字型環境另行建立、檢視並提交基準。
