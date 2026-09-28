# 前端依賴稽核（2026-09-29）

以 Node 22、`frontend/package-lock.json` 執行：

```sh
cd frontend
npm ci
npm audit --json
npm audit --omit=dev --audit-level=high
```

更新前 `npm audit --json` 回報 7 個項目（critical 1、high 1、moderate 5）；正式依賴有 React Router 兩項 moderate。更新後完整稽核與正式依賴門檻皆為 **0 個公告**。正式依賴 high 以上門檻通過本身並不代表開發依賴無公告，因此保留完整稽核命令與 CI artifact。

| 套件 | 處置 | 理由 |
| --- | --- | --- |
| Vite 5 → 8.3.1 | 升級 | 修正 Windows 開發伺服器檔案存取等公告，並移除受影響的 esbuild 版本。 |
| Vitest 2 → 4.1.11 | 升級 | 修正 Vitest UI 與 mocker 路徑公告；與 Vite 8 相容。 |
| React Router DOM 6 → 7.18.4 | 升級 | 修正 open redirect 與 SSR hydration 公告；既有 SPA 路由測試與 build 通過。 |
| React Vite plugin 4 → 6.1.1 | 升級 | 與 Vite 8 的 peer dependency 對齊。 |
| Node builder／CI 20 → 22 | 升級 | 符合新版工具鏈的 engine 要求；Docker builder 維持 digest 鎖定。 |

稽核依據：[Vite Windows 路徑公告](https://github.com/advisories/GHSA-fx2h-pf6j-xcff)、[Vitest UI 公告](https://github.com/advisories/GHSA-5xrq-8626-4rwp)、[React Router redirect 公告](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6)、[React Router SSR 公告](https://github.com/advisories/GHSA-337j-9hxr-rhxg)。本專案使用瀏覽器端 `BrowserRouter`，SSR 公告的攻擊路徑不適用，但仍隨同版本修復。

在 Windows Node 22 上完成 `npm ci`、Vitest、typecheck 與 production build。推送 `main` 後，`browser-tests-main.yml` 會呼叫 `validate-container.yml` 驗證 Linux Node 22、Chromium E2E 與 Docker build，並執行視覺比對。
