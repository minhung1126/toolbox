# 瀏覽器與視覺驗證

`npm run test:e2e` 執行 provider fake 的功能與 390／768／1440 px 版面驗證。未安裝 Playwright Chromium 的 Windows 環境可先設定 `$env:PLAYWRIGHT_BROWSER_CHANNEL='msedge'`。

`npm run test:visual` 使用 Windows／Microsoft Edge，比對 `visual-baselines/` 中已審核的 9 張圖片：三種寬度的元件狀態、鍵盤焦點及 Dashboard／導覽。預設 `updateSnapshots: 'none'`，缺少圖片或出現差異會失敗。

畫面有預期變更時，先執行 `npm run test:visual -- --update-snapshots`，檢視每張變更圖片，再以不帶更新旗標的命令確認可重現。不得將自動更新基準列為 CI 步驟。測試固定 locale、timezone、device scale、color scheme 及 reduced motion，使用固定 API fake；CSS 動畫在截圖時停用。

GitHub CI 在 push 至 `main` 時執行 Linux Chromium 功能 E2E、Windows Edge 視覺比對及 Linux Chromium 視覺比對。Linux 基準位於 `visual-baselines-linux/`，CI 安裝 Noto Sans CJK 並固定 locale、timezone、色彩模式與動畫。初次缺少 Linux 基準時 CI 產生 `visual-linux-results` artifact 並標示失敗；檢視所有圖片後提交基準，再重新執行比對。跨平台的字型與文字換行可不同，兩套基準不得互相複製。

瀏覽器測試由 GitHub CI 執行。本機可在需要排查時手動執行上列命令；CI 不會自動接受更新後的基準。

Windows Edge 的 Dashboard 截圖容許最多 20 個不同像素。CI artifact 顯示差異僅落在少數圖示的字形柵格化；其餘畫面及 Linux Chromium 基準仍採逐像素比較。
