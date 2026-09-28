# App 組裝與相容 context（#6）

匯入 `backend.app.main` 只組裝預設 FastAPI app；設定金鑰及動態設定在 lifespan 或首個 HTTP 請求時初始化。`create_app()` 仍依既有行為在組裝時初始化其設定。SessionStore、CredentialStore 與 Settings 的模組預設實例均延遲產生金鑰；Weverse store 的建構只解析路徑及建立記憶體鎖。UploadWorker 的 executor 在工作啟動時建立。

| 資料流 | 明確依賴與尚存的相容 fallback |
| --- | --- |
| 設定 | `create_app(app_settings=...)` 綁定 app state；middleware 限定 request，lifespan 使用同一設定。無 request 的獨立 helper 仍回退至模組預設 `settings`。 |
| 憑證與 session | `create_app(credential_store=..., session_store=...)` 綁定 app state 與 middleware；FastAPI request 使用對應 store。舊 helper 在獨立呼叫時仍回退到模組預設 store。背景 thread 須明確傳入 store。 |
| 帳號狀態 | `create_app(account_state_store=...)` 綁定 middleware；舊 helper 在無 request 時仍可使用模組預設 store。 |
| Provider fake | `create_app(google_client_factory=..., ytmusic_client_factory=..., oauth_client_factories=...)` 綁定 app；request context 及 lifespan 分別設置及還原。 |
| Upload worker | 可透過 `create_app(upload_worker=...)` 注入；未注入時每個 app 組裝各自的 worker。 |

保留上述獨立 helper fallback 是為了舊版呼叫者與 JSON 資料格式相容；兩個 app 要隔離持久資料時需注入各自的設定與 store。`backend/tests/test_app_factory.py`、`test_settings_app_scope.py`、`test_session_app_scope.py` 與 `test_credential_app_scope.py` 檢查匯入、兩個 app、並行請求及 context 還原。CI 執行完整後端測試。
