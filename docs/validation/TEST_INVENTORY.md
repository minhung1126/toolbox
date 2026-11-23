# Toolbox 測試逐項裁決

盤點基準為修正前的 <code>776a82e</code>，依測試工具實際收集的案例對照原始程式。共 156 個測試檔、1,129 個案例。pytest 有 481 項、Vitest 有 569 項、Playwright 有 73 項功能測試和 6 項視覺情境。每個視覺情境在 Edge／Windows 與 Chromium／Linux 各執行一次，兩套平台共 18 張快照。

同一宣告的參數化案例列在同一行，每個值都列出。每行適用同一裁決。保留項的必要性由該檔的用途及該行列出的行為共同說明。原行號依盤點基準定位。

| 裁決 | 執行方式 |
| --- | --- |
| 保留 | 測試保障一項仍有用途的行為、輸入邊界或整合風險。 |
| 改寫完成 | 本次更新測試或前置條件，保留該行列出的保障。 |
| 合併完成 | 保障已交由具名測試承接，移除重複案例。 |
| 已移作量測 | 透過按需量測套件輸出操作數與耗時。同一工作流的正確性有獨立驗收。 |

[修正計畫](../TEST_REWRITE_PLAN.md)

## pytest

<details><summary><code>backend/tests/test_account_state.py</code> · 8 項</summary>

