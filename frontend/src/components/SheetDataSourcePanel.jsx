import React from 'react';
import { CheckCircle2, FileSpreadsheet, Key, RefreshCw, XCircle } from 'lucide-react';
import SourceLinkInput from './SourceLinkInput';
import { EmptyState, StatusMessage } from './StatusMessage';
import { sheetsSettingsApi } from '../features/sheets/api/sheetsSettingsApi';
import { saveOAuthReturnPath } from '../utils/authReturnPath';

export default function SheetDataSourcePanel({
  spreadsheetId,
  onSpreadsheetIdChange,
  worksheets = [],
  worksheetName = '',
  onWorksheetChange,
  onRefresh,
  loading = false,
  disabled = false,
  sourceReady = true,
  stale = false,
  error = '',
  autosaveStatus = null,
  children,
}) {
  const sourceDisabled = disabled || loading;
  const dependentDisabled = disabled || loading || stale || !sourceReady;
  const worksheetDisabled = dependentDisabled || !worksheets.length;
  const isScopeError = /google_sheets_scope_required|試算表權限不足|授權.*試算表/i.test(error);

  const handleAuthorizeSheets = async () => {
    try {
      saveOAuthReturnPath('sheets', window.location.pathname + window.location.search);
      const res = await sheetsSettingsApi.getAuthUrl();
      if (res?.auth_url) window.location.href = res.auth_url;
    } catch (err) {
      console.error('Failed to get sheets auth url:', err);
    }
  };

  return (
    <section className={`filter-panel${dependentDisabled ? ' filter-panel-disabled' : ''}`}>
      <div className="filter-panel-header">
        <div className="filter-panel-heading-group filter-panel-source-heading">
          <div>
            <strong>
              <FileSpreadsheet size={17} aria-hidden="true" />
              資料來源設定
            </strong>
            <p>先確認主要試算表並刷新工作表與欄位；修改來源後請再次按刷新套用。</p>
          </div>
          {autosaveStatus === 'saving' && (
            <span className="badge badge-info">
              <RefreshCw size={12} className="spin" /> 自動儲存中...
            </span>
          )}
          {autosaveStatus === 'saved' && (
            <span className="badge badge-connected">
              <CheckCircle2 size={12} /> 已自動儲存
            </span>
          )}
          {autosaveStatus === 'error' && (
            <span className="badge badge-disconnected">
              <XCircle size={12} /> 自動儲存失敗
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onRefresh}
          disabled={disabled || loading || !String(spreadsheetId || '').trim()}
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} aria-hidden="true" />
          {loading ? '刷新中…' : '刷新工作表與欄位'}
        </button>
      </div>
      <div className="filter-panel-grid">
        <div className="form-group">
          <label className="form-label" htmlFor="sheet-data-source">
            主要試算表 ID / URL
          </label>
          <SourceLinkInput
            id="sheet-data-source"
            value={spreadsheetId}
            onChange={onSpreadsheetIdChange}
            sourceType="spreadsheet"
            disabled={sourceDisabled}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="sheet-data-worksheet">
            使用的工作表
          </label>
          <select
            id="sheet-data-worksheet"
            className="form-select"
            value={worksheetName}
            onChange={(event) => onWorksheetChange(event.target.value)}
            disabled={worksheetDisabled}
          >
            {!worksheets.length && <option value={worksheetName}>{worksheetName || '請先刷新資料來源'}</option>}
            {worksheets.map((sheet) => (
              <option key={sheet.title} value={sheet.title}>
                {sheet.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      {children && (
        <fieldset className="filter-panel-children" disabled={dependentDisabled}>
          {children}
        </fieldset>
      )}
      {stale && (
        <StatusMessage tone="warning" title="資料來源需要刷新">
          請按「刷新工作表與欄位」套用後才能使用下游篩選。
        </StatusMessage>
      )}
      {!stale && !sourceReady && !loading && <EmptyState>請先刷新資料來源以載入工作表與欄位。</EmptyState>}
      {error && (
        <StatusMessage
          tone="error"
          status="failed"
          title="資料來源刷新失敗"
          action={
            isScopeError ? (
              <button type="button" className="btn btn-primary status-message-action" onClick={handleAuthorizeSheets}>
                <Key size={15} /> 授權 Google 試算表
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary status-message-action"
                onClick={onRefresh}
                disabled={sourceDisabled}
              >
                重試
              </button>
            )
          }
        >
          {error}
        </StatusMessage>
      )}
    </section>
  );
}
