# 工作流漸進式修正交付紀錄

基準版本：`f2f9cef`。日期：2026-10-06（Asia/Taipei）。

## 寫入安全性

- `PlaylistWriteNotStarted` 表示 client 建立、認證能力或本機輸入驗證在送出 mutation 前失敗；只有這類錯誤且允許配額 fallback 時，才切換至 Data API。
- `PlaylistWriteOutcomeUnknown` 表示寫入已送出、可能已提交而未收到可驗證回應。停止後續寫入，保留已確認的成功數量，不自動 fallback。
- 新建清單逾時、缺少新清單 ID、移動回應缺少成功狀態與部分移動後逾時，都必須先核對。HTTP 使用既有 error contract，回傳 `409 / playlist_write_unknown / retryable=false`，不把 provider 原始例外或 token 放入 JSON。
- Data API 已建立新清單後發生配額不足，回傳既有新清單連結及部分完成結果，避免以可重試的建立錯誤誤導使用者再次建立。
- 排序頁顯示待核對狀態，清除舊 token／快取；使用者按「已核對播放清單」後，才能重新預覽。逾時、網路錯誤與無效套用回應也採相同規則。

## 前端狀態與型別

- 批次 workflow hook 已由 JS 改為 TS，使用型別化 reducer 模型；執行與設定持久化分成 `useBatchExecution`、`useBatchConfigPersistence`。
- reducer 明確表示 loading、previewing、ready、executing、reconciliation 與 completed；穩定的 setter adapters 支援逐步收斂舊呼叫者。
- 防重送使用同步 in-flight ref；預覽及配額估算會比對請求 generation／fingerprint，寫入結果會比對帳號／來源 generation。帳號切換取消尚未送出的 autosave，忽略舊帳號的完成狀態。
- 排序頁的執行狀態改用 TS reducer，選擇器、預覽及結果抽成 feature 下的 TSX 元件；保留既有公開頁面入口與匯出。
- 補回已儲存播放清單選擇的還原測試。既有 API 執行期回應驗證持續保留。
- 既有大型 JSX 頁面與其他 JS 模組仍採漸進式遷移，未全站啟用 `checkJs`。

## 後端依賴與服務

- `YoutubeWorkflowPorts` 是 frozen dataclass；provider 寫入採 Protocol，原有 mapping 僅在相容邊界轉換。
- 批次更新分成計畫準備、快照驗證、執行及既有結果彙整 port；維持 signed preview、帳號綁定及 quota slot fallback 語意。
- API 建立 workflow service 時明確綁定 app 的 account repository；播放清單路由把 app 的 YTMusic factory 與 token repository 明確傳入 threadpool。
- YTMusic 拆成 token 解析、純 metadata 函式與 provider writer。正式程式不再 import 或判斷 `MagicMock`；舊 import 路徑保留相容 re-export。
- legacy ContextVar／singleton helper fallback 暫留。新增驗收涵蓋同 owner 的雙 app、並行請求與背景 worker，不要求背景 worker 隱含繼承 app context。

## 相容性

維持既有 URL、成功回應欄位、標準錯誤 JSON 結構、持久化 JSON 格式及 localStorage／work-state keys。維持單體部署，未增加資料庫或外部佇列。

## 驗證結果

| 驗證 | 結果 |
| --- | --- |
| Ruff lint／format | 通過 |
| 完整後端 pytest | 339 項通過 |
| 前端 format／ESLint／Stylelint | 通過 |
| TypeScript strict typecheck／production build | 通過 |
| 完整 Vitest（`--maxWorkers=2`） | 81 個檔案、455 項通過 |
| 完整 fake-provider E2E | 43／45 通過；兩項失敗在原始 `f2f9cef` 副本重現 |
| 最終 build 的排序／批次更新 E2E | 2／2 通過 |
| Linux 視覺基準 | 6 項測試有差異；原始副本同樣失敗，六張實際截圖與原始副本逐檔 SHA-256 完全相同 |
| Windows Edge 視覺驗收 | 此 Linux 環境未執行 |

新增回歸涵蓋：建立已成功而回應逾時不觸發第二次建立、部分成功後停止、無法驗證的寫入回應、quota 耗盡後保留已建立清單、HTTP 非重試契約、防同步重送、過期回應忽略、帳號切換取消 autosave、保存的清單選擇還原及 app／worker 依賴隔離。

完整 pytest 原先在 sandbox 中停滯；最小 `anyio.to_thread` 重現也停滯。在 sandbox 外執行則完成。測試的暫存 `TOOLBOX_DATA_DIR` 與第三方 provider 網路封鎖均保留。

第一次同時跑整套 Vitest 與四個瀏覽器 worker 時，YouTube settings 的實際 autosave timer 測試受負載影響失敗；分開並限制 Vitest workers 後，完整測試通過。

### 既有瀏覽器限制

1. YouTube settings 在 768px 的 slot 卡片互相遮擋，導致「修改憑證」按鈕無法點擊。
2. Photo Curator 在 390px 產生 45px 水平溢出。
3. 系統 Chromium 151 對既有 Linux 截圖基準有差異；本次與原始副本的六張實際截圖完全相同。未更新或自動接受任何基準。

前兩項在乾淨的 `f2f9cef` 副本使用相同 Chromium 重現；它們涉及未修改的頁面。正式上線前仍須通過一致瀏覽器環境的 CI／視覺驗收，不能把本次記錄解讀為所有瀏覽器檢查已通過。

## 正式上線前保留工作

[#7 真實 provider smoke test](https://github.com/minhung1126/toolbox/issues/7) 與 [#8 部署回退演練](https://github.com/minhung1126/toolbox/issues/8) 依原指示維持暫緩；需要專用帳號、隔離部署環境與資料副本後驗收。本次未執行真實 provider 寫入或部署。