直接驗證帳號資料隔離、工作狀態鍵、損毀後重試與寫入失敗的可見狀態。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_account_state.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 7 | <code>test_account_state_isolated_by_google_subject</code> | 保留 |  |
| 21 | <code>test_account_creation_does_not_copy_external_settings</code> | 保留 |  |
| 30 | <code>test_dynamic_key_registration</code> | 保留 |  |
| 53 | <code>test_ytmusic_work_state_keys_supported_by_default</code> | 保留 |  |
| 72 | <code>test_lazy_account_state_rejects_corrupt_file_until_repaired</code><br>參數（3 項） <code>{broken</code>、<code>null</code>、<code>{}</code> | 保留 |  |
| 86 | <code>test_account_state_write_failure_does_not_expose_unsaved_value</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_account_state_app_scope.py</code> · 3 項</summary>

跨 app 同時請求可揭露工作狀態及語系的 context 洩漏。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_account_state_app_scope.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 25 | <code>test_account_repository_and_dynamic_validation_are_app_scoped</code> | 保留 |  |
| 45 | <code>test_overlapping_sync_requests_keep_repository_and_locale_isolated</code> | 保留 |  |
| 73 | <code>test_repository_context_resets_after_failed_request</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_app_factory.py</code> · 2 項</summary>

子程序可抓到匯入副作用與預設編碼問題。雙 app 測試保護 provider adapter 綁定。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_app_factory.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 8 | <code>test_importing_default_app_does_not_initialize_persistent_state</code> | 改寫完成 | 用非 UTF-8 預設的隔離子程序驗證正常匯入、無持久化副作用，並提供有界失敗。 |
| 22 | <code>test_factory_keeps_workflow_adapters_per_app</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_configuration_persistence_failures.py</code> · 13 項</summary>

保存失敗與檔案損毀是資料遺失風險，必須驗證磁碟與記憶體狀態。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_configuration_persistence_failures.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 19 | <code>test_runtime_write_failure_preserves_policy_and_does_not_return_success</code> | 保留 |  |
| 42 | <code>test_system_credentials_write_failure_preserves_saved_and_active_credentials</code> | 保留 |  |
| 63 | <code>test_corrupt_configuration_is_not_overwritten</code><br>參數（9 項） <code>{bad-json-runtime</code>、<code>{bad-json-credentials</code>、<code>{bad-json-master-keys</code>、<code>null-runtime</code>、<code>null-credentials</code>、<code>null-master-keys</code>、<code>[]-runtime</code>、<code>[]-credentials</code>、<code>[]-master-keys</code> | 保留 |  |
| 81 | <code>test_wrong_encryption_key_does_not_overwrite_system_credentials</code> | 保留 |  |
| 92 | <code>test_master_key_and_setup_pin_failures_are_retryable_not_cached</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_credential_app_scope.py</code> · 7 項</summary>

憑證儲存、刷新、斷線與背景工作須各自使用注入的 app repository。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_credential_app_scope.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 40 | <code>test_service_disconnect_and_custom_token_are_app_scoped</code> | 保留 |  |
| 62 | <code>test_playlist_preview_uses_each_apps_credential_repository</code> | 保留 |  |
| 115 | <code>test_playlist_api_does_not_expose_provider_exception_text</code> | 保留 |  |
| 143 | <code>test_playlist_provider_uses_explicit_store_without_credential_context</code> | 保留 |  |
| 175 | <code>test_refresh_uses_and_persists_only_injected_credentials</code> | 保留 |  |
| 199 | <code>test_overlapping_sync_requests_keep_credential_writes_isolated</code> | 保留 |  |
| 219 | <code>test_credential_context_resets_after_failure_and_preserves_fallback</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_decoupled_auth.py</code> · 10 項</summary>

登入、Sheets、Drive、YouTube 與音樂庫的授權範圍和舊資料相容性分別會改變 API 可用性。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_decoupled_auth.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 44 | <code>test_scopes_are_strictly_decoupled</code> | 保留 |  |
| 57 | <code>test_login_only_session_keeps_connection_pages_available_but_rejects_provider_actions</code> | 保留 |  |
| 101 | <code>test_creator_workflow_requires_sheets_but_publish_does_not</code> | 保留 |  |
| 181 | <code>test_creator_operations_reject_mismatched_youtube_channels_before_provider_calls</code> | 保留 |  |
| 235 | <code>test_require_sheets_credentials_rejects_login_only_and_accepts_sheets</code> | 保留 |  |
| 279 | <code>test_require_drive_credentials_rejects_login_only_and_accepts_drive</code> | 保留 |  |
| 322 | <code>test_legacy_credentials_with_scopes_fallback_cleanly</code> | 保留 |  |
| 358 | <code>test_clear_sheets_and_drive</code> | 保留 |  |
| 380 | <code>test_ytmusic_decoupled_credentials</code> | 保留 |  |
| 425 | <code>test_validate_ytmusic_custom_token_endpoint</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_error_contract.py</code> · 6 項</summary>

欄位驗證、服務錯誤分類及 API 回應遮蔽須維持一致。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_error_contract.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 20 | <code>test_error_detail_has_required_shape_and_drops_unapproved_fields</code> | 保留 |  |
| 41 | <code>test_validation_handler_returns_traditional_chinese_field_contract</code> | 保留 |  |
| 65 | <code>test_http_exception_handler_does_not_echo_legacy_provider_detail</code> | 保留 |  |
| 82 | <code>test_youtube_provider_mapping_distinguishes_categories_without_raw_body</code> | 保留 |  |
| 101 | <code>test_sheets_provider_mapping_distinguishes_categories</code> | 保留 |  |
| 120 | <code>test_validation_contract_is_used_by_real_app_handler</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_ffmpeg_generator.py</code> · 7 項</summary>

API 路由、UTF-8 預設、裁切時間與引數產出均有獨立的呼叫契約。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_ffmpeg_generator.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 13 | <code>test_ffmpeg_generator_plugin_metadata</code> | 合併完成 | 由 catalog 的 FFmpeg 細節查詢驗證 ID、名稱、狀態及入口。 |
| 22 | <code>test_seconds_to_hhmmss_and_parse</code> | 保留 |  |
| 33 | <code>test_safe_quote_filename</code> | 保留 |  |
| 40 | <code>test_ffmpeg_presets_api</code> | 改寫完成 | 在獨立 app 驗證主要預設與中文描述，同時保留基本預設數量。 |
| 54 | <code>test_ffmpeg_parse_time_api</code> | 改寫完成 | 獨立 app 保護 HTTP 輸入分支與失敗狀態。 |
| 87 | <code>test_ffmpeg_build_command_stream_copy</code> | 改寫完成 | 獨立 app 保護快速 seek 和相對裁切長度。 |
| 114 | <code>test_ffmpeg_build_command_reencode</code> | 改寫完成 | 獨立 app 保護重編碼、縮放、fps 及 Shell 格式。 |

</details>

<details><summary><code>backend/tests/test_frontend_cache.py</code> · 4 項</summary>

HTML 與雜湊資產的快取期限會影響部署後能否載入頁面。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_frontend_cache.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 31 | <code>test_html_requires_revalidation</code> | 保留 |  |
| 36 | <code>test_hashed_javascript_and_css_are_immutable_for_one_year</code> | 保留 |  |
| 44 | <code>test_unhashed_or_non_frontend_assets_do_not_get_long_lived_cache</code> | 保留 |  |
| 49 | <code>test_security_middleware_applies_cache_policy_to_html_and_hashed_assets</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_google_auth_failures.py</code> · 23 項</summary>

撤銷與暫時網路錯誤有不同的恢復步驟，且不能中斷既有登入。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_google_auth_failures.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 63 | <code>test_revoked_service_tokens_stop_retrying_across_fallbacks_and_restarts</code> | 保留 |  |
| 118 | <code>test_temporary_refresh_failure_waits_then_recovers_without_reauthorization</code><br>參數（2 項） <code>False</code>、<code>True</code> | 保留 |  |
| 163 | <code>test_sheets_errors_report_safe_action_and_preserve_login</code><br>參數（20 項） <code>SERVICE_DISABLED-403-sheets_api_disabled-metadata</code>、<code>SERVICE_DISABLED-403-sheets_api_disabled-parse-options</code>、<code>SERVICE_DISABLED-403-sheets_api_disabled-people</code>、<code>SERVICE_DISABLED-403-sheets_api_disabled-random-member-preview</code>、<code>SERVICE_DISABLED-403-sheets_api_disabled-copy-table</code>、<code>ACCESS_TOKEN_SCOPE_INSUFFICIENT-403-google_sheets_scope_required-metadata</code>、<code>ACCESS_TOKEN_SCOPE_INSUFFICIENT-403-google_sheets_scope_required-parse-options</code>、<code>ACCESS_TOKEN_SCOPE_INSUFFICIENT-403-google_sheets_scope_required-people</code>、<code>ACCESS_TOKEN_SCOPE_INSUFFICIENT-403-google_sheets_scope_required-random-member-preview</code>、<code>ACCESS_TOKEN_SCOPE_INSUFFICIENT-403-google_sheets_scope_required-copy-table</code>、<code>CREDENTIALS_MISSING-401-sheets_reauthorization_required-metadata</code>、<code>CREDENTIALS_MISSING-401-sheets_reauthorization_required-parse-options</code>、<code>CREDENTIALS_MISSING-401-sheets_reauthorization_required-people</code>、<code>CREDENTIALS_MISSING-401-sheets_reauthorization_required-random-member-preview</code>、<code>CREDENTIALS_MISSING-401-sheets_reauthorization_required-copy-table</code>、<code>None-403-sheets_permission_denied-metadata</code>、<code>None-403-sheets_permission_denied-parse-options</code>、<code>None-403-sheets_permission_denied-people</code>、<code>None-403-sheets_permission_denied-random-member-preview</code>、<code>None-403-sheets_permission_denied-copy-table</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_google_client_scope.py</code> · 3 項</summary>

不同 app 必須走各自的 Sheets 工廠與憑證，即使並行或有 provider 錯誤。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_google_client_scope.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 15 | <code>test_sheets_http_requests_use_each_apps_factory_and_credentials</code> | 保留 |  |
| 53 | <code>test_client_context_restores_after_failure_and_does_not_cache_credentials</code> | 保留 |  |
| 71 | <code>test_provider_failure_keeps_api_error_contract_and_other_context_usable</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_google_oauth_scope_expansion.py</code> · 7 項</summary>

OAuth 權限擴充、必需 scope 及錯誤分類保護首次登入與再次登入。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_google_oauth_scope_expansion.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 56 | <code>test_login_accepts_scope_expansion_without_redeeming_code_twice</code><br>參數（3 項） <code>extra_scopes0</code>、<code>extra_scopes1</code>、<code>extra_scopes2</code> | 保留 |  |
| 87 | <code>test_login_rejects_missing_scopes_and_invalid_tokens</code><br>參數（3 項） <code>payload0-Warning</code>、<code>payload1-MissingTokenError</code>、<code>payload2-InvalidGrantError</code> | 保留 |  |
| 94 | <code>test_unrelated_warning_is_not_swallowed</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_health.py</code> · 4 項</summary>

配置就緒、工具啟動失敗和健康 API 的欄位會影響部署判斷。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_health.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 4 | <code>test_health_reports_configuration_readiness_without_secrets</code> | 保留 |  |
| 22 | <code>test_health_explains_why_login_is_not_ready</code> | 保留 |  |
| 38 | <code>test_health_marks_failed_active_tool_not_ready</code> | 保留 |  |
| 57 | <code>test_system_health_endpoint_matches</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_import_side_effects.py</code> · 2 項</summary>

在乾淨子程序分別驗證純匯入與明確建立 repository，保護金鑰和資料持久化時機。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_import_side_effects.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 9 | <code>test_importing_core_modules_does_not_create_data_files</code> | 保留 |  |
| 43 | <code>test_explicit_store_construction_resolves_persistent_key_before_app_creation</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_lazy_auth_repositories.py</code> · 14 項</summary>

首次延遲載入、損毀後修復及競爭寫入可能覆蓋已有的授權資料。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_lazy_auth_repositories.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 29 | <code>test_construction_does_not_read_and_first_write_preserves_existing_records</code><br>參數（2 項） <code>session</code>、<code>credential</code> | 保留 |  |
| 51 | <code>test_corrupt_store_is_not_overwritten_and_recovery_can_retry</code><br>參數（8 項） <code>session-{broken-json</code>、<code>session-null</code>、<code>session-[]</code>、<code>session-{}</code>、<code>credential-{broken-json</code>、<code>credential-null</code>、<code>credential-[]</code>、<code>credential-{}</code> | 保留 |  |
| 64 | <code>test_failed_reads_retry_and_failed_writes_do_not_publish_cached_mutations</code><br>參數（2 項） <code>session</code>、<code>credential</code> | 保留 |  |
| 97 | <code>test_concurrent_first_writes_load_once_without_losing_existing_records</code><br>參數（2 項） <code>session</code>、<code>credential</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_oauth_client_scope.py</code> · 5 項</summary>

PKCE、token exchange、刷新與注入工廠由 app 決定，需在 HTTP 或真實 credential 物件邊界驗證。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_oauth_client_scope.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 22 | <code>test_auth_url_uses_app_flow_factory_with_pkce_and_scopes</code> | 保留 |  |
| 47 | <code>test_concurrent_apps_keep_oauth_flow_factories_isolated</code> | 保留 |  |
| 78 | <code>test_injected_transport_refreshes_real_credentials_and_persists_only_to_own_app</code> | 保留 |  |
| 124 | <code>test_factory_context_restores_on_failure_and_partial_injection_uses_defaults</code> | 保留 |  |
| 139 | <code>test_code_exchange_preserves_pkce_and_uses_injected_flow</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_photo_curator.py</code> · 3 項</summary>

API 預設和清單輸出保護仍然可呼叫的後端契約。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_photo_curator.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 8 | <code>test_photo_curator_plugin_metadata</code> | 合併完成 | 由 catalog 的 Photo Curator 細節查詢驗證 ID、名稱、狀態及入口。 |
| 17 | <code>test_photo_curator_presets_api</code> | 保留 |  |
| 33 | <code>test_photo_curator_checklist_api</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_playlist_sort_service.py</code> · 37 項</summary>

排序鍵、地區、單曲／合輯、缺資料與寫入 fallback 各自影響曲序、配額或結果回報。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_playlist_sort_service.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 17 | <code>test_parse_iso8601_duration</code> | 保留 |  |
| 26 | <code>test_sort_by_title</code> | 保留 |  |
| 35 | <code>test_sort_by_artist</code> | 保留 |  |
| 45 | <code>test_sort_by_added_at</code> | 保留 |  |
| 59 | <code>test_sort_by_published_at</code> | 保留 |  |
| 73 | <code>test_sort_by_duration</code> | 保留 |  |
| 86 | <code>test_sort_multi_keys</code> | 保留 |  |
| 96 | <code>test_sort_random</code> | 保留 |  |
| 104 | <code>test_build_sort_preview</code> | 保留 |  |
| 119 | <code>test_sort_empty_list</code> | 保留 |  |
| 123 | <code>test_sort_single_item</code> | 保留 |  |
| 128 | <code>test_locale_aware_sort</code> | 保留 |  |
| 137 | <code>test_sort_by_album</code> | 保留 |  |
| 150 | <code>test_sort_by_track_number</code> | 保留 |  |
| 164 | <code>test_sort_track_number_missing_at_end</code> | 保留 |  |
| 177 | <code>test_sort_by_year</code> | 保留 |  |
| 191 | <code>test_sort_artist_album_track_multi_key</code> | 保留 |  |
| 214 | <code>test_sort_album_respects_track_number</code> | 保留 |  |
| 245 | <code>test_sort_by_year_with_same_year_release_date_fallback</code> | 保留 |  |
| 272 | <code>test_sort_artist_and_album_respects_track_number</code> | 保留 |  |
| 298 | <code>test_sort_album_singles_ordered_by_year</code> | 保留 |  |
| 335 | <code>test_sort_album_singles_with_cjk_album</code> | 保留 |  |
| 359 | <code>test_sort_album_videos_ordered_chronologically</code> | 保留 |  |
| 393 | <code>test_normalize_artist_name</code> | 保留 |  |
| 411 | <code>test_sort_artist_normalizes_topic_channels_together</code> | 保留 |  |
| 467 | <code>test_apply_sort_to_playlist_resolves_synthetic_ids_via_data_api</code> | 保留 |  |
| 566 | <code>test_apply_sort_to_playlist_new_playlist_via_data_api</code> | 保留 |  |
| 617 | <code>test_new_playlist_reports_item_without_video_id_as_failure</code> | 保留 |  |
| 647 | <code>test_partial_data_api_sort_does_not_return_provider_exception</code> | 保留 |  |
| 687 | <code>test_preview_sort_quota_estimate_no_custom_token[asyncio]</code> | 保留 |  |
| 724 | <code>test_split_artists_and_collaboration_detection</code> | 保留 |  |
| 740 | <code>test_sort_collaborative_song_first_author_in_album_order</code> | 保留 |  |
| 777 | <code>test_sort_collaborative_song_uncertain_first_author_stays_with_album</code> | 保留 |  |
| 802 | <code>test_sort_compilation_soundtrack_album_stays_together</code> | 保留 |  |
| 830 | <code>test_sort_single_collaboration_uses_first_author</code> | 保留 |  |
| 855 | <code>test_apply_sort_strict_defense_blocks_fallback_when_token_fails[asyncio]</code> | 保留 |  |
| 910 | <code>test_apply_sort_allows_fallback_when_explicitly_permitted[asyncio]</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_playlist_write_outcome.py</code> · 12 項</summary>

建立或移動結果不確定時，避免重複建立、遺失進度和錯誤扣配額。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_playlist_write_outcome.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 38 | <code>test_create_committed_then_timeout_never_creates_again</code><br>參數（2 項） <code>False</code>、<code>True</code> | 保留 |  |
| 57 | <code>test_partial_move_then_timeout_stops_and_preserves_progress</code> | 保留 |  |
| 81 | <code>test_unverifiable_move_response_requires_reconciliation</code><br>參數（3 項） <code>None</code>、<code>response1</code>、<code>response2</code> | 保留 |  |
| 91 | <code>test_api_unknown_outcome_is_not_an_auth_fallback_prompt</code> | 保留 |  |
| 114 | <code>test_explicit_writer_dependencies_survive_background_workers</code> | 保留 |  |
| 128 | <code>test_data_api_create_without_id_requires_reconciliation</code><br>參數（3 項） <code>None</code>、<code>response1</code>、<code>response2</code> | 保留 |  |
| 142 | <code>test_data_api_quota_exhaustion_after_create_returns_existing_playlist</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_preview.py</code> · 2 項</summary>

簽名預覽須綁定帳號與內容，序列化資料需適合後續核對。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_preview.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 11 | <code>test_preview_token_is_bound_to_owner_slot_operation_and_snapshot</code> | 保留 |  |
| 45 | <code>test_preview_snapshots_preserve_order_and_exclude_provider_payload</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_preview_security.py</code> · 5 項</summary>

公開 API 預覽鎖定實際人物與影片，過期或變更的輸入不得觸發 provider 寫入。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_preview_security.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 22 | <code>test_batch_preview_resolves_workflow_service_from_fastapi_dependency</code> | 保留 |  |
| 82 | <code>test_batch_preview_includes_each_video_and_marks_unassigned_items</code> | 保留 |  |
| 120 | <code>test_publish_stale_playlist_has_zero_writes</code> | 保留 |  |
| 141 | <code>test_batch_stale_sheet_has_zero_writes</code> | 保留 |  |
| 171 | <code>test_cross_team_signed_preview_updates_correct_rows_and_rejects_changed_identity</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_quota_app_scope.py</code> · 4 項</summary>

本機配額帳本與限流資料需要在不同 app 和例外路徑保持隔離。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_quota_app_scope.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 37 | <code>test_quota_api_and_provider_calls_use_app_ledgers</code> | 保留 |  |
| 69 | <code>test_rate_limits_do_not_block_another_app_or_execute_rejected_work</code> | 保留 |  |
| 97 | <code>test_explicit_rate_limiter_is_used</code> | 保留 |  |
| 105 | <code>test_quota_context_resets_after_failure_and_rejects_incomplete_maps</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_security.py</code> · 5 項</summary>

狀態有效性、帳號隔離、憑證加密與撤銷後的存取控制，是授權的基礎契約。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_security.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 19 | <code>test_oauth_state_is_tamper_expiry_and_salt_bound</code> | 保留 |  |
| 28 | <code>test_sessions_are_isolated_and_cookie_has_no_token</code> | 保留 |  |
| 40 | <code>test_no_cookie_is_rejected</code> | 保留 |  |
| 49 | <code>test_credential_store_encrypts_and_rejects_wrong_key</code> | 保留 |  |
| 69 | <code>test_revoked_email_is_blocked_on_api_access</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_security_regressions.py</code> · 10 項</summary>

驗證靜態資源邊界、正式環境預設、安全回應標頭、敏感回應及輸入上限。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_security_regressions.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 20 | <code>test_frontend_path_traversal_cannot_escape_dist</code> | 保留 |  |
| 28 | <code>test_production_settings_fail_closed_and_use_host_only_cookies</code> | 保留 |  |
| 58 | <code>test_production_oauth_flow_cookie_has_secure_host_only_attributes</code> | 保留 |  |
| 78 | <code>test_credentials_are_isolated_by_oidc_subject</code> | 保留 |  |
| 100 | <code>test_foreign_origin_is_rejected_for_mutations</code> | 保留 |  |
| 119 | <code>test_production_requires_origin_or_referer</code> | 保留 |  |
| 138 | <code>test_quota_usage_requires_login</code> | 保留 |  |
| 143 | <code>test_provider_exception_is_not_returned_to_the_client</code> | 保留 |  |
| 157 | <code>test_security_headers_are_present</code> | 保留 |  |
| 167 | <code>test_batch_input_has_a_bounded_assignment_count</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_session_app_scope.py</code> · 4 項</summary>

多 app 的登入、登出與 session 輪替須各自作用，錯誤後須還原 context。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_session_app_scope.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 16 | <code>test_cookie_authentication_and_logout_are_app_scoped</code> | 保留 |  |
| 50 | <code>test_overlapping_sync_requests_keep_session_writes_isolated</code> | 保留 |  |
| 73 | <code>test_session_context_resets_after_failure_and_preserves_fallback</code> | 保留 |  |
| 90 | <code>test_oauth_callback_creates_and_rotates_only_the_app_session</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_settings.py</code> · 10 項</summary>

分區設定、共用篩選持久化與工作狀態 schema 需相容已保存的資料。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_settings.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 9 | <code>test_scoped_settings_update_does_not_touch_other_resource</code> | 保留 |  |
| 32 | <code>test_youtube_settings_returns_only_youtube_resource</code> | 保留 |  |
| 50 | <code>test_youtube_routing_mode_is_account_scoped</code> | 保留 |  |
| 68 | <code>test_youtube_playlist_write_normalizes_url_without_quota_write</code> | 保留 |  |
| 85 | <code>test_combined_youtube_write_endpoint_is_closed</code> | 保留 |  |
| 93 | <code>test_team_person_filter_normalizes_and_persists_as_one_shared_record</code> | 保留 |  |
| 117 | <code>test_team_person_filter_requires_the_shared_record</code> | 保留 |  |
| 132 | <code>test_youtube_draft_response_uses_the_current_config_shape</code> | 保留 |  |
| 161 | <code>test_work_state_update_ytmusic_keys_allowed</code> | 保留 |  |
| 179 | <code>test_work_state_update_rejects_unsupported_key</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_settings_app_scope.py</code> · 6 項</summary>

注入設定影響 OAuth、來源檢查、白名單及 lifecycle，可能跨執行緒或 app 串用。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_settings_app_scope.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 44 | <code>test_settings_writes_and_environment_defaults_are_app_scoped</code> | 保留 |  |
| 78 | <code>test_oauth_url_signing_cookies_and_origin_policy_use_app_settings</code> | 保留 |  |
| 109 | <code>test_login_allowlist_is_app_scoped_without_auth_overrides</code> | 保留 |  |
| 133 | <code>test_concurrent_settings_context_and_exception_cleanup</code> | 保留 |  |
| 165 | <code>test_local_oauth_does_not_require_process_transport_override</code> | 保留 |  |
| 179 | <code>test_lifespan_uses_and_restores_injected_settings</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_sheets_youtube.py</code> · 4 項</summary>

中文欄位、同名人物、團體與重複列會改變實際套用的標題與描述。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_sheets_youtube.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 5 | <code>test_sheet_matching_supports_unicode_and_whole_team</code> | 保留 |  |
| 12 | <code>test_duplicate_rows_only_pass_when_output_values_match</code> | 保留 |  |
| 19 | <code>test_composite_keys_distinguish_same_names_and_team_rows</code> | 保留 |  |
| 37 | <code>test_parse_options_returns_complete_deduplicated_identities_and_existing_aliases</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_sticky_notes.py</code> · 12 項</summary>

便利貼的隔離、舊資料、模板獨立性及寫入失敗後的狀態各自有資料風險。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_sticky_notes.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 18 | <code>test_notes_store_crud</code> | 保留 |  |
| 56 | <code>test_notes_store_user_isolation</code> | 保留 |  |
| 70 | <code>test_notes_store_search_and_ordering</code> | 保留 |  |
| 95 | <code>test_notes_store_rejects_corrupt_file_without_overwriting</code><br>參數（3 項） <code>{broken</code>、<code>null</code>、<code>{}</code> | 保留 |  |
| 104 | <code>test_notes_write_failure_does_not_expose_unsaved_change</code> | 保留 |  |
| 120 | <code>test_sticky_notes_api_endpoints</code> | 保留 |  |
| 175 | <code>test_sticky_notes_repository_is_isolated_per_app</code> | 保留 |  |
| 192 | <code>test_template_persistence_and_independent_copy</code> | 保留 |  |
| 214 | <code>test_template_api_round_trip_and_validation</code> | 保留 |  |
| 240 | <code>test_legacy_notes_remain_readable</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_system_api.py</code> · 7 項</summary>

初始化、PIN、憑證與帳號政策的 HTTP 契約影響是否能登入和維運。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_system_api.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 27 | <code>test_setup_status_endpoint</code> | 保留 |  |
| 41 | <code>test_perform_initial_setup</code> | 保留 |  |
| 70 | <code>test_setup_rejected_with_invalid_pin</code> | 保留 |  |
| 91 | <code>test_get_and_update_credentials</code> | 保留 |  |
| 106 | <code>test_allowlist_management_and_lockout_guard</code> | 保留 |  |
| 159 | <code>test_update_youtube_slot_endpoint</code> | 保留 |  |
| 177 | <code>test_allow_new_users_toggle_and_restriction</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_system_secrets_and_config.py</code> · 5 項</summary>

驗證金鑰生成、加密、PIN 效期及動態設定的持久化規則。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_system_secrets_and_config.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 9 | <code>test_system_secrets_master_keys_auto_generation_and_persistence</code> | 保留 |  |
| 36 | <code>test_system_secrets_oauth_credentials_aes_encryption</code> | 保留 |  |
| 74 | <code>test_system_secrets_setup_pin_lifecycle</code> | 保留 |  |
| 98 | <code>test_runtime_config_allowlist_helpers</code> | 保留 |  |
| 115 | <code>test_settings_sync_dynamic_config</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_token_management.py</code> · 2 項</summary>

真實憑證物件的刷新狀態及舊 refresh token 需跨儲存往返保留。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_token_management.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 22 | <code>test_google_credentials_are_persistent_and_proactively_refreshed</code> | 保留 |  |
| 48 | <code>test_google_reconnect_without_refresh_token_preserves_previous_refresh_token</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_tool_catalog.py</code> · 6 項</summary>

工具清單、細節、404 與前後端 manifest 一致性，決定功能入口可用。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_tool_catalog.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 9 | <code>test_tool_catalog_lists_registered_tools</code> | 保留 |  |
| 28 | <code>test_tool_catalog_get_tool_detail</code> | 保留 |  |
| 41 | <code>test_tool_catalog_get_ytmusic_detail</code> | 保留 |  |
| 55 | <code>test_tool_catalog_not_found</code> | 保留 |  |
| 66 | <code>test_backend_tool_catalog_matches_frontend_manifest_contract</code> | 保留 |  |
| 119 | <code>test_tool_capability_copy_matches_runtime_and_does_not_promise_missing_writes</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_tool_registry.py</code> · 6 項</summary>

啟動、停用與掛載由 registry 決定，須在 app lifecycle 一起驗證。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_tool_registry.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 13 | <code>test_builtin_tools_are_registered</code> | 保留 |  |
| 39 | <code>test_custom_tool_registration_and_lifecycle</code> | 保留 |  |
| 106 | <code>test_plugin_startup_failure_is_visible_in_health_without_leaking_exception</code> | 保留 |  |
| 139 | <code>test_unhealthy_plugin_is_unavailable_in_catalog</code> | 保留 |  |
| 163 | <code>test_disabled_plugin_is_listed_but_never_started_or_mounted</code> | 保留 |  |
| 211 | <code>test_tools_catalog_api</code> | 合併完成 | 由 catalog 清單、細節、未知 ID 三個 HTTP 測試承接。 |

</details>

<details><summary><code>backend/tests/test_workflow_improvements.py</code> · 43 項</summary>

作業 claim、備份重啟、唯讀核對與退役工具保護是獨立的健全性要求。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_workflow_improvements.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 24 | <code>test_bash_receives_exact_argv</code><br>參數（22 項） <code>single-\u4e2d\u6587 \u5f71\u7247.mp4</code>、<code>single-clip_$((2+3)).mp4</code>、<code>single-clip_$(printf expanded).mp4</code>、<code>single-clip_`printf expanded`.mp4</code>、<code>single-a&#x27;b.mp4</code>、<code>single-a&quot;b.mp4</code>、<code>single-folder\\clip.mp4</code>、<code>single-50%.mp4</code>、<code>single-clip!(x)&amp;y.mp4</code>、<code>single-  spaced .mp4</code>、<code>single-tail\\</code>、<code>multiline-\u4e2d\u6587 \u5f71\u7247.mp4</code>、<code>multiline-clip_$((2+3)).mp4</code>、<code>multiline-clip_$(printf expanded).mp4</code>、<code>multiline-clip_`printf expanded`.mp4</code>、<code>multiline-a&#x27;b.mp4</code>、<code>multiline-a&quot;b.mp4</code>、<code>multiline-folder\\clip.mp4</code>、<code>multiline-50%.mp4</code>、<code>multiline-clip!(x)&amp;y.mp4</code>、<code>multiline-  spaced .mp4</code>、<code>multiline-tail\\</code> | 改寫完成 | 移至 FFmpeg suite，兩種版式逐筆比對整份 argv。Linux 使用 Bash，Windows 可指定 Git Bash。 |
| 40 | <code>test_invalid_times_are_not_coerced_to_zero</code><br>參數（8 項） <code>（空字串）</code>、<code>-1</code>、<code>NaN</code>、<code>Infinity</code>、<code>1:60</code>、<code>00:99:00</code>、<code>00:00:10junk</code>、<code>1e3</code> | 改寫完成 | 移至 FFmpeg suite，逐一識別不可化為零的輸入與錯誤欄位。 |
| 57 | <code>test_invalid_commands_return_field_errors</code><br>參數（5 項） <code>patch0</code>、<code>patch1</code>、<code>patch2</code>、<code>patch3</code>、<code>patch4</code> | 改寫完成 | 移至 FFmpeg suite，逐案核對 400、錯誤代碼及欄位，補齊 CMD 的拒絕範圍。 |
| 64 | <code>test_native_shell_round_trip_when_available</code><br>參數（2 項） <code>powershell-pwsh</code>、<code>cmd-cmd.exe</code> | 改寫完成 | 移至 FFmpeg suite，由原生 Shell 一次傳入支援的檔名。可攜測試獨立驗證拒絕案例。 |
| 97 | <code>test_claim_is_atomic_across_repository_instances_and_accounts</code> | 保留 |  |
| 118 | <code>test_unknown_write_is_durable_and_never_replayed_after_restart</code> | 保留 |  |
| 144 | <code>test_backup_restore_and_version_rejection_leave_existing_json_untouched</code> | 保留 |  |
| 164 | <code>test_journal_queries_are_account_scoped_and_retired_routes_unavailable</code> | 改寫完成 | 將固定工具總數改為直接核對退役工具缺席，保留帳號隔離與路由 404。 |
| 176 | <code>test_retired_callback_does_not_exchange_tokens</code> | 保留 |  |
| 197 | <code>test_http_journal_survives_restart_and_reconciliation_only_reads_provider</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_youtube_default_skip.py</code> · 8 項</summary>

僅可信任且最新的編輯結果可以略過，避免誤改或漏處理影片。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_youtube_default_skip.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 15 | <code>test_same_person_text_and_public_can_be_reversibly_skipped</code> | 保留 |  |
| 29 | <code>test_changed_targets_or_remote_state_are_never_silently_excluded</code><br>參數（5 項） <code>template</code>、<code>remote_text</code>、<code>private</code>、<code>unlisted</code>、<code>person</code> | 保留 |  |
| 48 | <code>test_public_matching_text_without_trusted_history_is_not_default_skipped</code> | 保留 |  |
| 55 | <code>test_pending_unknown_cannot_be_bypassed_by_force_include</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_youtube_direct_workflows.py</code> · 12 項</summary>

批次部分成功、配額用盡與 fallback 下的 provider 寫入不應跨頻道或漏回報。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_youtube_direct_workflows.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 96 | <code>test_metadata_direct_flow_continues_after_one_video_fails</code> | 保留 |  |
| 121 | <code>test_metadata_per_item_provider_error_is_classified</code> | 保留 |  |
| 150 | <code>test_single_video_metadata_update_preserves_existing_snippet</code> | 保留 |  |
| 180 | <code>test_single_video_metadata_quota_failure_switches_slot</code> | 保留 |  |
| 222 | <code>test_single_video_metadata_update_returns_not_found</code> | 保留 |  |
| 236 | <code>test_metadata_quota_block_keeps_partial_results_and_stops_writes</code> | 保留 |  |
| 260 | <code>test_metadata_quota_failure_switches_slot_and_continues</code> | 保留 |  |
| 288 | <code>test_metadata_preflight_quota_failure_switches_slot_before_writes</code> | 保留 |  |
| 388 | <code>test_cleanup_direct_retains_non_candidates_and_continues_after_failure</code> | 保留 |  |
| 410 | <code>test_cleanup_direct_quota_stops_later_candidates_without_publishing</code> | 保留 |  |
| 422 | <code>test_cleanup_direct_fallback_revalidates_same_channel</code> | 保留 |  |
| 446 | <code>test_cleanup_direct_cross_channel_fallback_never_deletes</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_youtube_draft_publish.py</code> · 31 項</summary>

發布需要精確的草稿、簽名快照、配額槽及不重送未知結果，涉及實際公開影片。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_youtube_draft_publish.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 234 | <code>test_stages_manual_content_without_writes_then_updates_and_publishes_once</code><br>參數（2 項） <code>Video</code>、<code>Shorts</code> | 保留 |  |
| 291 | <code>test_uses_minimum_necessary_parts_or_no_write</code><br>參數（3 項） <code>Applied title-Applied description-private-parts0</code>、<code>Original-Original description-public-parts1</code>、<code>Applied title-Applied description-public-parts2</code> | 保留 |  |
| 305 | <code>test_rejects_tampered_or_stale_plans_before_writing</code><br>參數（9 項） <code>manual</code>、<code>skip</code>、<code>stage</code>、<code>account</code>、<code>channel</code>、<code>sheet</code>、<code>playlist</code>、<code>metadata</code>、<code>type</code> | 保留 |  |
| 332 | <code>test_expired_final_preview_cannot_publish</code> | 保留 |  |
| 343 | <code>test_validates_final_fields_on_backend</code><br>參數（3 項） <code>patch0</code>、<code>patch1</code>、<code>patch2</code> | 保留 |  |
| 351 | <code>test_reconciles_lost_response_using_all_three_fields_without_resending</code><br>參數（2 項） <code>timeout_committed</code>、<code>incomplete_response</code> | 保留 |  |
| 361 | <code>test_unknown_write_survives_restart_and_blocks_new_previews_until_readonly_reconciliation</code> | 保留 |  |
| 386 | <code>test_partial_success_retries_only_explicitly_failed_rows</code> | 保留 |  |
| 400 | <code>test_quota_fallback_uses_same_channel_and_combined_request</code> | 保留 |  |
| 412 | <code>test_unassigned_video_cannot_be_published_by_tampering_with_skip</code> | 保留 |  |
| 421 | <code>test_can_skip_invalid_text_without_discarding_it_or_publishing_the_video</code> | 保留 |  |
| 430 | <code>test_existing_cleanup_removes_newly_published_video_without_another_publish_write</code> | 保留 |  |
| 452 | <code>test_empty_running_plan_is_not_mistaken_for_a_completed_preflight</code> | 保留 |  |
| 477 | <code>test_edit_status_tracks_only_confirmed_writes_and_survives_restart</code><br>參數（2 項） <code>Video</code>、<code>Shorts</code> | 保留 |  |
| 507 | <code>test_edit_status_unknown_until_reconciliation_and_keeps_skips_unknown</code> | 保留 |  |
| 526 | <code>test_edit_status_uses_all_history_and_requires_per_video_evidence</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_youtube_input.py</code> · 9 項</summary>

播放清單輸入正規化有格式與主機限制，能在進入 provider 前清楚回報。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_youtube_input.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 20 | <code>test_normalize_playlist_id_accepts_only_supported_ids_and_hosts</code><br>參數（9 項） <code> PL_123-abc -PL_123-abc</code>、<code>https://www.youtube.com/playlist?list=PL_123-abc-PL_123-abc</code>、<code>youtube.com/playlist?foo=1&amp;list=PL_123-abc-PL_123-abc</code>、<code>https://youtu.be/?list=PL_123-abc-PL_123-abc</code>、<code>-</code>、<code>None-</code>、<code>https://example.com/playlist?list=PL_123-abc-</code>、<code>javascript:alert(1)-</code>、<code>https://www.youtube.com/playlist?list=not valid-</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_youtube_operation_state.py</code> · 6 項</summary>

SQLite 遷移、唯一操作、進度與舊資料保護需要透過真正的儲存檔驗證。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_youtube_operation_state.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 25 | <code>test_v1_upgrade_preserves_journal_and_protects_legacy_unknown_targets</code> | 保留 |  |
| 58 | <code>test_different_previews_cannot_race_to_same_video_and_scopes_are_independent</code> | 保留 |  |
| 78 | <code>test_progress_counts_revisions_and_atomic_reservation_release</code> | 保留 |  |
| 97 | <code>test_request_alias_and_exact_lookup_beyond_recent_100</code> | 保留 |  |
| 110 | <code>test_backup_restores_v2_progress_and_unknown_schema_is_rejected</code> | 保留 |  |
| 126 | <code>test_content_fingerprint_only_normalizes_line_endings_and_counts_reject_unknown</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_youtube_playlist_discovery.py</code> · 3 項</summary>

用 Google discovery 建立本機請求，抓 API 參數名稱與資源形狀錯誤。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_youtube_playlist_discovery.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 18 | <code>test_playlist_preview_accepts_real_discovery_parameters_and_localizes_videos</code><br>參數（2 項） <code>empty</code>、<code>paginated</code> | 保留 |  |
| 78 | <code>test_cleanup_accepts_real_discovery_parameters_for_targeted_membership_checks</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_youtube_processing_state.py</code> · 10 項</summary>

已核對的每影片與每成員證據須可回查，晚到事件不能覆蓋更新紀錄。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_youtube_processing_state.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 18 | <code>test_actual_parts_determine_person_evidence_and_unchanged_never_invents_history</code><br>參數（4 項） <code>snippet</code>、<code>status</code>、<code>snippet,status</code>、<code>unchanged</code> | 保留 |  |
| 47 | <code>test_pending_blocks_new_writes_but_never_erases_confirmed_history</code> | 保留 |  |
| 63 | <code>test_older_reconciliation_cannot_replace_a_newer_person_application</code> | 保留 |  |
| 79 | <code>test_projection_and_journal_roll_back_together_on_invalid_evidence</code> | 保留 |  |
| 96 | <code>test_cleanup_projection_is_per_item_and_new_membership_is_independent</code> | 保留 |  |
| 116 | <code>test_old_metadata_without_actual_parts_stays_unknown_and_rebuild_is_conservative</code> | 保留 |  |
| 152 | <code>test_line_endings_alone_do_not_create_an_unnecessary_write</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_youtube_publish_cleanup.py</code> · 30 項</summary>

清理前核實公開狀態、重複成員、重試及配額下的實際刪除結果需要獨立案例。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_youtube_publish_cleanup.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 149 | <code>test_cleanup_confirms_removal_and_charges_all_requests</code> | 保留 |  |
| 159 | <code>test_cleanup_skips_an_already_removed_item_without_spending_delete_quota</code> | 保留 |  |
| 167 | <code>test_cleanup_reconciles_a_lost_delete_response_without_repeating_the_write</code> | 保留 |  |
| 184 | <code>test_cleanup_retries_transient_failures_only_after_confirming_the_item_remains</code><br>參數（4 項） <code>error0</code>、<code>error1</code>、<code>error2</code>、<code>error3</code> | 保留 |  |
| 200 | <code>test_cleanup_retries_confirmation_reads_without_repeating_a_successful_delete</code> | 保留 |  |
| 209 | <code>test_cleanup_polls_stale_reads_without_repeating_an_acknowledged_delete</code> | 保留 |  |
| 217 | <code>test_cleanup_has_bounded_retries_when_deletion_does_not_commit</code> | 保留 |  |
| 229 | <code>test_cleanup_does_not_retry_permission_invalid_request_or_quota_errors</code><br>參數（4 項） <code>400-invalidParameter</code>、<code>401-authError</code>、<code>403-forbidden</code>、<code>403-quotaExceeded</code> | 保留 |  |
| 238 | <code>test_cleanup_tolerates_a_concurrent_removal</code> | 保留 |  |
| 246 | <code>test_cleanup_never_reports_a_missing_item_id_as_success</code><br>參數（2 項） <code>None</code>、<code>（空字串）</code> | 保留 |  |
| 252 | <code>test_cleanup_rejects_incomplete_confirmation_responses</code> | 保留 |  |
| 260 | <code>test_signed_preview_cleans_all_nonconsecutive_duplicate_entries</code> | 保留 |  |
| 278 | <code>test_cleanup_unknown_preserves_item_and_reconcile_does_not_require_public</code> | 保留 |  |
| 297 | <code>test_a_failed_duplicate_does_not_prevent_cleaning_other_entries</code> | 保留 |  |
| 311 | <code>test_private_video_is_retained_without_any_video_update</code> | 保留 |  |
| 320 | <code>test_quota_fallback_after_delete_only_checks_membership_on_the_second_slot</code> | 保留 |  |
| 347 | <code>test_changing_only_a_duplicate_item_invalidates_the_signed_preview</code> | 保留 |  |
| 368 | <code>test_missing_playlist_item_id_stops_before_publishing</code> | 保留 |  |
| 377 | <code>test_old_playlist_preview_token_is_rejected_without_writes</code> | 保留 |  |
| 394 | <code>test_public_to_private_between_preview_and_delete_is_retained</code> | 保留 |  |
| 413 | <code>test_every_internal_delete_retry_runs_fresh_public_guard</code> | 保留 |  |
| 432 | <code>test_duplicate_items_recheck_privacy_after_each_delete</code> | 保留 |  |
| 456 | <code>test_timeout_then_private_retry_stays_unknown_and_never_deletes_again</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_youtube_publish_jobs.py</code> · 7 項</summary>

排隊、202、互斥與中斷恢復的風險只能以真的 worker 和暫存資料庫查驗。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_youtube_publish_jobs.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 69 | <code>test_202_and_first_success_are_visible_while_second_provider_call_is_blocked</code> | 保留 |  |
| 96 | <code>test_timeout_keeps_all_rows_and_unchanged_is_not_a_write</code> | 保留 |  |
| 112 | <code>test_changed_input_and_full_queue_do_not_create_unexecutable_jobs</code> | 保留 |  |
| 132 | <code>test_new_previews_and_sync_api_share_atomic_video_target_protection</code> | 保留 |  |
| 146 | <code>test_exclusive_runner_and_restart_recover_only_state_without_replay</code> | 改寫完成 | 驗證同程序與獨立程序都無法取得正在使用的鎖。留下掛起作業的精確狀態與無 provider 重送斷言。 |
| 181 | <code>test_two_apps_use_their_own_provider_and_credentials</code> | 保留 |  |
| 200 | <code>test_queued_preview_expiry_and_shutdown_never_start_a_provider_write</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_youtube_quota.py</code> · 16 項</summary>

預留、失敗計費、太平洋時區重置與損毀帳本會影響可執行的配額。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_youtube_quota.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 41 | <code>test_method_registry_uses_documented_general_bucket_costs</code> | 保留 |  |
| 50 | <code>test_unknown_method_fails_closed_before_request</code> | 保留 |  |
| 61 | <code>test_request_is_reserved_before_failure_and_outcome_is_persisted</code> | 保留 |  |
| 82 | <code>test_two_instances_share_a_path_lock_and_cannot_cross_policy_cap</code> | 保留 |  |
| 101 | <code>test_safety_buffer_is_reserved_at_the_exact_policy_cap</code> | 保留 |  |
| 116 | <code>test_only_403_quota_exhaustion_reasons_are_confirmed_quota</code> | 保留 |  |
| 129 | <code>test_google_quota_exhaustion_reason_blocks_the_current_slot</code><br>參數（3 項） <code>quotaExceeded</code>、<code>dailyLimitExceeded</code>、<code>dailyLimitExceededUnreg</code> | 保留 |  |
| 141 | <code>test_confirmed_exhaustion_sets_effective_available_to_zero</code> | 保留 |  |
| 156 | <code>test_reset_uses_pacific_midnight_and_dst_offsets</code> | 保留 |  |
| 163 | <code>test_new_quota_date_replaces_the_previous_day_with_a_normal_ledger</code> | 保留 |  |
| 175 | <code>test_non_current_json_schema_fails_closed</code> | 保留 |  |
| 198 | <code>test_corrupt_json_fails_closed_before_request</code> | 保留 |  |
| 211 | <code>test_atomic_write_failure_fails_closed_before_request</code> | 保留 |  |
| 226 | <code>test_cost_estimates_match_direct_metadata_and_publish_formulas</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_youtube_routing.py</code> · 6 項</summary>

主要／次要槽及預覽綁定會改變配額與實際採用的頻道。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_youtube_routing.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 35 | <code>test_auto_routing_prefers_primary_when_the_whole_request_fits</code> | 保留 |  |
| 48 | <code>test_auto_routing_falls_back_then_returns_to_primary</code> | 保留 |  |
| 65 | <code>test_preview_slot_hint_is_pinned_even_if_primary_recovers</code> | 保留 |  |
| 78 | <code>test_preview_slot_hint_falls_back_when_that_slot_loses_quota</code> | 保留 |  |
| 91 | <code>test_workflow_estimates_are_conservative</code> | 保留 |  |
| 128 | <code>test_publish_job_slot_hint_requires_a_complete_preview</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_youtube_service.py</code> · 2 項</summary>

單次更新後讀回核對區分已提交但無回應與真正寫入失敗。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_youtube_service.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 49 | <code>test_set_video_public_reconciles_a_successful_write_with_a_lost_response</code> | 保留 |  |
| 72 | <code>test_set_video_public_preserves_a_real_write_failure</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_youtube_slots.py</code> · 8 項</summary>

槽位憑證、帳本、callback 與公開路由不能跨頻道誤用。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_youtube_slots.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 15 | <code>test_youtube_settings_require_secondary_pair_and_validate_default_slot</code> | 保留 |  |
| 46 | <code>test_primary_requires_explicit_credentials_even_when_login_is_configured</code> | 保留 |  |
| 58 | <code>test_youtube_slot_credentials_and_ledgers_are_isolated</code> | 保留 |  |
| 86 | <code>test_quota_ledger_rejects_a_file_from_another_slot</code> | 保留 |  |
| 97 | <code>test_callback_rejects_a_signed_cookie_with_an_invalid_slot</code> | 保留 |  |
| 116 | <code>test_callback_rejects_mismatched_channel_with_specific_error</code> | 保留 |  |
| 155 | <code>test_callback_rejects_disallowed_email_with_specific_error</code> | 保留 |  |
| 186 | <code>test_slot_api_routes_are_exposed_without_single_slot_aliases</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_youtube_workflow_ports.py</code> · 1 項</summary>

背景工作必須帶著原 app 的帳號設定，請求 context 結束後仍要保持隔離。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_youtube_workflow_ports.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 13 | <code>test_account_ports_remain_app_bound_in_background_workers</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_ytmusic_client_scope.py</code> · 3 項</summary>

音樂庫讀取、驗證與 fallback 必須使用正確的 app 工廠。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_ytmusic_client_scope.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 17 | <code>test_playlist_endpoint_uses_app_factory_in_threadpool</code> | 保留 |  |
| 44 | <code>test_token_validation_and_authenticated_client_share_factory_without_cache</code> | 保留 |  |
| 62 | <code>test_factory_failure_restores_default_and_preserves_unauthenticated_fallback</code> | 保留 |  |

</details>

<details><summary><code>backend/tests/test_ytmusic_service.py</code> · 28 項</summary>

既有 token 匯入格式、metadata fallback、語系和部分寫入皆是音樂庫契約。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/backend/tests/test_ytmusic_service.py)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 17 | <code>test_parse_custom_token_input_json</code> | 保留 |  |
| 25 | <code>test_parse_custom_token_input_cookie</code> | 保留 |  |
| 33 | <code>test_parse_custom_token_input_empty</code> | 保留 |  |
| 39 | <code>test_fetch_ytmusic_playlists</code> | 保留 |  |
| 64 | <code>test_fetch_ytmusic_playlist_tracks_with_album_resolution</code> | 保留 |  |
| 135 | <code>test_apply_ytmusic_sort_in_place</code> | 保留 |  |
| 167 | <code>test_partial_ytmusic_sort_does_not_return_provider_exception</code> | 保留 |  |
| 191 | <code>test_apply_ytmusic_sort_in_place_rejects_synthetic_id</code> | 保留 |  |
| 213 | <code>test_create_sorted_ytmusic_playlist</code> | 保留 |  |
| 241 | <code>test_create_sorted_ytmusic_playlist_reports_missing_video_id</code> | 保留 |  |
| 261 | <code>test_parse_custom_token_input_curl</code> | 保留 |  |
| 276 | <code>test_parse_custom_token_input_cmd_curl</code> | 保留 |  |
| 291 | <code>test_parse_custom_token_input_fetch</code> | 保留 |  |
| 312 | <code>test_parse_custom_token_input_fetch_missing_cookie_explains_chrome_behavior</code> | 保留 |  |
| 326 | <code>test_parse_custom_token_input_raw_headers</code> | 保留 |  |
| 343 | <code>test_enrich_tracks_with_ytdlp_fallback</code> | 保留 |  |
| 370 | <code>test_parse_custom_token_input_is_pure_and_browser_compatible</code> | 保留 |  |
| 386 | <code>test_apply_ytmusic_sort_in_place_rejects_unauthenticated</code> | 保留 |  |
| 405 | <code>test_resolve_ytmusic_locale_defaults</code> | 保留 |  |
| 413 | <code>test_resolve_ytmusic_locale_explicit_args</code> | 保留 |  |
| 421 | <code>test_resolve_ytmusic_locale_from_account_store</code> | 保留 |  |
| 439 | <code>test_resolve_ytmusic_locale_custom_valid</code> | 保留 |  |
| 457 | <code>test_resolve_ytmusic_locale_unsupported_fallback</code> | 保留 |  |
| 466 | <code>test_parse_custom_token_input_accept_language_header</code> | 保留 |  |
| 477 | <code>test_validate_ytmusic_custom_token_success_with_account_info</code> | 保留 |  |
| 505 | <code>test_validate_ytmusic_custom_token_fallback_playlists</code> | 保留 |  |
| 529 | <code>test_validate_ytmusic_custom_token_empty_error</code> | 保留 |  |
| 538 | <code>test_validate_ytmusic_custom_token_api_failure</code> | 保留 |  |

</details>


## Vitest

<details><summary><code>frontend/src/App.test.jsx</code> · 11 項</summary>

應用層登入恢復、更新提示與錯誤邊界會決定使用者能否回到原工作。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/App.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 96 | <code>App recovery state &gt; shows reconnecting on an initial network failure instead of a blank or login page</code> | 保留 |  |
| 107 | <code>App recovery state &gt; keeps the authenticated screen when a resume request fails</code> | 保留 |  |
| 121 | <code>App recovery state &gt; switches to the login page only when the API explicitly reports unauthenticated</code> | 保留 |  |
| 133 | <code>App recovery state &gt; rechecks authentication for a persisted pageshow event</code> | 保留 |  |
| 144 | <code>App recovery state &gt; preserves a sidebar change made before a stale settings refresh finishes</code> | 保留 |  |
| 170 | <code>App recovery state &gt; shows a non-destructive update prompt when the backend build changes</code> | 保留 |  |
| 182 | <code>App recovery state &gt; rechecks after being hidden longer than the threshold</code> | 保留 |  |
| 208 | <code>App recovery state &gt; shares one recovery request across simultaneous resume events</code> | 保留 |  |
| 229 | <code>App recovery state &gt; uses online to recover from the initial reconnecting state</code> | 保留 |  |
| 241 | <code>App recovery state &gt; identifies a backend/frontend build mismatch without automatically reloading</code> | 保留 |  |
| 251 | <code>ErrorBoundary &gt; shows a safe recovery message without exposing the original JavaScript error</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/AppWorkState.test.jsx</code> · 3 項</summary>

跨帳號和晚到的同步請求是工作偏好被覆寫或串用的風險。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/AppWorkState.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 85 | <code>App account work-state hydration &gt; preserves saved shortcuts after an initial read fails and succeeds on retry</code> | 保留 |  |
| 112 | <code>App account work-state hydration &gt; allows preference edits during a later read and keeps them when a stale response arrives</code> | 保留 |  |
| 136 | <code>App account work-state hydration &gt; requires the new account read before allowing preference writes after an account switch</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/components/ConfirmDialog.test.jsx</code> · 3 項</summary>

確認文案、語意說明、焦點、背景鎖及重複送出是共用互動契約。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/components/ConfirmDialog.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 7 | <code>ConfirmDialog accessibility behavior &gt; uses the caller-provided confirmation text</code> | 保留 |  |
| 13 | <code>ConfirmDialog accessibility behavior &gt; traps focus, locks the background, restores focus, and prevents duplicate confirmation</code> | 保留 |  |
| 60 | <code>ConfirmDialog accessibility behavior &gt; renders structured content with a semantic list and keeps it as the dialog description</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/components/Navbar.test.jsx</code> · 16 項</summary>

manifest 導覽、工作流順序、側欄持久化及焦點回復皆直接影響操作。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/components/Navbar.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 29 | <code>Navbar</code><br><code>highlights the shared staging entry at /youtube/drafts/videos/staged</code><br><code>highlights the shared staging entry at /youtube/drafts/shorts/staged</code> | 保留 |  |
| 38 | <code>Navbar &gt; renders an additional manifest without changing Navbar and expands its active route</code> | 保留 |  |
| 63 | <code>Navbar &gt; keeps settings sub-navigation out of the sidebar</code> | 保留 |  |
| 69 | <code>Navbar &gt; keeps labels available until the user toggles the sidebar</code> | 保留 |  |
| 82 | <code>Navbar &gt; preserves newly pinned dashboard tools when the sidebar preferences are saved</code> | 保留 |  |
| 111 | <code>Navbar &gt; lists YouTube workflow pages in process order</code> | 保留 | 順序由實際導覽呈現，manifest 正確仍可能出現 UI 排序錯誤。 |
| 124 | <code>Navbar &gt; lists Sheet workflow pages and settings</code> | 保留 |  |
| 137 | <code>Navbar &gt; exposes system and deployment information next to API health with active state</code> | 保留 |  |
| 147 | <code>Navbar &gt; lists System management pages in process order</code> | 保留 |  |
| 160 | <code>Navbar &gt; exposes Instagram curation tool in navigation with active state</code> | 保留 |  |
| 171 | <code>Navbar &gt; exposes YouTube Music Playlist Sorter tool in navigation with active state</code> | 保留 |  |
| 182 | <code>Navbar &gt; exposes FFmpeg generator in navigation with active state</code> | 保留 |  |
| 243 | <code>Navbar drawer keyboard focus &gt; recovers ignored native focus calls at both ends of the drawer</code> | 保留 |  |
| 261 | <code>Navbar drawer keyboard focus &gt; does not override focus moved by the user before the retry</code> | 保留 |  |
| 272 | <code>Navbar drawer keyboard focus &gt; cancels the pending retry when the drawer closes</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/components/QuickTokenDrawer.test.jsx</code> · 7 項</summary>

音樂庫的權杖驗證、更新與清除必須有可操作的結果。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/components/QuickTokenDrawer.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 29 | <code>QuickTokenDrawer &gt; renders nothing when isOpen is false</code> | 保留 |  |
| 38 | <code>QuickTokenDrawer &gt; renders drawer header, guide toggle, and inputs when open</code> | 保留 |  |
| 46 | <code>QuickTokenDrawer &gt; toggles quick guide on click</code> | 保留 |  |
| 58 | <code>QuickTokenDrawer &gt; displays active token metadata when hasCustomToken is true</code> | 保留 |  |
| 73 | <code>QuickTokenDrawer &gt; validates token and displays result banner on success</code> | 保留 |  |
| 95 | <code>QuickTokenDrawer &gt; saves token and calls onTokenSaved callback</code> | 保留 |  |
| 112 | <code>QuickTokenDrawer &gt; clears token when clear button is clicked</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/components/ResultStatus.test.jsx</code> · 1 項</summary>

共用工作流標示需要讓使用者分辨完成、略過、失敗及未知結果。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/components/ResultStatus.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 7 | <code>ResultStatus &gt; uses the five workflow result labels consistently</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/components/ServiceAuthCard.test.jsx</code> · 2 項</summary>

已連線和未連線各自需要正確的操作及提醒。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/components/ServiceAuthCard.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 8 | <code>ServiceAuthCard &gt; renders connected state with reconnect and disconnect actions</code> | 保留 |  |
| 42 | <code>ServiceAuthCard &gt; renders disconnected state with warning banner and connect button</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/components/SourceLinkInput.test.jsx</code> · 3 項</summary>

能顯示、開啟正確資料來源且處理空值，是跨工具的輸入契約。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/components/SourceLinkInput.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 6 | <code>SourceLinkInput &gt; converts provider IDs into editable source URLs</code> | 保留 |  |
| 16 | <code>SourceLinkInput &gt; keeps a directly entered webpage and disables the icon when empty</code> | 保留 |  |
| 27 | <code>SourceLinkInput &gt; opens scheme-less domains and rejects malformed URL-like values</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/components/StickyNoteCard.test.jsx</code> · 10 項</summary>

貼文內容與模板可在同步不明的情況保持可讀、可複製及可核對。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/components/StickyNoteCard.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 43 | <code>StickyNoteCard &gt; keeps and copies new text after an ambiguous autosave and a server reread</code> | 保留 |  |
| 57 | <code>StickyNoteCard &gt; retains uncertain drafts across tool navigation and resumes only after a matching reread</code> | 保留 |  |
| 74 | <code>StickyNoteCard &gt; formats dates consistently</code> | 保留 |  |
| 81 | <code>StickyNoteCard &gt; renders content, remark and last edited date correctly</code> | 保留 |  |
| 91 | <code>StickyNoteCard &gt; copies content to clipboard on click and shows feedback</code> | 保留 |  |
| 105 | <code>StickyNoteCard &gt; toggles pinned state</code> | 保留 |  |
| 122 | <code>StickyNoteCard &gt; opens confirm dialog and handles deletion</code> | 保留 |  |
| 142 | <code>StickyNoteCard &gt; reconciles an ambiguous deletion without claiming success</code> | 保留 |  |
| 156 | <code>StickyNoteCard &gt; duplicates the current draft including unsaved template values</code> | 保留 |  |
| 173 | <code>StickyNoteCard &gt; previews repeated variables, copies results, and autosaves values</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/components/TeamPersonFilterPanel.test.jsx</code> · 4 項</summary>

多團體、搜尋、全選及撤銷會改變實際套用的人物。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/components/TeamPersonFilterPanel.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 30 | <code>TeamPersonFilterPanel &gt; keeps cross-team choices through searches, handles aliases and matches all terms</code> | 保留 |  |
| 42 | <code>TeamPersonFilterPanel &gt; only selects and deselects current results; team filters use OR and intersect search</code> | 保留 |  |
| 54 | <code>TeamPersonFilterPanel &gt; separates reset, clear and undo, and can remove hidden selected people</code> | 保留 |  |
| 68 | <code>TeamPersonFilterPanel &gt; expires undo after six seconds and disables interactions while loading</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/components/ThumbnailDialog.test.jsx</code> · 2 項</summary>

放大、關閉與重開應使用正確圖片和縮放狀態。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/components/ThumbnailDialog.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 9 | <code>ThumbnailDialog &gt; zooms the large preview with the mouse wheel</code> | 保留 |  |
| 19 | <code>ThumbnailDialog &gt; closes with Escape and resets zoom for a new image</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/components/Toast.test.jsx</code> · 1 項</summary>

驗證共用通知可以呈現訊息。由 provider 整合案例直接覆蓋時可合併。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/components/Toast.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 14 | <code>renders an immediate toast message</code> | 合併完成 | 由便利貼刪除 E2E 在實際共用通知區核對成功訊息與 status 語意。 |

</details>

<details><summary><code>frontend/src/components/VideoThumbnail.test.jsx</code> · 5 項</summary>

媒體載入失敗、來源 scheme 與是否可開預覽會改變互動和可見內容。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/components/VideoThumbnail.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 7 | <code>VideoThumbnail &gt; renders image with referrerPolicy=&quot;no-referrer&quot;</code> | 保留 |  |
| 14 | <code>VideoThumbnail &gt; upgrades http to https to prevent mixed content</code> | 保留 |  |
| 20 | <code>VideoThumbnail &gt; falls back to hqdefault and then mqdefault on image error if videoId is provided</code> | 保留 |  |
| 38 | <code>VideoThumbnail &gt; renders empty placeholder if neither src nor videoId is provided</code> | 保留 |  |
| 43 | <code>VideoThumbnail &gt; renders button wrapper when onPreview is provided</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/components/YouTubeQuotaBanner.test.jsx</code> · 7 項</summary>

配額時間與槽位資料必須可分辨，發生刷新錯誤時不得混呈舊槽。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/components/YouTubeQuotaBanner.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 32 | <code>YouTubeQuotaBanner &gt; separates project limit, safety buffer, effective units and method costs</code> | 保留 |  |
| 43 | <code>YouTubeQuotaBanner &gt; shows the quota ledger update time returned by the server</code> | 保留 |  |
| 51 | <code>YouTubeQuotaBanner &gt; shows confirmed exhaustion as blocked with zero effective availability</code> | 保留 |  |
| 63 | <code>YouTubeQuotaBanner &gt; loads the selected secondary slot ledger</code> | 保留 |  |
| 70 | <code>YouTubeQuotaBanner &gt; does not show the previous slot while the next slot is loading</code> | 保留 |  |
| 89 | <code>YouTubeQuotaBanner &gt; does not reuse the previous slot data after a refresh failure</code> | 保留 |  |
| 100 | <code>YouTubeQuotaBanner &gt; shows an error instead of accepting a malformed quota ledger</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/components/YouTubeVideoEditDialog.test.jsx</code> · 2 項</summary>

編輯器提交的值、必填欄位及初始內容直接影響發布。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/components/YouTubeVideoEditDialog.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 13 | <code>YouTubeVideoEditDialog &gt; shows the current metadata and submits edited values</code> | 保留 |  |
| 32 | <code>YouTubeVideoEditDialog &gt; does not submit a blank title</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/auth/api/authApi.test.ts</code> · 4 項</summary>

登入跳轉網址、初始化回應及管理者輸入正規化需要在 API 邊界驗證。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/auth/api/authApi.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 17 | <code>authApi response contracts &gt; accepts the declared login and setup read responses</code> | 保留 |  |
| 34 | <code>authApi response contracts &gt; rejects malformed and off-domain login responses</code> | 保留 |  |
| 41 | <code>authApi response contracts &gt; does not report setup success when its confirmation is missing</code> | 保留 |  |
| 53 | <code>authApi response contracts &gt; normalizes the administrator email before submitting and confirming setup</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/ffmpeg/model/ffmpegCommand.test.ts</code> · 9 項</summary>

實際引數的選項、seek 位置、續行與編碼模式會改變 CLI 效果。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/ffmpeg/model/ffmpegCommand.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 26 | <code>FFmpeg feature command model &gt; places accurate seek after input and uses duration cuts</code> | 保留 |  |
| 33 | <code>FFmpeg feature command model &gt; keeps the selected source end time when fast seeking moves the output timeline</code> | 保留 |  |
| 52 | <code>FFmpeg feature command model &gt; uses the original end timestamp for accurate seeking and for disabled start cuts</code> | 保留 |  |
| 66 | <code>FFmpeg feature command model</code><br><code>uses the bash continuation syntax without changing argument order</code><br><code>uses the powershell continuation syntax without changing argument order</code><br><code>uses the cmd continuation syntax without changing argument order</code> | 保留 |  |
| 72 | <code>FFmpeg feature command model &gt; combines scale and frame filters with reencoding and removes muted audio</code> | 保留 |  |
| 87 | <code>FFmpeg feature command model &gt; extracts audio without adding video encoding flags</code> | 保留 |  |
| 99 | <code>FFmpeg feature command model &gt; keeps GIF palette generation separate from audio options</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/ffmpeg/model/ffmpegSafety.test.ts</code> · 21 項</summary>

檔名須逐字傳給 shell。無效欄位和預設轉換則可用可攜的模型測試驗證。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/ffmpeg/model/ffmpegSafety.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 29 | <code>FFmpeg executable command contract</code><br><code>Bash receives literal filename 中文 影片.mp4 in both layouts</code><br><code>Bash receives literal filename clip_$((2+3)).mp4 in both layouts</code><br><code>Bash receives literal filename clip_$(printf expanded).mp4 in both layouts</code><br><code>Bash receives literal filename clip_`printf expanded`.mp4 in both layouts</code><br><code>Bash receives literal filename a&#x27;b.mp4 in both layouts</code><br><code>Bash receives literal filename a&quot;b.mp4 in both layouts</code><br><code>Bash receives literal filename folder\clip.mp4 in both layouts</code><br><code>Bash receives literal filename 50%.mp4 in both layouts</code><br><code>Bash receives literal filename clip!(x)&amp;y.mp4 in both layouts</code><br><code>Bash receives literal filename   spaced .mp4 in both layouts</code><br><code>Bash receives literal filename tail\ in both layouts</code> | 改寫完成 | 單行與多行各自成案，保留每個檔名並比對完整 argv。必要執行環境由 Bash 決定。 |
| 42 | <code>FFmpeg executable command contract</code><br><code>rejects invalid time </code><br><code>rejects invalid time -1</code><br><code>rejects invalid time NaN</code><br><code>rejects invalid time Infinity</code><br><code>rejects invalid time 1:60</code><br><code>rejects invalid time 00:99:00</code><br><code>rejects invalid time 00:00:10junk</code><br><code>rejects invalid time 1e3</code> | 保留 | 每個時間格式在 parser 與命令層都要被拒絕。 |
| 48 | <code>FFmpeg executable command contract &gt; blocks unsafe CMD names, identical paths, reverse times and known out of bounds ranges</code> | 改寫完成 | 逐規則辨識錯誤欄位與空指令，保留原四種情境並覆蓋 CMD 另外兩種拒絕字元。 |
| 60 | <code>FFmpeg executable command contract &gt; resets container and codec defaults after MP3/GIF, preserving custom filename stems</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/notes/api/notesApi.test.ts</code> · 7 項</summary>

讀寫 shape、筆記身分及未確認的寫入影響是否需要重新核對。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/notes/api/notesApi.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 18 | <code>notesApi &gt; forwards list, create, update, and delete requests through the shared client</code> | 保留 |  |
| 57 | <code>notesApi</code><br><code>rejects malformed or inconsistent lists: {&quot;notes&quot;:[{&quot;id&quot;:&quot;note-1&quot;,&quot;content&quot;:&quot;Draft&quot;,&quot;remark&quot;:&quot;Review&quot;,&quot;pinned&quot;:false,&quot;created_at&quot;:&quot;2026-09-24T00:00:00Z&quot;,&quot;updated_at&quot;:&quot;2026-09-24T00:00:00Z&quot;}],&quot;total&quot;:2}</code><br><code>rejects malformed or inconsistent lists: {&quot;notes&quot;:[{&quot;id&quot;:&quot;note-1&quot;,&quot;content&quot;:&quot;Draft&quot;,&quot;remark&quot;:&quot;Review&quot;,&quot;pinned&quot;:&quot;false&quot;,&quot;created_at&quot;:&quot;2026-09-24T00:00:00Z&quot;,&quot;updated_at&quot;:&quot;2026-09-24T00:00:00Z&quot;}],&quot;total&quot;:1}</code><br><code>rejects malformed or inconsistent lists: {&quot;notes&quot;:[{&quot;id&quot;:&quot;note-1&quot;,&quot;content&quot;:&quot;Draft&quot;,&quot;remark&quot;:&quot;Review&quot;,&quot;pinned&quot;:false,&quot;created_at&quot;:&quot;2026-09-24T00:00:00Z&quot;,&quot;updated_at&quot;:&quot;2026-09-24T00:00:00Z&quot;},{&quot;id&quot;:&quot;note-1&quot;,&quot;content&quot;:&quot;Draft&quot;,&quot;remark&quot;:&quot;Review&quot;,&quot;pinned&quot;:false,&quot;created_at&quot;:&quot;2026-09-24T00:00:00Z&quot;,&quot;updated_at&quot;:&quot;2026-09-24T00:00:00Z&quot;}],&quot;total&quot;:2}</code><br><code>rejects malformed or inconsistent lists: {&quot;total&quot;:0}</code> | 保留 |  |
| 62 | <code>notesApi &gt; checks mutation status, note identity, and delete confirmation</code> | 保留 |  |
| 78 | <code>notesApi &gt; marks uncertain transport and mutation-contract failures for reconciliation</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/notes/model/template.test.js</code> · 3 項</summary>

便利貼變數順序、重複值、Unicode 和遺漏值會影響複製結果。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/notes/model/template.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 5 | <code>note templates &gt; deduplicates variable names in order and supports Chinese names</code> | 保留 |  |
| 9 | <code>note templates &gt; replaces repeated variables literally without recursive substitution</code> | 保留 |  |
| 15 | <code>note templates &gt; preserves missing and empty variables, including inherited object names</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/photo-curator/model/project.test.js</code> · 3 項</summary>

專案版本、相片參考及檔案重新配對決定保存資料能否還原。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/photo-curator/model/project.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 17 | <code>portable photo arrangement &gt; round trips order and covers without embedding any local file or URL</code> | 保留 |  |
| 26 | <code>portable photo arrangement &gt; rejects future versions, duplicate placements and missing photo references</code> | 保留 |  |
| 35 | <code>portable photo arrangement &gt; matches unique metadata only, leaving duplicate or absent files unresolved</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/settings/api/systemSettingsApi.test.ts</code> · 4 項</summary>

帳號政策、憑證及不完整的寫入確認需在 transport 回傳邊界辨識。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/settings/api/systemSettingsApi.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 21 | <code>systemSettingsApi &gt; forwards credential reads and updates through the typed system API</code> | 保留 |  |
| 40 | <code>systemSettingsApi &gt; forwards allowlist and account policy operations without changing their response shapes</code> | 保留 |  |
| 66 | <code>systemSettingsApi &gt; rejects malformed confirmations instead of reporting a setting change as saved</code> | 保留 |  |
| 82 | <code>systemSettingsApi &gt; passes through timeout errors so callers can reconcile an unknown write result</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/settings/api/workStateApi.test.ts</code> · 11 項</summary>

多版本工作狀態及傳輸錯誤會影響偏好還原與單鍵保存。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/settings/api/workStateApi.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 12 | <code>workStateApi &gt; preserves feature-specific state and forwards updates without changing the wire contract</code> | 保留 |  |
| 22 | <code>workStateApi &gt; accepts unversioned legacy responses</code> | 保留 |  |
| 35 | <code>workStateApi</code><br><code>rejects malformed or unsupported responses: null</code><br><code>rejects malformed or unsupported responses: {}</code><br><code>rejects malformed or unsupported responses: {&quot;state&quot;:[]}</code><br><code>rejects malformed or unsupported responses: {&quot;state&quot;:null}</code><br><code>rejects malformed or unsupported responses: {&quot;state&quot;:{&quot;navigation&quot;:true}}</code><br><code>rejects malformed or unsupported responses: {&quot;state&quot;:{&quot;tool&quot;:[]}}</code><br><code>rejects malformed or unsupported responses: {&quot;version&quot;:2,&quot;state&quot;:{}}</code> | 保留 |  |
| 42 | <code>workStateApi &gt; preserves transport errors for the existing retry flow</code> | 保留 |  |
| 50 | <code>workStateApi &gt; rejects a write response that omits or changes the submitted value</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/sheets/api/sheetsCopyApi.test.ts</code> · 4 項</summary>

試算表欄位和列的格式必須先驗證，複製流程才能產出正確資料。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/sheets/api/sheetsCopyApi.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 15 | <code>sheetsCopyApi &gt; returns typed spreadsheet metadata from the shared HTTP client</code> | 保留 |  |
| 27 | <code>sheetsCopyApi &gt; rejects malformed spreadsheet metadata instead of hiding the contract error</code> | 保留 |  |
| 33 | <code>sheetsCopyApi &gt; returns validated copyable rows and columns</code> | 保留 |  |
| 46 | <code>sheetsCopyApi &gt; rejects malformed copyable rows before they reach page state</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/sheets/api/sheetsFilterApi.test.ts</code> · 3 項</summary>

共用人物篩選必須完整保存排序、跨團體身分與來源狀態。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/sheets/api/sheetsFilterApi.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 17 | <code>sheetsFilterApi &gt; passes valid ordered team and people options through</code> | 保留 |  |
| 35 | <code>sheetsFilterApi &gt; rejects malformed options instead of treating them as empty lists</code> | 保留 |  |
| 43 | <code>sheetsFilterApi &gt; validates account filter reads and writes</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/sheets/api/sheetsSettingsApi.test.ts</code> · 4 項</summary>

授權資源和帳號來源需透過正確端點保存並核對已保存的值。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/sheets/api/sheetsSettingsApi.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 19 | <code>sheetsSettingsApi &gt; forwards Sheets OAuth operations and preserves API response shapes</code> | 保留 |  |
| 32 | <code>sheetsSettingsApi &gt; forwards account scoped shared setting reads and updates</code> | 保留 |  |
| 45 | <code>sheetsSettingsApi &gt; trims source values before saving and accepts the normalized confirmation</code> | 保留 |  |
| 54 | <code>sheetsSettingsApi &gt; rejects malformed responses and mismatched write confirmations</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/sheets/model/clipboardSelection.test.js</code> · 1 項</summary>

TSV 需保留 Unicode、多行、空格位置與資料順序。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/sheets/model/clipboardSelection.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 4 | <code>selected Sheet clipboard output &gt; preserves Chinese, multiline text, empty cells and sheet order in TSV</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/youtube/api/publishCleanupApi.test.ts</code> · 10 項</summary>

清理 snapshot 的每筆成員、總數及狀態是確認前後對照的基礎。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/youtube/api/publishCleanupApi.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 46 | <code>cleanup v2 contracts &gt; accepts exact item snapshots and preserves unknown results</code> | 保留 |  |
| 56 | <code>cleanup v2 contracts</code><br><code>rejects invalid preview counts, privacy, version or identity</code><br><code>rejects invalid preview counts, privacy, version or identity</code><br><code>rejects invalid preview counts, privacy, version or identity</code><br><code>rejects invalid preview counts, privacy, version or identity</code><br><code>rejects invalid preview counts, privacy, version or identity</code> | 保留 |  |
| 64 | <code>cleanup v2 contracts</code><br><code>never accepts malformed or mismatched cleanup results</code><br><code>never accepts malformed or mismatched cleanup results</code><br><code>never accepts malformed or mismatched cleanup results</code><br><code>never accepts malformed or mismatched cleanup results</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/youtube/api/youtubeBatchApi.test.ts</code> · 5 項</summary>

草稿設定、預覽與執行的契約錯誤不能落入空清單或成功畫面。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/youtube/api/youtubeBatchApi.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 62 | <code>youtubeBatchApi &gt; validates draft settings and confirms saved values before reporting success</code> | 保留 |  |
| 87 | <code>youtubeBatchApi &gt; uses the validated playlist setting response</code> | 保留 |  |
| 99 | <code>youtubeBatchApi &gt; rejects a missing draft video list instead of treating it as empty</code> | 保留 |  |
| 108 | <code>youtubeBatchApi &gt; rejects incomplete or contradictory batch plans before they can be confirmed</code> | 保留 |  |
| 122 | <code>youtubeBatchApi &gt; rejects incomplete execution results instead of reporting success</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/youtube/api/youtubeQuotaApi.test.ts</code> · 6 項</summary>

配額帳本與槽位 schema 守住數據來源和回應一致性。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/youtube/api/youtubeQuotaApi.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 31 | <code>youtubeQuotaApi &gt; returns a valid quota ledger for the requested slot</code> | 保留 |  |
| 42 | <code>youtubeQuotaApi</code><br><code>rejects a malformed ledger before rendering it: {&quot;slot&quot;:&quot;secondary&quot;}</code><br><code>rejects a malformed ledger before rendering it: {}</code><br><code>rejects a malformed ledger before rendering it: {&quot;estimated_used_units&quot;:&quot;3820&quot;}</code><br><code>rejects a malformed ledger before rendering it: {&quot;state&quot;:&quot;unknown&quot;}</code><br><code>rejects a malformed ledger before rendering it: {&quot;methods&quot;:[{&quot;method&quot;:&quot;videos.update&quot;,&quot;calls&quot;:2,&quot;cost_per_call&quot;:50}]}</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/youtube/api/youtubeSettingsApi.test.ts</code> · 3 項</summary>

設定寫入及 OAuth 開啟前須確認回應與請求相符。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/youtube/api/youtubeSettingsApi.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 24 | <code>youtubeSettingsApi &gt; accepts matching write confirmations and rejects malformed or stale confirmations</code> | 保留 |  |
| 90 | <code>youtubeSettingsApi &gt; accepts only an HTTPS OAuth URL</code> | 保留 |  |
| 109 | <code>youtubeSettingsApi &gt; marks an uncertain write outcome for reconciliation</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/youtube/hooks/useBatchConfigPersistence.test.ts</code> · 1 項</summary>

切換帳號後的未送出保存若執行，會污染另一帳號的草稿。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/youtube/hooks/useBatchConfigPersistence.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 14 | <code>account-scoped batch persistence &gt; cancels queued draft and playlist saves on an account switch</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/youtube/hooks/useBatchExecution.test.ts</code> · 6 項</summary>

同一事件迴圈重送、晚到結果和已知未知寫入需要不同處理。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/youtube/hooks/useBatchExecution.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 75 | <code>batch execution boundaries &gt; sends only once when confirmation is invoked twice in the same turn</code> | 保留 |  |
| 98 | <code>batch execution boundaries &gt; retains a completed write after the source request generation changes</code> | 保留 |  |
| 120 | <code>batch execution boundaries &gt; clears the signed preview and gates immediate replay after a timeout</code> | 保留 |  |
| 138 | <code>batch execution boundaries &gt; does not display a previous account write result after switching accounts</code> | 保留 |  |
| 160 | <code>batch execution boundaries</code><br><code>does not notify from an unmounted workflow after success</code><br><code>does not notify from an unmounted workflow after failure</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/youtube/hooks/useDraftPublishOperation.test.tsx</code> · 5 項</summary>

輪詢、重試節奏、已存 request、revision 及管道隔離保護不重送。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/youtube/hooks/useDraftPublishOperation.test.tsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 62 | <code>publish operation polling &gt; polls one read at a time, shows revisions, and stops at terminal rows</code> | 保留 |  |
| 82 | <code>publish operation polling &gt; backs off 2/5/10 seconds and respects longer Retry-After without losing progress</code> | 保留 |  |
| 109 | <code>publish operation polling &gt; recovers by the saved request instead of scanning recent operations or resubmitting</code> | 保留 |  |
| 120 | <code>publish operation polling &gt; ignores old revisions and late responses after unmount</code> | 保留 |  |
| 148 | <code>publish operation polling &gt; rejects cross-channel identities and inconsistent counts</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/youtube/hooks/useVideoEditStatus.test.ts</code> · 3 項</summary>

分批資料與晚到結果會影響是否把影片列為已套用。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/youtube/hooks/useVideoEditStatus.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 9 | <code>durable video edit history reads &gt; resolves every batch before returning filterable results</code> | 保留 |  |
| 22 | <code>durable video edit history reads &gt; rejects mismatched channel data and ignores late replies across account changes</code> | 保留 |  |
| 45 | <code>durable video edit history reads &gt; keeps verified history during transient refresh failures and recovers incomplete responses</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/youtube/model/draftPublishStorage.test.ts</code> · 3 項</summary>

草稿鍵需綁定帳號／頻道／影片類別，並保留可讀的舊資料。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/youtube/model/draftPublishStorage.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 15 | <code>isolates source and assignment changes by account, channel, and video type</code> | 保留 |  |
| 25 | <code>preserves assignment context when revisiting the same source before videos are reloaded</code> | 保留 |  |
| 33 | <code>keeps legacy source validation while migrating revisited assignments into a channel scope</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/youtube/model/prepareDraftState.test.ts</code> · 14 項</summary>

每種待處理或不可用狀態各有允許操作和提示，影響下一步能否安全執行。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/youtube/model/prepareDraftState.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 19 | <code>prepare draft eligibility &gt; allows an independent preview or quota read without a prepare dependency</code> | 保留 |  |
| 39 | <code>prepare draft eligibility</code><br><code>explains blocked state { preparing: true } without bypassing required validation</code><br><code>explains blocked state { executing: true } without bypassing required validation</code><br><code>explains blocked state { loadingSheet: true } without bypassing required validation</code><br><code>explains blocked state { loadingVideos: true } without bypassing required validation</code><br><code>explains blocked state { hydrated: false } without bypassing required validation</code><br><code>explains blocked state { authenticated: false } without bypassing required validation</code><br><code>explains blocked state { channel: &#x27;&#x27; } without bypassing required validation</code><br><code>explains blocked state { sourceReady: false } without bypassing required validation</code><br><code>explains blocked state { sourceStale: true } without bypassing required validation</code><br><code>explains blocked state { worksheet: &#x27;&#x27; } without bypassing required validation</code><br><code>explains blocked state { titleColumn: &#x27;&#x27; } without bypassing required validation</code><br><code>explains blocked state { descriptionColumn: &#x27;&#x27; } without bypassing required validation</code><br><code>explains blocked state { assignedCount: +0 } without bypassing required validation</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/youtube/pages/DraftPublishPage.test.jsx</code> · 11 項</summary>

完整描述、人工編輯、發布確認及未確認寫入的 UI 狀態彼此不可替代。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/youtube/pages/DraftPublishPage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 176 | <code>editable publish staging</code><br><code>restores Video manual edits across remounts and writes only after final confirmation</code><br><code>restores Shorts manual edits across remounts and writes only after final confirmation</code> | 保留 |  |
| 219 | <code>editable publish staging &gt; validates title and full description, invalidates a reviewed plan, and supports reset and skip</code> | 保留 |  |
| 250 | <code>editable publish staging &gt; isolates account, channel and video type and blocks changed sources without discarding edits</code> | 保留 |  |
| 276 | <code>editable publish staging &gt; keeps unknown submissions locked after reload and recovers through read-only reconciliation</code> | 保留 |  |
| 297 | <code>editable publish staging &gt; locks every field during submission and retries only failed rows after partial success</code> | 保留 |  |
| 325 | <code>editable publish staging &gt; locks an explicit unknown result until reconciliation confirms the submitted version</code> | 保留 |  |
| 342 | <code>editable publish staging &gt; keeps newer manual edits unpublished when reconciliation confirms an earlier failed version</code> | 保留 |  |
| 367 | <code>editable publish staging &gt; does not submit when saving the pending request fails and can save the original draft again</code> | 保留 |  |
| 382 | <code>editable publish staging &gt; can reinclude default skipped rows without replacing manual content</code> | 保留 |  |
| 397 | <code>editable publish staging &gt; keeps complete multiline descriptions visible and protects unsaved modal changes</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/ytmusic/api/playlistSortApi.test.ts</code> · 3 項</summary>

排序前的曲目與套用結果須可靠，UI 無法從壞回應推測正確曲序。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/ytmusic/api/playlistSortApi.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 18 | <code>playlistSortApi &gt; accepts a playlist list and rejects malformed entries before page state changes</code> | 保留 |  |
| 29 | <code>playlistSortApi &gt; rejects an incomplete preview instead of allowing malformed tracks into drag sorting</code> | 保留 |  |
| 59 | <code>playlistSortApi &gt; rejects a malformed apply result instead of reporting a false success</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/ytmusic/api/ytmusicSettingsApi.test.ts</code> · 5 項</summary>

OAuth 與權杖的提交和確認格式及不確定結果是前後端契約。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/ytmusic/api/ytmusicSettingsApi.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 18 | <code>ytmusicSettingsApi &gt; delegates OAuth connection operations to the shared HTTP client</code> | 保留 |  |
| 28 | <code>ytmusicSettingsApi &gt; delegates custom token save, validation, and clear operations</code> | 保留 |  |
| 43 | <code>ytmusicSettingsApi &gt; rejects malformed OAuth and disconnect responses</code> | 保留 |  |
| 51 | <code>ytmusicSettingsApi &gt; does not accept malformed token mutation or validation responses as success</code> | 保留 |  |
| 65 | <code>ytmusicSettingsApi &gt; accepts nullable provider identity fields and distinguishes uncertain writes</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/features/ytmusic/model/playlistSort.test.ts</code> · 5 項</summary>

排序穩定性、缺值、專輯上下文及重新排序的純模型行為。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/features/ytmusic/model/playlistSort.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 6 | <code>playlist sort feature model &gt; handles missing tracks and returns copied positions without a sorting rule</code> | 保留 |  |
| 15 | <code>playlist sort feature model &gt; preserves stable multi-key sorting and leaves the provider tracks untouched</code> | 保留 |  |
| 35 | <code>playlist sort feature model &gt; uses album context dates while keeping unknown dates last in both directions</code> | 保留 |  |
| 50 | <code>playlist sort feature model &gt; treats object prototype names as ordinary album and artist metadata</code> | 保留 |  |
| 62 | <code>playlist sort feature model &gt; calculates manual reorder counts against provider positions, including prototype-like IDs</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/hooks/useAccountWorkState.test.jsx</code> · 8 項</summary>

延遲、競態、save 回應與 hydration 是資料一致性的關鍵。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/hooks/useAccountWorkState.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 29 | <code>useAccountWorkState &gt; debounces a save and merges the server state after it succeeds</code> | 保留 |  |
| 55 | <code>useAccountWorkState &gt; keeps command references stable when the stored state changes</code> | 保留 |  |
| 69 | <code>useAccountWorkState &gt; persists a newer value after an earlier request is already in flight</code> | 保留 |  |
| 105 | <code>useAccountWorkState &gt; exposes a failed save and retries the latest desired value</code> | 保留 |  |
| 126 | <code>useAccountWorkState &gt; does not acknowledge malformed saves and allows retrying the pending change</code> | 保留 |  |
| 147 | <code>useAccountWorkState &gt; does not acknowledge a write response that omits the saved key</code> | 保留 |  |
| 159 | <code>useAccountWorkState &gt; keeps newer values for other keys when full-state write responses arrive out of order</code> | 保留 |  |
| 199 | <code>useAccountWorkState &gt; hydrates refreshed server values while preserving keys edited in this session</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/hooks/useDebouncedAutosave.test.jsx</code> · 6 項</summary>

自動保存計時、離頁 flush、失敗可重試及 callback 生命週期需要可控時間。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/hooks/useDebouncedAutosave.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 15 | <code>useDebouncedAutosave &gt; debounces saves until timer elapses</code> | 保留 |  |
| 51 | <code>useDebouncedAutosave &gt; flushes pending changes immediately when flush is called</code> | 保留 |  |
| 75 | <code>useDebouncedAutosave &gt; reports a failed flush without treating the draft as saved</code> | 保留 |  |
| 92 | <code>useDebouncedAutosave &gt; keeps a confirmed write saved when its follow-up callback fails</code> | 保留 |  |
| 111 | <code>useDebouncedAutosave &gt; flushes on unmount if dirty and not already saved</code> | 保留 |  |
| 138 | <code>useDebouncedAutosave &gt; maintains stable callback identity even when recreated callbacks are passed</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/hooks/useFfmpegVideo.test.jsx</code> · 4 項</summary>

瀏覽器影片讀入、片段停止與 object URL 釋放屬於媒體生命週期。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/hooks/useFfmpegVideo.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 35 | <code>useFfmpegVideo &gt; recognizes browser video MIME types and supported filename extensions</code> | 保留 |  |
| 42 | <code>useFfmpegVideo &gt; rejects non-video files without creating an object URL</code> | 保留 |  |
| 52 | <code>useFfmpegVideo &gt; selects a video, updates page metadata, and releases its object URL on unmount</code> | 保留 |  |
| 67 | <code>useFfmpegVideo &gt; reports media metadata and stops trimmed playback at the selected endpoint</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/hooks/useOAuthConnect.test.jsx</code> · 2 項</summary>

授權跳轉、解除授權確認及 callback 是共用操作。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/hooks/useOAuthConnect.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 23 | <code>useOAuthConnect &gt; handles connect success by redirecting to auth url</code> | 保留 |  |
| 46 | <code>useOAuthConnect &gt; handles disconnect with confirmation and callbacks</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/hooks/usePageResume.test.jsx</code> · 6 項</summary>

瀏覽器返回和頁面恢復需處理短長時間、去重及 bfcache。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/hooks/usePageResume.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 15 | <code>usePageResume &gt; forces a one-frame root repaint without changing the existing opacity</code> | 保留 |  |
| 28 | <code>usePageResume &gt; repaints on a short window focus without starting a data refresh</code> | 保留 |  |
| 47 | <code>usePageResume &gt; shares one in-flight resume request and exposes its busy state</code> | 保留 |  |
| 76 | <code>usePageResume &gt; honors the cooldown but lets an explicit retry bypass it</code> | 保留 |  |
| 97 | <code>usePageResume &gt; recovers when Safari returns focus after a long background period</code> | 保留 |  |
| 114 | <code>usePageResume &gt; treats a persisted pageshow as a resume even without a prior visibility event</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/hooks/useSharedTeamPersonFilterPersistence.test.jsx</code> · 2 項</summary>

共用篩選的初次同步與保存錯誤影響是否覆寫帳號狀態。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/hooks/useSharedTeamPersonFilterPersistence.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 21 | <code>useSharedTeamPersonFilterPersistence &gt; waits for readiness and saves one normalized shared filter</code> | 保留 |  |
| 48 | <code>useSharedTeamPersonFilterPersistence &gt; reports a failed sync and retries without changing the desired filter</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/hooks/useTeamPersonFilter.test.js</code> · 5 項</summary>

來源切換、舊篩選移轉與跨團選項更新均可能造成錯選。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/hooks/useTeamPersonFilter.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 12 | <code>useTeamPersonFilter &gt; reports malformed provider options instead of silently showing no teams</code> | 保留 |  |
| 19 | <code>useTeamPersonFilter &gt; loads everyone without choosing a team and retains selections across team/search filters</code> | 保留 |  |
| 40 | <code>useTeamPersonFilter &gt; ignores an older response after changing worksheet</code> | 保留 |  |
| 61 | <code>useTeamPersonFilter &gt; migrates a legacy selection and keeps it while temporarily disabled or after failed refresh</code> | 保留 |  |
| 87 | <code>honors an explicitly empty team filter while retaining the legacy migration team</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/indexHtmlFallback.test.js</code> · 1 項</summary>

JS 掛載失敗時，HTML 必須本身就提供可見的恢復資訊。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/indexHtmlFallback.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 7 | <code>static HTML loading fallback &gt; keeps visible recovery content inside #root without inline JavaScript</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/layouts/YouTubeSettingsLayout.test.jsx</code> · 1 項</summary>

只保留一個可導覽的頁面主要標題，驗證子路由渲染結構。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/layouts/YouTubeSettingsLayout.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 30 | <code>YouTubeSettingsLayout &gt; keeps the shared page title as the only YouTube settings h1</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/ApiHealthPage.test.jsx</code> · 1 項</summary>

只在可見時輪詢，重新出現時刷新，避免不必要背景呼叫。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/ApiHealthPage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 33 | <code>ApiHealthPage visibility polling &gt; stops background polling and refreshes once when visible again</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/BatchUpdatePage.test.jsx</code> · 15 項</summary>

來源變動、人物選擇、預覽／暫存失敗及競態會影響後續發布。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/BatchUpdatePage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 13 | <code>BatchPreviewItem &gt; uses the kebab-case class for items that will be updated</code> | 改寫完成 | 斷言將更新、目前與更新後內容，以及實際的更新後標題。 |
| 263 | <code>BatchUpdatePage preview and confirmation &gt; keeps the preview builder explicit about unchanged and skipped items</code> | 保留 |  |
| 281 | <code>BatchUpdatePage preview and confirmation &gt; applies people to persistent staging without writing to YouTube</code> | 保留 |  |
| 334 | <code>BatchUpdatePage preview and confirmation &gt; keeps assignments available when staging fails</code> | 保留 |  |
| 346 | <code>BatchUpdatePage preview and confirmation &gt; allows editing the playlist ID and auto-saves draft settings</code> | 保留 |  |
| 368 | <code>BatchUpdatePage preview and confirmation</code><br><code>keeps Video rebuild confirmation open and permits cancel then retry</code><br><code>keeps Shorts rebuild confirmation open and permits cancel then retry</code> | 保留 |  |
| 399 | <code>BatchUpdatePage preview and confirmation</code><br><code>recovers Video prepare from failure and prevents duplicate requests</code><br><code>recovers Shorts prepare from failure and prevents duplicate requests</code> | 保留 |  |
| 429 | <code>BatchUpdatePage preview and confirmation &gt; aborts old channel preparation and ignores a late response after switching accounts</code> | 保留 |  |
| 464 | <code>BatchUpdatePage preview and confirmation &gt; cancels a pending prepare and releases the button without replacing saved drafts</code> | 保留 |  |
| 484 | <code>BatchUpdatePage preview and confirmation &gt; filters all loaded videos while preserving hidden selections and assignments, and refreshes evidence</code> | 保留 |  |
| 515 | <code>BatchUpdatePage preview and confirmation &gt; blocks confirmation and execution callbacks while source refresh is pending</code> | 保留 |  |
| 547 | <code>BatchUpdatePage preview and confirmation &gt; blocks refresh and reload callbacks in the same turn that a write starts</code> | 保留 |  |
| 575 | <code>migrates remembered assignments and bulk selection before saving the new shared filter</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/ComponentShowcasePage.test.jsx</code> · 1 項</summary>

共用元件是否存在可快速驗證，版面與焦點另有瀏覽器截圖。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/ComponentShowcasePage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 7 | <code>ComponentShowcasePage &gt; presents shared controls and visual states used by feature pages</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/DashboardPage.test.jsx</code> · 8 項</summary>

工具探索、可前往授權、捷徑持久化及錯誤可恢復的前端行為。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/DashboardPage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 26 | <code>DashboardPage &gt; shows missing capabilities with reachable connection pages while leaving tool links available</code> | 保留 |  |
| 70 | <code>DashboardPage &gt; renders dashboard with user status and tool feature cards</code> | 保留 |  |
| 124 | <code>DashboardPage &gt; searches titles and descriptions and lets an empty result return to all tools</code> | 保留 |  |
| 144 | <code>DashboardPage &gt; pins and removes a shortcut while preserving the other navigation preferences</code> | 保留 |  |
| 173 | <code>DashboardPage &gt; keeps recent dashboard entries unique and puts the latest opened tool first</code> | 保留 |  |
| 197 | <code>DashboardPage &gt; hides saved shortcuts when their tool is unavailable in the server catalog</code> | 保留 |  |
| 227 | <code>DashboardPage &gt; offers a retry when the catalog fails instead of showing a permanent loading state</code> | 保留 |  |
| 238 | <code>DashboardPage &gt; starts mobile authorization details collapsed and reveals them with the summary control</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/FfmpegGeneratorPage.test.jsx</code> · 8 項</summary>

操作表單、媒體預覽、命令顯示與複製把模型串進實際頁面。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/FfmpegGeneratorPage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 29 | <code>FfmpegGeneratorPage &gt; renders workbench title, dropzone, and default command output</code> | 保留 |  |
| 41 | <code>FfmpegGeneratorPage &gt; updates command when changing start and end cut times</code> | 保留 |  |
| 57 | <code>FfmpegGeneratorPage &gt; applies preset and updates encoding flags in command</code> | 保留 |  |
| 70 | <code>FfmpegGeneratorPage &gt; switches shell formatting to PowerShell</code> | 保留 |  |
| 82 | <code>FfmpegGeneratorPage &gt; calls copyToClipboard when clicking copy command button</code> | 保留 |  |
| 96 | <code>FfmpegGeneratorPage &gt; loads video file and displays preview player with timeline cut indicators</code> | 保留 |  |
| 118 | <code>FfmpegGeneratorPage &gt; accepts video files by extension even when mime type is empty</code> | 保留 |  |
| 133 | <code>FfmpegGeneratorPage &gt; toggles trimmed preview playback state when clicking preview segment button</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/GoogleAccountSettingsPage.test.jsx</code> · 3 項</summary>

分離式授權在同頁顯示連線與解除確認。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/GoogleAccountSettingsPage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 47 | <code>GoogleAccountSettingsPage &gt; renders decoupled authorization and modular settings sections</code> | 保留 |  |
| 87 | <code>GoogleAccountSettingsPage &gt; allows connecting Sheets when not connected</code> | 保留 |  |
| 111 | <code>GoogleAccountSettingsPage &gt; allows disconnecting Sheets via confirmation dialog</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/GoogleSheetSettingsPage.test.jsx</code> · 5 項</summary>

來源輸入、驗證、離頁保存及刷新失敗需維持編輯內容。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/GoogleSheetSettingsPage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 43 | <code>GoogleSheetSettingsPage autosave lifecycle &gt; labels the real source input and explains its persistence</code> | 保留 |  |
| 53 | <code>GoogleSheetSettingsPage autosave lifecycle &gt; saves a pasted source without surrounding whitespace</code> | 保留 |  |
| 72 | <code>GoogleSheetSettingsPage autosave lifecycle &gt; flushes the latest debounced value once when the page unmounts</code> | 保留 |  |
| 92 | <code>GoogleSheetSettingsPage autosave lifecycle &gt; does not duplicate an autosave already queued before unmount</code> | 保留 |  |
| 121 | <code>GoogleSheetSettingsPage autosave lifecycle &gt; shows a refresh warning after a confirmed settings write</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/LoginPage.test.jsx</code> · 4 項</summary>

登入前配置不足與 OAuth callback 失敗需要不同恢復方式。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/LoginPage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 26 | <code>LoginPage readiness &gt; prevents a dead-end OAuth attempt and can recover after configuration changes</code> | 保留 |  |
| 42 | <code>LoginPage readiness &gt; keeps an OAuth callback error visible when readiness later succeeds</code> | 保留 |  |
| 51 | <code>LoginPage readiness &gt; clears only the readiness error after a successful recheck</code> | 保留 |  |
| 65 | <code>LoginPage readiness &gt; describes the modular decoupled authorizations</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/PhotoCuratorPage.test.jsx</code> · 26 項</summary>

排版、跨工具保留檔案、排序、撤銷與 ZIP 內的資料各自可能出錯。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/PhotoCuratorPage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 67 | <code>PhotoCuratorPage &gt; renders workbench with 3 post columns and unassigned pool</code> | 保留 |  |
| 86 | <code>PhotoCuratorPage &gt; switches between 3, 6 and 9 post groups, covers and quick assignment buttons</code> | 保留 |  |
| 101 | <code>PhotoCuratorPage &gt; keeps existing titles and photos while returning photos from removed posts to the pool</code> | 保留 |  |
| 134 | <code>PhotoCuratorPage</code><br><code>restores nine posts, titles and covers after undoing a switch to 3 posts</code><br><code>restores nine posts, titles and covers after undoing a switch to 6 posts</code> | 保留 |  |
| 160 | <code>PhotoCuratorPage &gt; allows importing photos and assigning them to post buckets</code> | 保留 |  |
| 188 | <code>PhotoCuratorPage &gt; allows customizing column titles directly without preset model</code> | 保留 |  |
| 204 | <code>PhotoCuratorPage &gt; allows resetting workbench through ConfirmDialog</code> | 保留 |  |
| 238 | <code>PhotoCuratorPage</code><br><code>auto-distributes 3 posts chronologically without losing any of 11 photos</code><br><code>auto-distributes 6 posts chronologically without losing any of 11 photos</code><br><code>auto-distributes 9 posts chronologically without losing any of 11 photos</code><br><code>auto-distributes 9 posts chronologically without losing any of 2 photos</code> | 保留 |  |
| 263 | <code>PhotoCuratorPage &gt; includes all nine posts in the copied checklist</code> | 保留 |  |
| 279 | <code>PhotoCuratorPage &gt; allows returning photo from post to unassigned pool and deleting from workbench</code> | 保留 |  |
| 316 | <code>PhotoCuratorPage</code><br><code>returns photos to their original import order via button and supports undo</code><br><code>returns photos to their original import order via drag and supports undo</code> | 保留 |  |
| 356 | <code>PhotoCuratorPage &gt; copies checklist text to clipboard</code> | 保留 |  |
| 377 | <code>PhotoCuratorPage &gt; reports clipboard rejection without an unhandled failure or a success message</code> | 保留 |  |
| 389 | <code>PhotoCuratorPage &gt; keeps local files, titles and ordering when switching tools and releases them on logout</code> | 保留 |  |
| 424 | <code>PhotoCuratorPage &gt; warns before losing work until all photos are exported, and warns again after edits</code> | 保留 |  |
| 439 | <code>PhotoCuratorPage &gt; keeps the unload warning for edits made while a ZIP export is still running</code> | 保留 |  |
| 469 | <code>PhotoCuratorPage &gt; moves photo 80 to 5 and back by number, preserves every other photo, and exports the new order</code> | 保留 |  |
| 511 | <code>PhotoCuratorPage &gt; offers numbered moves only for photos assigned to a post</code> | 保留 |  |
| 547 | <code>PhotoCuratorPage &gt; inserts in both directions, synchronizes cover/checklist, and restores the previous order</code> | 保留 |  |
| 563 | <code>PhotoCuratorPage &gt; moves between posts at a specific position without duplicates and ignores self/foreign drops</code> | 保留 |  |
| 581 | <code>PhotoCuratorPage &gt; protects existing groups before redistribution and permits undo without reverting renamed titles</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/PlaylistSortPage.test.jsx</code> · 43 項</summary>

頁面應該保護排序寫入、預覽來源和配額，純排序可集中到 model。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/PlaylistSortPage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 148 | <code>PlaylistSortPage &gt; restores the saved selected playlist when the library loads</code> | 保留 |  |
| 157 | <code>PlaylistSortPage &gt; loads and displays user playlists</code> | 保留 |  |
| 168 | <code>PlaylistSortPage &gt; reports malformed playlist data without treating it as an empty list</code> | 保留 |  |
| 177 | <code>PlaylistSortPage &gt; uses the YouTube Music feature API to connect a dedicated account</code> | 保留 |  |
| 189 | <code>PlaylistSortPage &gt; triggers preview and displays comparison results</code> | 保留 |  |
| 224 | <code>PlaylistSortPage &gt; ignores a preview response after the selected playlist changes</code> | 保留 |  |
| 251 | <code>PlaylistSortPage &gt; applies sort after confirmation in dialog</code> | 保留 |  |
| 307 | <code>PlaylistSortPage &gt; shows the failed item ID and safe error after a partial apply</code> | 保留 |  |
| 335 | <code>PlaylistSortPage &gt; filters playlists by name and description</code> | 保留 |  |
| 359 | <code>PlaylistSortPage &gt; renders album and track number metadata and displays zero quota message</code> | 保留 |  |
| 421 | <code>PlaylistSortPage &gt; allows applying sort by creating a new sorted playlist</code> | 保留 |  |
| 487 | <code>PlaylistSortPage</code><br><code>requires reconciliation before another preview after timeout</code><br><code>requires reconciliation before another preview after unknown write</code> | 保留 |  |
| 512 | <code>PlaylistSortPage &gt; allows pinning and unpinning playlists to quickly find them</code> | 保留 |  |
| 542 | <code>PlaylistSortPage &gt; respects track order within albums when sorting tracks locally</code> | 改寫完成 | 移到排序模型。保存同專輯昇降序及曲號缺失案例。 |
| 573 | <code>PlaylistSortPage &gt; orders non-album singles chronologically with albums by release year instead of shoving to front</code> | 合併完成 | 模型驗證非專輯單曲與專輯按日期交錯。頁面驗證實際排序結果。 |
| 590 | <code>PlaylistSortPage &gt; orders videos (album=&quot;影片&quot;) chronologically with albums by release date instead of throwing to end</code> | 合併完成 | 模型驗證影片與專輯日期，頁面保留影片副標題測試。 |
| 605 | <code>PlaylistSortPage &gt; renders TrackSubtitle with all used items, full-width dot separator, and unparenthesized date</code> | 保留 |  |
| 626 | <code>PlaylistSortPage &gt; renders TrackSubtitle for non-album singles with date and no fake album icon</code> | 保留 |  |
| 640 | <code>PlaylistSortPage &gt; renders TrackSubtitle for video items with 🎬 影片 and no fake #1 track number</code> | 保留 |  |
| 657 | <code>PlaylistSortPage &gt; normalizes Topic channel suffixes with normalizeArtistName</code> | 合併完成 | 已將兩套 Topic／主題名稱與邊界資料集中至模型。 |
| 671 | <code>PlaylistSortPage &gt; groups Artist and Artist - Topic together and sorts chronologically</code> | 改寫完成 | 移到排序模型。保存同藝人合併與時間排序。 |
| 701 | <code>PlaylistSortPage &gt; renders TrackSubtitle with normalized artist name stripping - Topic</code> | 保留 |  |
| 715 | <code>PlaylistSortPage &gt; maps language codes to appropriate collation locales in getLocaleCollation</code> | 合併完成 | locale 別名與回退集中至模型測試。 |
| 725 | <code>PlaylistSortPage &gt; displays Taiwan region badge by default linking to settings</code> | 保留 |  |
| 736 | <code>PlaylistSortPage &gt; splits artist collaborations and detects primary author</code> | 合併完成 | 舊合作字串和作者判定移入模型。 |
| 750 | <code>PlaylistSortPage &gt; prioritizes first author in collaborative songs under classic album sort</code> | 合併完成 | 模型驗證合作曲目在主要作者專輯的曲序。 |
| 775 | <code>PlaylistSortPage &gt; keeps collaborative song with album when first author is uncertain or guest listed first</code> | 合併完成 | 模型驗證客座藝人先列時仍保留專輯曲序。 |
| 796 | <code>PlaylistSortPage &gt; keeps compilation/soundtrack albums together under album sort</code> | 合併完成 | 模型直接驗證原聲帶曲目保持成組。 |
| 817 | <code>PlaylistSortPage &gt; toggles QuickTokenDrawer when clicking paste token button</code> | 保留 |  |
| 844 | <code>PlaylistSortPage &gt; intercepts token failure with strict defense dialog and permits user to continue with quota</code> | 保留 |  |
| 915 | <code>PlaylistSortPage &gt; triggers 429 quota exceeded recovery dialog and can open token drawer</code> | 保留 |  |
| 943 | <code>PlaylistSortPage &gt; allows saving an already sorted playlist as a new playlist</code> | 保留 |  |
| 987 | <code>PlaylistSortPage &gt; keeps the API engine and updates quota when a zero-move preview changes locally</code> | 保留 |  |
| 1011 | <code>PlaylistSortPage &gt; updates API quota for changed rules and for copying all songs to a new playlist</code> | 保留 |  |
| 1031 | <code>PlaylistSortPage &gt; locks playlist changes and rule/cache controls while applying and retains the write result</code> | 保留 |  |
| 1073 | <code>PlaylistSortPage</code><br><code>retains the writing source and success outcome after a background library refresh</code><br><code>retains the writing source and unknown outcome after a background library refresh</code><br><code>retains the writing source and late success outcome after a background library refresh</code> | 保留 |  |
| 1205 | <code>playlist write result ownership</code><br><code>retains a same-account success outcome without clearing a newer source preview</code><br><code>retains a same-account unknown outcome without clearing a newer source preview</code> | 保留 |  |
| 1249 | <code>playlist write result ownership</code><br><code>suppresses a previous-account result after switch</code><br><code>suppresses a previous-account result after unmount</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/PublishCleanerPage.test.jsx</code> · 4 項</summary>

使用者只會在確認後送出清理，必須能分辨無候選和結果未知。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/PublishCleanerPage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 75 | <code>cleanup-only page &gt; previews without writes and only cleans after a second confirmation</code> | 保留 |  |
| 92 | <code>cleanup-only page &gt; has a clear empty candidate state and no edit or publication action</code> | 保留 |  |
| 105 | <code>cleanup-only page &gt; ignores old reads and closes confirmation when source changes</code> | 保留 |  |
| 119 | <code>cleanup-only page &gt; shows unknown and quota interruption without a success toast</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/SetupWizardPage.test.jsx</code> · 5 項</summary>

未初始化、PIN、成功轉址和錯誤可重試屬於登入前的關鍵路徑。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/SetupWizardPage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 40 | <code>SetupWizardPage &gt; renders completed state when system is already set up</code> | 保留 |  |
| 56 | <code>SetupWizardPage &gt; renders setup form with development PIN auto-filled when in dev mode</code> | 保留 |  |
| 72 | <code>SetupWizardPage &gt; submits a normalized administrator email and redirects to login</code> | 保留 |  |
| 117 | <code>SetupWizardPage &gt; blocks setup until an unavailable status is successfully retried</code> | 保留 |  |
| 139 | <code>SetupWizardPage &gt; displays error alert when setup fails</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/SheetCopyPage.test.jsx</code> · 4 項</summary>

欄位顯示偏好及收起／恢復資料列會影響實際複製流程。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/SheetCopyPage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 71 | <code>SheetCopyPage work-state persistence &gt; restores the last display option and saves a changed option once</code> | 保留 |  |
| 117 | <code>SheetCopyPage row dismissal and restoration &gt; allows dismissing individual rows and restoring all dismissed rows</code> | 保留 |  |
| 147 | <code>SheetCopyPage row dismissal and restoration &gt; shows empty state with restore button when all candidate rows are dismissed</code> | 保留 |  |
| 172 | <code>SheetCopyPage row dismissal and restoration &gt; resets dismissed rows when switching worksheet</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/StickyNotesPage.test.jsx</code> · 7 項</summary>

筆記清單、模板新增、複製順序和不確定寫入需要頁面驗證。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/StickyNotesPage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 52 | <code>StickyNotesPage &gt; renders notes list fetched from api</code> | 保留 |  |
| 64 | <code>StickyNotesPage &gt; creates a new note when clicking add button</code> | 保留 |  |
| 91 | <code>StickyNotesPage &gt; filters notes based on search query</code> | 保留 |  |
| 111 | <code>StickyNotesPage &gt; shows a read error instead of an empty state when the list contract is invalid</code> | 保留 |  |
| 120 | <code>StickyNotesPage &gt; reloads after an ambiguous create response before allowing another create</code> | 保留 |  |
| 139 | <code>StickyNotesPage &gt; creates a template note with its own type and variable storage</code> | 保留 |  |
| 157 | <code>StickyNotesPage &gt; inserts an independent duplicate beside the source</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/SystemInfoPage.test.jsx</code> · 1 項</summary>

唯讀的部署資訊與設計系統入口是維運所需的公開頁面契約。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/SystemInfoPage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 8 | <code>SystemInfoPage &gt; shows read-only deployment values and links to the design system showcase</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/SystemSettingsPage.test.jsx</code> · 5 項</summary>

安全狀態、管理政策以及無法確認的寫入需清楚呈現。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/SystemSettingsPage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 32 | <code>SystemSettingsPage &gt; renders security status, credentials, and allowlist</code> | 保留 |  |
| 63 | <code>SystemSettingsPage &gt; allows editing and updating Google OAuth credentials</code> | 保留 |  |
| 115 | <code>SystemSettingsPage &gt; allows adding and removing emails from the allowlist</code> | 保留 |  |
| 161 | <code>SystemSettingsPage &gt; allows toggling whether adding new user accounts is permitted</code> | 保留 |  |
| 210 | <code>SystemSettingsPage &gt; shows a retry state when settings cannot be confirmed</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/YouTubeSettingsPage.test.jsx</code> · 11 項</summary>

兩槽憑證、分開保存設定、刷新結果及斷線作業會互相競爭。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/YouTubeSettingsPage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 116 | <code>YouTubeSettingsPage &gt; preserves backend channel_mismatch and an explicit can_be_active false</code> | 保留 |  |
| 130 | <code>YouTubeSettingsPage &gt; labels OAuth credential fields and exposes the secret visibility state</code> | 保留 |  |
| 144 | <code>YouTubeSettingsPage &gt; preserves edited settings on auth refresh while updating untouched fields</code> | 保留 |  |
| 182 | <code>YouTubeSettingsPage &gt; keeps another slot and routing draft when refreshing after a quota save</code> | 保留 |  |
| 221 | <code>YouTubeSettingsPage &gt; saves quota and playlist through separate actions without crossing unsaved drafts</code> | 保留 |  |
| 248 | <code>YouTubeSettingsPage &gt; does not report a quota write as saved when the confirmation disagrees</code> | 保留 |  |
| 266 | <code>YouTubeSettingsPage &gt; reports a confirmed quota write separately from a failed settings refresh</code> | 保留 |  |
| 279 | <code>YouTubeSettingsPage &gt; keeps a failed manual playlist save unsaved and allows clearing the saved playlist</code> | 保留 |  |
| 297 | <code>YouTubeSettingsPage &gt; confirms every disconnect and explains the active-slot impact</code> | 保留 |  |
| 324 | <code>YouTubeSettingsPage &gt; locks conflicting authorization controls while one OAuth operation is running</code> | 保留 |  |
| 349 | <code>YouTubeSettingsPage &gt; flushes pending playlist change on unmount</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/pages/YtmusicSettingsPage.test.jsx</code> · 12 項</summary>

驗證、token 保存、授權 fallback 和偏好持久化都有獨立 UI 結果。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/pages/YtmusicSettingsPage.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 42 | <code>YtmusicSettingsPage &gt; renders disconnected state correctly</code> | 保留 |  |
| 64 | <code>YtmusicSettingsPage &gt; renders fallback state when primary YouTube channel is connected</code> | 保留 |  |
| 88 | <code>YtmusicSettingsPage &gt; renders connected state with token health information</code> | 保留 |  |
| 116 | <code>YtmusicSettingsPage &gt; allows changing the default sort preset</code> | 保留 |  |
| 137 | <code>YtmusicSettingsPage &gt; does not report preference save success when work-state persistence fails</code> | 保留 |  |
| 154 | <code>YtmusicSettingsPage &gt; allows disconnecting YouTube Music via confirm dialog</code> | 保留 |  |
| 186 | <code>YtmusicSettingsPage &gt; renders region and language selector defaulting to Taiwan and explains standards</code> | 保留 |  |
| 214 | <code>YtmusicSettingsPage &gt; allows switching to custom region and entering custom language and location</code> | 保留 |  |
| 251 | <code>YtmusicSettingsPage &gt; triggers connect flow when clicking connect</code> | 保留 |  |
| 273 | <code>YtmusicSettingsPage &gt; validates currently saved custom token and displays success result</code> | 保留 |  |
| 311 | <code>YtmusicSettingsPage &gt; validates input token and displays error when validation fails</code> | 保留 |  |
| 354 | <code>YtmusicSettingsPage &gt; keeps token writes disabled when an uncertain save cannot be reconciled</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/routes/AppRoutes.test.jsx</code> · 33 項</summary>

canonical URL、深層連結、未知頁面及工具生命週期影響實際可到達的路由。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/routes/AppRoutes.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 113 | <code>AppRoutes &gt; blocks a deep link when the backend disables its tool</code> | 保留 |  |
| 128 | <code>AppRoutes &gt; blocks a deep link when tool startup fails</code> | 保留 |  |
| 144 | <code>AppRoutes &gt; shows an error instead of loading a route for an unsupported catalog version</code> | 保留 |  |
| 159 | <code>AppRoutes &gt; retries a failed catalog load before opening a tool route</code> | 保留 |  |
| 189 | <code>AppRoutes</code><br><code>renders /dashboard</code><br><code>renders /system/health</code><br><code>renders /system/info</code><br><code>renders /system/design-system</code><br><code>renders /youtube/drafts/videos</code><br><code>renders /youtube/drafts/shorts</code><br><code>renders /youtube/drafts/videos/staged</code><br><code>renders /youtube/drafts/shorts/staged</code><br><code>renders /youtube/publish-cleanup</code><br><code>renders /youtube/settings/connections</code><br><code>renders /youtube/settings/routing</code><br><code>renders /youtube/settings/quota</code><br><code>renders /youtube/settings/playlist</code><br><code>renders /sheets/copy</code><br><code>renders /settings/google</code><br><code>renders /sheets/settings</code><br><code>renders /system/settings</code><br><code>renders /notes</code><br><code>renders /photo-curator</code><br><code>renders /ffmpeg-generator</code> | 保留 |  |
| 198 | <code>AppRoutes</code><br><code>replaces parent path / with /dashboard</code><br><code>replaces parent path /youtube/settings with /youtube/settings/connections</code><br><code>replaces parent path /settings with /settings/google</code> | 保留 |  |
| 207 | <code>AppRoutes</code><br><code>preserves canonical destination for unauthenticated alias /youtube/settings</code><br><code>preserves canonical destination for unauthenticated alias /settings</code> | 保留 |  |
| 213 | <code>AppRoutes</code><br><code>renders 404 for unknown settings child path /youtube/settings/missing</code><br><code>renders 404 for unknown settings child path /settings/missing</code> | 保留 |  |
| 221 | <code>AppRoutes &gt; renders a safe 404 for an unknown protected URL</code> | 保留 |  |
| 226 | <code>AppRoutes &gt; preserves a safe deep path when auth is missing</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/routes/RouteEffects.test.jsx</code> · 3 項</summary>

瀏覽器標題須隨頁面更新，並提供未知路徑的回退。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/routes/RouteEffects.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 9 | <code>RouteEffects and titleForPath &gt; returns valid page title for all registered PATHS</code> | 保留 |  |
| 48 | <code>RouteEffects and titleForPath &gt; returns 頁面不存在｜Toolbox for unknown routes</code> | 保留 |  |
| 53 | <code>RouteEffects and titleForPath &gt; sets document.title when rendered inside a router</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/routes/paths.test.js</code> · 7 項</summary>

常量、別名與授權回跳需兼容既有連結和拒絕不合法目的地。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/routes/paths.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 9 | <code>route paths &gt; exposes canonical paths</code> | 保留 |  |
| 18 | <code>route paths &gt; accepts known protected internal paths without hashes</code> | 保留 |  |
| 31 | <code>route paths</code><br><code>canonicalizes protected alias /youtube/settings to /youtube/settings/connections for auth return paths</code><br><code>canonicalizes protected alias /settings to /settings/google for auth return paths</code><br><code>canonicalizes protected alias /settings/sheets to /sheets/settings for auth return paths</code><br><code>canonicalizes protected alias /settings/system to /system/settings for auth return paths</code> | 保留 |  |
| 35 | <code>route paths &gt; rejects external, protocol-relative, API, login and unknown paths</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/services/api.test.js</code> · 16 項</summary>

共同 transport 的逾時、取消、401 去重、錯誤 shape 及舊 API 呼叫已有使用者。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/services/api.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 11 | <code>API request recovery &gt; uses the backend detail and announces an expired session</code> | 保留 |  |
| 32 | <code>API request recovery &gt; turns a network failure into a clear retry message</code> | 保留 |  |
| 44 | <code>API request recovery &gt; aborts a request that would otherwise wait forever</code> | 保留 |  |
| 69 | <code>API request recovery &gt; keeps the timeout active while a response body is still loading</code> | 保留 |  |
| 87 | <code>API request recovery &gt; cancels draft preparation after headers arrive without waiting for a stalled body</code> | 保留 |  |
| 112 | <code>API request recovery &gt; keeps structured error detail codes from the backend</code> | 保留 |  |
| 129 | <code>API request recovery &gt; sends queue-free YouTube metadata input and returns direct per-video results</code> | 保留 |  |
| 173 | <code>API request recovery &gt; sends the publish preview token and snapshot to the backend</code> | 保留 |  |
| 199 | <code>API request recovery &gt; handles non-JSON errors and exposes Retry-After in Traditional Chinese</code> | 保留 |  |
| 219 | <code>API request recovery &gt; announces one session-expired event for parallel 401 responses</code> | 保留 |  |
| 235 | <code>API request recovery &gt; keeps the primary quota menu and hides an unavailable secondary slot</code> | 保留 |  |
| 261 | <code>API request recovery &gt; sends single-video YouTube metadata updates</code> | 保留 |  |
| 287 | <code>API request recovery &gt; routes secondary OAuth and quota requests by slot</code> | 保留 |  |
| 306 | <code>API request recovery &gt; normalizes playlist URLs before sending the compatible resource payload</code> | 保留 |  |
| 330 | <code>API request recovery &gt; does not cross-write playlist data when saving an isolated quota policy</code> | 保留 |  |
| 353 | <code>Sticky Notes payloads &gt; sends template type and values on create and update</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/shared/model/resultExport.test.ts</code> · 2 項</summary>

文字保真、試算表輸出及檔案 URL 生命週期須連同下載一起驗證。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/shared/model/resultExport.test.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 5 | <code>result exports &gt; preserves statuses, Unicode, line breaks and neutralizes spreadsheet formulas</code> | 保留 |  |
| 16 | <code>result exports &gt; downloads JSON and releases its object URL</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/shared/ui/index.test.jsx</code> · 3 項</summary>

共用標籤、busy 和狀態元件的無障礙契約。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/shared/ui/index.test.jsx)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 7 | <code>shared UI primitives &gt; connects field labels and error messages to the input</code> | 保留 |  |
| 14 | <code>shared UI primitives &gt; disables an action and exposes its busy state while loading</code> | 保留 |  |
| 28 | <code>shared UI primitives &gt; renders state, badge, card and page title with their semantic roles</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/styles/tokens.test.js</code> · 1 項</summary>

重複 CSS 變數會被後面定義覆蓋，共用設計 token 需要保護。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/styles/tokens.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 10 | <code>shared design tokens &gt; defines each custom property once in the shared token sheet</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/tools/capabilities.test.js</code> · 5 項</summary>

缺權限、fallback 及路由覆寫必須映射成正確能力標記。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/tools/capabilities.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 8 | <code>tool capability presentation &gt; distinguishes Sheets and creator channel authorization</code> | 保留 |  |
| 28 | <code>tool capability presentation &gt; does not present a mismatched YouTube channel as a usable capability</code> | 保留 |  |
| 46 | <code>tool capability presentation &gt; honors YT Music channel fallback but keeps uploader authorization independent</code> | 保留 |  |
| 59 | <code>tool capability presentation &gt; rejects unknown scope mappings rather than treating them as granted</code> | 保留 |  |
| 64 | <code>tool capability presentation &gt; uses each route capability override, including an intentionally empty requirement</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/tools/catalog.test.js</code> · 15 項</summary>

manifest 合併、相容性、工具隔離與顯示順序決定路由與導覽是否可靠。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/tools/catalog.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 20 | <code>Toolbox Frontend Tool Catalog &gt; returns registered tools with metadata</code> | 保留 |  |
| 33 | <code>Toolbox Frontend Tool Catalog &gt; keeps tool, navigation, card identifiers and destinations consistent</code> | 保留 |  |
| 54 | <code>Toolbox Frontend Tool Catalog &gt; rejects duplicate feature IDs and routes outside the route registry</code> | 保留 |  |
| 65 | <code>Toolbox Frontend Tool Catalog &gt; aggregates unique routes from each feature manifest</code> | 保留 |  |
| 73 | <code>Toolbox Frontend Tool Catalog &gt; rejects ambiguous nested index and wildcard routes</code> | 保留 |  |
| 88 | <code>Toolbox Frontend Tool Catalog &gt; validates absolute and relative redirect destinations</code> | 保留 |  |
| 100 | <code>Toolbox Frontend Tool Catalog &gt; finds tool by id</code> | 保留 |  |
| 135 | <code>Toolbox Frontend Tool Catalog &gt; aggregates navigation groups and system items</code> | 保留 |  |
| 154 | <code>Toolbox Frontend Tool Catalog &gt; provides dashboard feature cards</code> | 保留 |  |
| 170 | <code>Toolbox Frontend Tool Catalog &gt; uses backend status and metadata without inventing a frontend tool</code> | 保留 |  |
| 193 | <code>Toolbox Frontend Tool Catalog &gt; omits tools whose runtime health is unavailable</code> | 保留 |  |
| 211 | <code>Toolbox Frontend Tool Catalog &gt; accepts staged draft pages with a shared navigation entry and preserves route capabilities</code> | 保留 |  |
| 255 | <code>Toolbox Frontend Tool Catalog &gt; accepts declared nested routes without treating a wildcard as support for unknown pages</code> | 保留 |  |
| 285 | <code>Toolbox Frontend Tool Catalog &gt; isolates unknown, duplicate and incompatible tools while preserving valid tools</code> | 保留 |  |
| 321 | <code>Toolbox Frontend Tool Catalog &gt; keeps the frontend presentation order when the backend registry order changes</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/utils/authHash.test.js</code> · 2 項</summary>

OAuth callback 的 hash 處理必須正確讀取並避免再次套用。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/utils/authHash.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 4 | <code>OAuth callback hash parsing &gt; uses exact Google callback keys</code> | 保留 |  |
| 16 | <code>OAuth callback hash parsing &gt; clears the hash without navigating or replaying the callback</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/utils/authReturnPath.test.js</code> · 2 項</summary>

各 OAuth 資源的返回路徑需隔離，無法使用的路徑須回退。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/utils/authReturnPath.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 10 | <code>OAuth return paths &gt; stores and consumes separate Google, Sheets, Drive, YouTube, YT Music, and Video Uploader return paths</code> | 保留 |  |
| 25 | <code>OAuth return paths &gt; consumes unsafe values and uses a safe fallback</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/utils/clipboard.test.js</code> · 3 項</summary>

現代與舊瀏覽器的剪貼簿支援和失敗回傳都需保留。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/utils/clipboard.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 19 | <code>copyToClipboard &gt; uses navigator.clipboard.writeText when available</code> | 保留 |  |
| 31 | <code>copyToClipboard &gt; falls back to document.execCommand when navigator.clipboard is unavailable</code> | 保留 |  |
| 45 | <code>copyToClipboard &gt; throws an error if execCommand fails in fallback mode</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/utils/curatorZip.test.js</code> · 3 項</summary>

清單文字、未分配相片及 ZIP 下載的低層契約。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/utils/curatorZip.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 6 | <code>curatorZip utils &gt; generateChecklistText &gt; produces formatted checklist text for posts</code> | 保留 |  |
| 24 | <code>curatorZip utils &gt; generateChecklistText &gt; lists unassigned photos if any</code> | 保留 |  |
| 44 | <code>curatorZip utils &gt; exportCuratedZip &gt; creates zip blob and triggers anchor download</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/utils/ffmpegCommand.test.js</code> · 9 項</summary>

舊匯入入口仍具相容性價值。與 feature model 共用的純驗證可集中，並保留入口冒煙案例。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/utils/ffmpegCommand.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 14 | <code>ffmpegCommand utils &gt; time formatting and parsing &gt; converts seconds to HH:MM:SS.mmm format</code> | 保留 |  |
| 21 | <code>ffmpegCommand utils &gt; time formatting and parsing &gt; parses HH:MM:SS.mmm string to seconds</code> | 保留 |  |
| 29 | <code>ffmpegCommand utils &gt; time formatting and parsing &gt; formats file sizes accurately</code> | 保留 |  |
| 38 | <code>ffmpegCommand utils &gt; buildTrimSummary &gt; computes cut endpoints and duration</code> | 保留 |  |
| 56 | <code>ffmpegCommand utils &gt; buildTrimSummary &gt; flags invalid timestamps when start exceeds end</code> | 保留 |  |
| 72 | <code>ffmpegCommand utils &gt; quoteFilename &gt; preserves literal quotes, whitespace and backslashes in Bash strings</code> | 保留 | 可攜字串與原生 Shell 執行各自提供驗證，Windows 未指定 Bash 時仍有保護。 |
| 80 | <code>ffmpegCommand utils &gt; buildFfmpegCommand &gt; generates lossless trim copy command by default with double quotes</code> | 合併完成 | 與 model 的 fast seek 參數表合併，保留 5 到 20 秒及其說明。 |
| 110 | <code>ffmpegCommand utils &gt; buildFfmpegCommand &gt; quotes files with spaces and retains quotes when already present</code> | 保留 |  |
| 138 | <code>ffmpegCommand utils &gt; PRESET_LIST &gt; defines standard presets including lossless, h264, gif</code> | 保留 | 前端相容匯入入口提供 preset ID，後端 presets API 有獨立消費端。 |

</details>

<details><summary><code>frontend/src/utils/formatters.test.js</code> · 5 項</summary>

大小、時間和狀態的格式需處理零、空值與無效資料。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/utils/formatters.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 6 | <code>formatters &gt; formatBytes &gt; handles zero or falsy values</code> | 保留 |  |
| 13 | <code>formatters &gt; formatBytes &gt; formats bytes, KB, MB, and GB</code> | 保留 |  |
| 23 | <code>formatters &gt; formatTokenDate &gt; handles falsy or invalid dates</code> | 保留 |  |
| 29 | <code>formatters &gt; formatTokenDate &gt; formats valid date string</code> | 保留 |  |
| 37 | <code>formatters &gt; tokenStatusLabel &gt; returns expected status labels</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/utils/pageRecovery.test.js</code> · 4 項</summary>

恢復、保留路徑與只清除恢復參數是在重新載入時可觀察的行為。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/utils/pageRecovery.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 5 | <code>page recovery &gt; preserves the current route while adding a one-time cache-busting parameter</code> | 保留 |  |
| 11 | <code>page recovery &gt; clears only the recovery parameter after the app mounts</code> | 保留 |  |
| 22 | <code>page recovery &gt; does not change a normal URL</code> | 保留 |  |
| 28 | <code>page recovery &gt; navigates to the same page with a fresh recovery parameter</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/utils/playlistSort.test.js</code> · 13 項</summary>

語系、artist 正規化與經典排序情境仍有特色覆蓋。純資料驗證應靠近 feature model。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/utils/playlistSort.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 22 | <code>playlistSort utils &gt; getLocaleCollation &gt; normalizes locale tags correctly</code> | 合併完成 | 同義的語系別名和空值已併入排序模型。 |
| 36 | <code>playlistSort utils &gt; normalizeArtistName &gt; strips - Topic and (主題) suffixes</code> | 合併完成 | 原字串樣本併入排序模型的名稱正規化。 |
| 44 | <code>playlistSort utils &gt; normalizeArtistName &gt; cleans multi-artist comma lists</code> | 合併完成 | 保留逗號多藝人樣本，併入 model 名稱正規化。 |
| 50 | <code>playlistSort utils &gt; isGenericArtist &amp; isRealAlbum &gt; identifies generic compilation/soundtrack artist names</code> | 保留 |  |
| 59 | <code>playlistSort utils &gt; isGenericArtist &amp; isRealAlbum &gt; identifies singles and video placeholders as non-album</code> | 保留 |  |
| 70 | <code>playlistSort utils &gt; splitArtists &amp; getFirstArtist &gt; splits collaboration strings and featuring tags</code> | 保留 |  |
| 77 | <code>playlistSort utils &gt; splitArtists &amp; getFirstArtist &gt; extracts the first artist cleanly</code> | 保留 |  |
| 84 | <code>playlistSort utils &gt; buildAlbumContextMap &amp; getEffectiveSortArtist &gt; determines dominant artist and compilation context</code> | 保留 |  |
| 100 | <code>playlistSort utils &gt; sortTracksLocally &gt; sorts tracks by title ascending and descending</code> | 保留 |  |
| 114 | <code>playlistSort utils &gt; sortTracksLocally &gt; sorts tracks by track_number within album</code> | 保留 |  |
| 126 | <code>playlistSort utils &gt; buildPreviewFromSorted &gt; calculates moved and unchanged counts accurately</code> | 合併完成 | 模型的位移計數核對推算原位置與明確 provider 原位置。 |
| 147 | <code>playlistSort utils &gt; formatDuration &gt; formats seconds into mm:ss or hh:mm:ss</code> | 保留 |  |
| 157 | <code>playlistSort utils &gt; constants export check &gt; exports predefined presets and fields</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/utils/teamPersonFilterStorage.test.js</code> · 4 項</summary>

瀏覽器與伺服器欄位映射、資料優先順序和複合身分需保持相容。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/utils/teamPersonFilterStorage.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 6 | <code>teamPersonFilterStorage &gt; normalizes the browser and server field names</code> | 保留 |  |
| 15 | <code>teamPersonFilterStorage &gt; uses the server record when configured</code> | 保留 |  |
| 25 | <code>teamPersonFilterStorage &gt; uses an empty default without a server or local record</code> | 保留 |  |
| 38 | <code>round trips cross-team keys, whole-team type and filters without reinterpreting them</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/utils/videoOrder.test.js</code> · 1 項</summary>

無日期影片保留穩定順序，排序不改原輸入。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/utils/videoOrder.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 5 | <code>sortVideosByUploadTime &gt; puts dated videos first, uses sequence as the stable fallback, and preserves input</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/utils/youtubeCopy.test.js</code> · 3 項</summary>

空時間及數字格式會影響辨識資料。固定詞彙綁定可於集中管理時降低重複。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/utils/youtubeCopy.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 13 | <code>youtubeCopy &gt; keeps the shared action vocabulary in one place</code> | 改寫完成 | 在批次確認畫面直接核對更新範圍，清理及發布由各自工作流測試驗證。 |
| 25 | <code>youtubeCopy &gt; formats counts, identifiers and quota units consistently</code> | 保留 |  |
| 35 | <code>youtubeCopy &gt; keeps missing upload times explicit for stable ordering</code> | 保留 |  |

</details>

<details><summary><code>frontend/src/utils/youtubeRouting.test.js</code> · 6 項</summary>

槽位選擇、失效原因和授權指紋影響可用性及頁面是否重新讀取。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/src/utils/youtubeRouting.test.js)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 14 | <code>YouTube routing helpers &gt; defaults unknown routing modes to auto-primary</code> | 保留 |  |
| 20 | <code>YouTube routing helpers &gt; prefers an authenticated primary slot and falls back to secondary</code> | 保留 |  |
| 36 | <code>YouTube routing helpers &gt; uses only the active slot for manual connectivity</code> | 保留 |  |
| 48 | <code>YouTube routing helpers &gt; treats a channel mismatch or a blocked slot as unusable</code> | 保留 |  |
| 70 | <code>YouTube routing helpers &gt; provides safe routing explanations for known and unknown reasons</code> | 保留 |  |
| 76 | <code>YouTube routing helpers &gt; generates consistent authorization fingerprints and auth context</code> | 保留 |  |

</details>


## Playwright 功能

<details><summary><code>frontend/e2e/component-showcase.spec.ts</code> · 24 項</summary>

混合版面與多種工具的生產建置冒煙測試，逐案裁決見下表。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/e2e/component-showcase.spec.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 8 | <code>component showcase stays readable without horizontal overflow on supported widths</code> | 保留 | 直接測無橫向溢位。視覺快照覆蓋不同風險。 |
| 29 | <code>dashboard uses feature-owned styles on supported widths</code> | 合併完成 | Dashboard 三種寬度以功能案例觀察卡片、狀態、搜尋與溢位，色彩交由視覺基準。 |
| 44 | <code>login and setup pages use the shared auth layout on supported widths</code> | 改寫完成 | 驗證登入按鈕、安裝欄位和密鑰切換在三種寬度可見且無橫向溢位。 |
| 77 | <code>system settings use feature styles and remain usable on supported widths</code> | 改寫完成 | 以允許新增時可輸入信箱並啟用新增按鈕驗證控制項。 |
| 131 | <code>system settings keeps the edit controls closed when a read response is malformed</code> | 保留 | 壞的讀取確認必須阻止進入可修改憑證的畫面。 |
| 147 | <code>Quick Token Drawer uses its feature styles on supported widths</code> | 改寫完成 | 開啟教學、輸入測試值及取消，核對抽屜控制可見且無溢位。 |
| 168 | <code>YouTube settings sub-navigation uses feature styles on supported widths</code> | 保留 | 子導覽、主標題與憑證控制在真實版面需可達。 |
| 206 | <code>YouTube Music settings use feature styles and remain usable on supported widths</code> | 改寫完成 | 驗證 Token 操作和區域表單鍵盤焦點順序。 |
| 241 | <code>sheet copy feature styles load and stay within supported viewport widths</code> | 保留 | 真實 CSS 與欄位表格需在三種寬度可讀。 |
| 259 | <code>Google Sheets settings stay usable on supported viewport widths</code> | 保留 | 來源與保存入口要在三種寬度可直接找到。 |
| 277 | <code>sticky notes feature styles load without viewport overflow</code> | 改寫完成 | 測量搜尋框文字區與搜尋圖示、清除按鈕之間的實際位置。 |
| 295 | <code>photo curator feature styles keep the workbench within supported viewport widths</code> | 合併完成 | 三種寬度的 3／6／9 格案例先驗證空工作台格線及無溢位。 |
| 309 | <code>FFmpeg feature styles switch to a single-column workbench on narrow screens</code> | 保留 | 窄版欄位排列與桌面雙欄是不同的佈局契約。 |
| 344 | <code>publish cleaner feature styles align source controls for mobile and desktop</code> | 改寫完成 | 三種寬度測實際位置、尺寸及溢位，支援瀏覽器回傳不同但等價的 CSS 詞彙。 |
| 364 | <code>YouTube batch feature styles load without viewport overflow</code> | 保留 | 批次來源抽查與基本頁面寬度和暫存長內容的場景不同。 |
| 378 | <code>Google Sheets OAuth uses the backend URL and redirects to the provider</code> | 保留 | 從真實按鈕到假 OAuth 頁面的導覽能抓到錯連線，沒有真實登入。 |
| 397 | <code>Google account settings use feature styles and stay within supported viewport widths</code> | 改寫完成 | 核對服務連結的實際目的地、可見區範圍和是否重疊。 |
| 417 | <code>Playlist Sort previews and confirms creation of a sorted playlist</code> | 保留 | 使用者實際走過 preview、排序和建立新播放清單的二次確認。 |
| 516 | <code>YouTube drafts preserve manual edits through reload and publish after final confirmation</code> | 保留 | 從草稿到最終發布的確切 payload 與手動值需要一次端到端驗證。 |
| 663 | <code>cleanup previews exact public items and only removes members after confirmation</code> | 保留 | 重複影片的成員身分、私人保留與確認前零寫入有不同保障。 |
| 694 | <code>Photo Curator exports the assigned image and checklist in a ZIP download</code> | 保留 | 此案例核對單份相片與 checklist，6／9 個資料夾是另外的容量情境。 |
| 724 | <code>Sticky Notes autosaves edits, toggles pin state, and deletes through its API</code> | 保留 | 完整驗證載入、保存、釘選及刪除連到正確的 API fake。 |
| 779 | <code>Sticky Notes rejects a malformed list instead of showing an empty notebook</code> | 合併完成 | 同一份矛盾回應由 StickyNotesPage 使用實際 API 契約解析器驗證。 |
| 790 | <code>Sticky Notes reconciles an ambiguous create without sending a duplicate</code> | 保留 | 觀察 UI 與實際請求次數，確保讀回核對後不重複新增。 |

</details>

<details><summary><code>frontend/e2e/cross-team-people.spec.ts</code> · 5 項</summary>

瀏覽器串接跨團人物、排除條件、還原和發布請求的實際 payload。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/e2e/cross-team-people.spec.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 71 | <code>cross-team sheet selection, filters, undo and reload at 1440px</code> | 改寫完成 | 重整等待 DOM，後續查驗勾選與篩選結果。 |
| 71 | <code>cross-team sheet selection, filters, undo and reload at 390px</code> | 改寫完成 | 重整等待 DOM，後續查驗勾選與篩選結果。 |
| 71 | <code>cross-team sheet selection, filters, undo and reload at 768px</code> | 改寫完成 | 重整等待 DOM，後續查驗勾選與篩選結果。 |
| 119 | <code>batch Shorts retains assignments after filters clear and sends each composite identity</code> | 保留 |  |
| 119 | <code>batch Video retains assignments after filters clear and sends each composite identity</code> | 保留 |  |

</details>

<details><summary><code>frontend/e2e/dashboard.spec.ts</code> · 2 項</summary>

透過生產 build 驗證工具搜尋、權限狀態、捷徑與側欄保存。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/e2e/dashboard.spec.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 19 | <code>dashboard search and authorization summary stay usable at supported widths</code> | 改寫完成 | 三種寬度分別啟動。保護登入狀態、卡片就緒、授權入口、搜尋和清除搜尋。 |
| 59 | <code>dashboard shortcuts survive tool visits, sidebar saves and a refresh</code> | 保留 |  |

</details>

<details><summary><code>frontend/e2e/feedback.spec.ts</code> · 1 項</summary>

共用對話框在真正的瀏覽器中需支援手機版面和鍵盤關閉。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/e2e/feedback.spec.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 4 | <code>shared confirmation styles preserve responsive layout and keyboard dismissal</code> | 保留 |  |

</details>

<details><summary><code>frontend/e2e/ffmpeg.spec.ts</code> · 3 項</summary>

真正的檔案選取器、鍵盤操作和命令區版面需瀏覽器驗證。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/e2e/ffmpeg.spec.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 4 | <code>FFmpeg editing preserves filenames and updates trim, encoding and shell commands</code> | 保留 |  |
| 46 | <code>FFmpeg video import opens the native file picker using the keyboard</code> | 保留 |  |
| 64 | <code>FFmpeg command keeps the available width above its copy action on mobile</code> | 保留 |  |

</details>

<details><summary><code>frontend/e2e/navigation-focus.spec.ts</code> · 1 項</summary>

動畫進行中的焦點次序在 jsdom 無法可靠重現。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/e2e/navigation-focus.spec.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 3 | <code>drawer traps keyboard focus during its opening animation</code> | 保留 |  |

</details>

<details><summary><code>frontend/e2e/navigation.spec.ts</code> · 7 項</summary>

直接路由、能力標記、側欄和焦點跨過元件與瀏覽器邊界。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/e2e/navigation.spec.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 4 | <code>missing capabilities show their own authorization destinations without hiding tools</code> | 保留 |  |
| 24 | <code>YT Music does not claim missing authorization when the channel fallback is connected</code> | 保留 |  |
| 42 | <code>mismatched YouTube channels are not presented as a usable connection</code> | 保留 |  |
| 71 | <code>disabled tools disappear from navigation and reject direct deep links</code> | 保留 |  |
| 71 | <code>startup failed tools disappear from navigation and reject direct deep links</code> | 保留 |  |
| 87 | <code>desktop collapse does not hide mobile navigation and drawer traps focus</code> | 保留 |  |
| 118 | <code>a delayed settings refresh does not undo a newer sidebar toggle</code> | 保留 |  |

</details>

<details><summary><code>frontend/e2e/notes.spec.ts</code> · 2 項</summary>

模板變數、複製和刷新後還原跨越 UI、瀏覽器儲存及 API。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/e2e/notes.spec.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 5 | <code>template notes duplicate, copy and persist at 1440px</code> | 保留 |  |
| 5 | <code>template notes duplicate, copy and persist at 390px</code> | 保留 |  |

</details>

<details><summary><code>frontend/e2e/photo-curator.spec.ts</code> · 12 項</summary>

拖曳、滑鼠預覽、檔案與 ZIP 內容需真瀏覽器核對。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/e2e/photo-curator.spec.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 29 | <code>hover previews stay clear of the pointer and preserve photo controls at 1440px</code> | 保留 |  |
| 29 | <code>hover previews stay clear of the pointer and preserve photo controls at 390px</code> | 保留 |  |
| 104 | <code>switching tools preserves local photos, grouping and titles</code> | 保留 |  |
| 129 | <code>3, 6 and 9 grid presets keep previews and quick assignment within 1440px</code> | 保留 |  |
| 129 | <code>3, 6 and 9 grid presets keep previews and quick assignment within 390px</code> | 保留 |  |
| 129 | <code>3, 6 and 9 grid presets keep previews and quick assignment within 768px</code> | 保留 |  |
| 174 | <code>exports all 6 post folders and their cover images</code> | 保留 |  |
| 174 | <code>exports all 9 post folders and their cover images</code> | 保留 |  |
| 212 | <code>photo grouping and precise sorting at 1440px</code> | 保留 |  |
| 212 | <code>photo grouping and precise sorting at 390px</code> | 保留 |  |
| 297 | <code>numbered photo insertion preserves project and ZIP order at 1440px</code> | 保留 |  |
| 297 | <code>numbered photo insertion preserves project and ZIP order at 390px</code> | 保留 |  |

</details>

<details><summary><code>frontend/e2e/quota.spec.ts</code> · 1 項</summary>

配額可恢復、真實顯示結構和桌機／手機控制項需同場景測。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/e2e/quota.spec.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 4 | <code>quota health supports refresh, failure recovery and responsive shared controls</code> | 保留 |  |

</details>

<details><summary><code>frontend/e2e/workflow-benchmark.spec.ts</code> · 3 項</summary>

交互次數與耗時是診斷資料，另有使用者工作流測試承擔正確性。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/e2e/workflow-benchmark.spec.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 14 | <code>workflow benchmark copy-six-cells</code> | 已移作量測 | 由 test:benchmark 執行。標準案例繼續驗證 TSV 和剪貼簿流程。 |
| 14 | <code>workflow benchmark recover-video-read</code> | 已移作量測 | 由 test:benchmark 量測完整流程。標準案例亦核對 503、重新讀取及零次發布。 |
| 14 | <code>workflow benchmark repeat-video-update</code> | 已移作量測 | 由 test:benchmark 執行。標準案例繼續驗證草稿及最終發布。 |

</details>

<details><summary><code>frontend/e2e/workflow-improvements.spec.ts</code> · 6 項</summary>

涵蓋跨頁流程、剪貼簿失敗、檔案重新配對和工具生命週期。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/e2e/workflow-improvements.spec.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 5 | <code>multi-cell clipboard failure and preview at 1440px</code> | 保留 |  |
| 5 | <code>multi-cell clipboard failure and preview at 390px</code> | 保留 |  |
| 5 | <code>multi-cell clipboard failure and preview at 768px</code> | 保留 |  |
| 56 | <code>photo project restores arrangement after reload with explicitly reselected local files</code> | 保留 |  |
| 81 | <code>bad catalog entry is isolated; health and operation records reflect their separate states</code> | 保留 |  |
| 124 | <code>deep links record recent tools without restoring a retired pin</code> | 保留 |  |

</details>

<details><summary><code>frontend/e2e/youtube-publish-progress.spec.ts</code> · 2 項</summary>

重新載入、遺失 202 及未執行與待核對分別呈現，是防重送的瀏覽器驗收。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/e2e/youtube-publish-progress.spec.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 44 | <code>ten-video progress survives reload and keeps timeout and unattempted rows separate</code> | 保留 |  |
| 62 | <code>a lost 202 is recovered by its saved request with no repeat POST</code> | 保留 |  |

</details>

<details><summary><code>frontend/e2e/youtube-staging.spec.ts</code> · 2 項</summary>

兩種來源要驗證各自保存，長內容與鍵盤共用頁面在三種寬度各跑一次。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/e2e/youtube-staging.spec.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 12 | <code>Shorts filters, rebuild confirmation and modal editing preserve drafts at mobile and desktop widths</code> | 改寫完成 | 保留 Shorts 獨立素材／草稿和取消重建。共用編輯頁的版面由三種 viewport 案例覆蓋。 |
| 12 | <code>Video filters, rebuild confirmation and modal editing preserve drafts at mobile and desktop widths</code> | 改寫完成 | 保留 Video 篩選、失敗重試、已選人物、保存手動標題與取消重建。版面及 modal 按 viewport 獨立驗證。 |

</details>

<details><summary><code>frontend/e2e/ytmusic-settings.spec.ts</code> · 2 項</summary>

格式錯誤和保存失敗都應阻止成功提示，各有不同 API 來源。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/e2e/ytmusic-settings.spec.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 4 | <code>YouTube Music does not show token validation success for a malformed response</code> | 保留 |  |
| 17 | <code>YouTube Music does not report a preference saved after the work-state write fails</code> | 保留 |  |

</details>


## Playwright 視覺

<details><summary><code>frontend/e2e/layout.visual.spec.ts</code> · 6 項</summary>

三個 viewport 上的空間、視覺狀態與焦點樣式由已審核圖像保護。 [原始測試檔](https://github.com/minhung1126/toolbox/blob/776a82eb5fb5586dc1250ef97c6e80caa974df24/frontend/e2e/layout.visual.spec.ts)

| 原行 | 測試案例 | 裁決 | 追蹤事項 |
| ---: | --- | --- | --- |
| 20 | <code>shared controls and keyboard focus at 1440px</code> | 改寫完成 | 每個 viewport 各比對一般和焦點狀態。焦點驗證及圖片差異可同一輪診斷。 |
| 20 | <code>shared controls and keyboard focus at 390px</code> | 改寫完成 | 每個 viewport 各比對一般和焦點狀態。焦點驗證及圖片差異可同一輪診斷。 |
| 20 | <code>shared controls and keyboard focus at 768px</code> | 改寫完成 | 每個 viewport 各比對一般和焦點狀態。焦點驗證及圖片差異可同一輪診斷。 |
| 31 | <code>dashboard and navigation at 1440px</code> | 改寫完成 | 切換成控制項與實際工具卡就緒訊號，已審核快照繼續保護三種版面。 |
| 31 | <code>dashboard and navigation at 390px</code> | 改寫完成 | 切換成控制項與實際工具卡就緒訊號，已審核快照繼續保護三種版面。 |
| 31 | <code>dashboard and navigation at 768px</code> | 改寫完成 | 切換成控制項與實際工具卡就緒訊號，已審核快照繼續保護三種版面。 |

</details>

## 裁決合計

| 裁決 | 原始案例數 |
| --- | ---: |
| 保留 | 1027 |
| 改寫完成 | 79 |
| 合併完成 | 20 |
| 已移作量測 | 3 |
