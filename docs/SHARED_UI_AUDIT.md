# 共用 UI 頁面盤點（#3）

已逐頁檢查 `frontend/src/pages`。一般操作按鈕使用 `shared/ui` 的 `Button`；頁首、一般卡片、狀態及有固定標籤的欄位沿用 `PageHeader`、`Card`、`Badge`、`TextField` 等共用元件。這批將 Batch Update、FFmpeg、Google Account、Login、Photo Curator、Playlist Sort、Publish Cleaner、Setup Wizard、Weverse、YT Music 與 Weverse 歷史紀錄的重複按鈕移至共用實作。

| 頁面 | 保留的專用控制與原因 |
| --- | --- |
| Dashboard、Component Showcase、API Health、System Info、Not Found | 既有共用頁首、卡片、狀態或導覽，沒有同類舊式一般按鈕。 |
| YouTube 設定、連線、路由、配額與播放清單設定 | 既有共用設定元件；slot 切換和路由選項保留專用語意。 |
| Sheet Copy、Google Sheet Settings、Sticky Notes、System Settings | 表格欄位切換、搜尋清除、密鑰顯示與開關保留專用操作樣式；一般動作使用共用按鈕。 |
| FFmpeg、Photo Curator | 時間軸把手、媒體卡選取與拖放區保留專用控制；檔案輸入使用 `hidden` 屬性。 |
| Playlist Sort、Batch Update、Publish Cleaner、Weverse、YT Music | 播放清單列、批次選取、分頁、工作進度等領域控制保留 feature CSS；一般提交、重新整理及取消使用共用按鈕。 |

頁面剩餘 inline style 僅用於 FFmpeg 時間軸的位置／比例和 Weverse 工作進度寬度，值由資料計算。共用色彩、間距與焦點樣式由 `shared/ui` 及語意 token 提供，專用佈局留在 feature CSS。

瀏覽器回歸由 GitHub CI 執行：`frontend/e2e/component-showcase.spec.ts` 檢查 390／768／1440 px 的水平溢位與互動；`layout.visual.spec.ts` 比對三種寬度及鍵盤焦點。基準圖片與差異圖見 CI artifact。元件、Stylelint、typecheck 與 build 在 `validate-container.yml` 檢查。

視覺基準須在各自的 CI 環境產生：Linux 使用 Ubuntu 24.04、`fonts-noto-cjk` 與 lockfile 對應的 Playwright Chromium；Windows 使用 Windows Server 2022 與 Microsoft Edge。視覺設定刻意忽略一般 E2E 的 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`／`PLAYWRIGHT_BROWSER_CHANNEL`，避免以本機系統瀏覽器覆寫基準。截圖前會等待工具目錄與帳號偏好載入完成。更新圖片前先審核實際畫面與差異圖，再提交各平台的預期基準；一般 CI 執行保持 `updateSnapshots: 'none'`。
