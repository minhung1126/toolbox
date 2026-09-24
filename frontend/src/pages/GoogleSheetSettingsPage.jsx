import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, RefreshCw, Save, XCircle } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import SourceLinkInput from '../components/SourceLinkInput';
import ServiceAuthCard from '../components/ServiceAuthCard';
import { useDebouncedAutosave } from '../hooks/useDebouncedAutosave';
import { useOAuthConnect } from '../hooks/useOAuthConnect';
import '../features/settings/account-settings.css';

export function initialGoogleSheetForm(defaultSpreadsheetId) {
  return { default_spreadsheet_id: defaultSpreadsheetId || '' };
}

function sameGoogleSheetForm(left, right) {
  return left?.default_spreadsheet_id === right?.default_spreadsheet_id;
}

export default function GoogleSheetSettingsPage({ sysSettings = {}, refreshSettings, authUser, refreshAuthUser }) {
  const toast = useToast();
  const [formData, setFormData] = useState(() => initialGoogleSheetForm(sysSettings.default_spreadsheet_id));
  const [msg, setMsg] = useState(null);

  const {
    connecting,
    confirmDisconnect,
    setConfirmDisconnect,
    handleConnect: handleConnectSheets,
    handleConfirmDisconnect: handleConfirmDisconnectSheets,
  } = useOAuthConnect({
    serviceName: 'sheets',
    getAuthUrl: api.getSheetsAuthUrl,
    disconnect: api.disconnectSheets,
    onAfterDisconnect: refreshAuthUser,
    serviceLabel: 'Google 試算表授權',
  });

  const { saving, mutate, flush, reset, dirty } = useDebouncedAutosave({
    value: formData,
    delay: 500,
    compareFn: sameGoogleSheetForm,
    onSave: async (nextData) => {
      await api.updateSharedSettings(nextData);
    },
    onSuccess: async (nextData, { notify }) => {
      await refreshSettings?.();
      setMsg({ type: 'success', text: '目前帳號的 Google Sheet 設定已自動儲存。' });
      if (notify) toast.success('設定已儲存');
    },
    onError: (error, { notify }) => {
      setMsg({ type: 'error', text: error.message || '伺服器儲存失敗，請稍後重試。' });
      if (notify) toast.error(`儲存失敗：${error.message || '未知錯誤'}`);
    },
  });

  useEffect(() => {
    if (!dirty) {
      const nextData = initialGoogleSheetForm(sysSettings.default_spreadsheet_id);
      setFormData(nextData);
      reset(nextData);
    }
  }, [sysSettings.default_spreadsheet_id, dirty, reset]);

  const handleChange = (value) => {
    const nextData = { ...formData, default_spreadsheet_id: value };
    setMsg(null);
    setFormData(nextData);
    mutate(nextData);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    await flush({ notify: true });
  };

  const sheetsAuth = authUser?.authorizations?.sheets;
  const isSheetsConnected = Boolean(sheetsAuth?.connected || authUser?.google_scopes?.sheets_readonly);

  return (
    <div className="section-gap settings-page-section google-sheet-settings-page">
      <header className="page-header">
        <h1 className="google-sheet-settings-title">
          <FileSpreadsheet size={26} aria-hidden="true" /> Google 試算表設定
        </h1>
        <p className="section-desc">管理 Google 試算表存取授權與目前帳號預設試算表來源。</p>
      </header>
      {msg && (
        <div className="info-banner">
          {msg.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          {msg.text}
        </div>
      )}

      {/* Google Sheets Authorization Status Card */}
      <ServiceAuthCard
        icon={FileSpreadsheet}
        title="Google 試算表授權狀態"
        connected={isSheetsConnected}
        connectedBadgeText="已授權 Google 試算表"
        disconnectedBadgeText="尚未授權 Google 試算表"
        description="已取得 Google 試算表唯讀權限，系統可讀取試算表工作表清單、名單與欄位對照資料。"
        accountEmail={sheetsAuth?.user?.email}
        accountEmailPrefix="授權帳號："
        warningText="目前尚未連結 Google 試算表。請點擊下方按鈕授權，以啟用試算表資料讀取功能。"
        connecting={connecting}
        onConnect={handleConnectSheets}
        onDisconnect={() => setConfirmDisconnect(true)}
        connectText="連結 Google 試算表"
        reconnectText="重新授權 Google 試算表"
        disconnectText="解除試算表授權"
      />

      <ConfirmDialog
        open={confirmDisconnect}
        title="解除 Google 試算表授權"
        message="確定要解除 Google 試算表授權嗎？解除後各項功能將無法讀取工作表內容，直到重新授權為止。"
        confirmText="確認解除"
        cancelText="取消"
        variant="destructive"
        onConfirm={handleConfirmDisconnectSheets}
        onCancel={() => setConfirmDisconnect(false)}
      />

      <form className="glass-panel card-padding settings-card card-stack" onSubmit={handleSave}>
        <div className="google-sheet-default-header">
          <div>
            <h2 className="settings-heading">
              <FileSpreadsheet size={20} color="var(--accent)" /> 帳號預設 Google Sheet
            </h2>
            <p className="section-desc">
              這是目前帳號未指定其他來源時的預設值，供 Sheet 內容複製與 YouTube 工作流使用；修改後會自動儲存。
            </p>
          </div>
          {saving && (
            <span className="badge badge-info">
              <RefreshCw size={12} className="spin" /> 自動儲存中...
            </span>
          )}
          {!saving && msg?.type === 'success' && (
            <span className="badge badge-connected">
              <CheckCircle2 size={12} /> 已自動儲存
            </span>
          )}
          {!saving && msg?.type === 'error' && (
            <span className="badge badge-disconnected">
              <XCircle size={12} /> 自動儲存失敗
            </span>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">
            <FileSpreadsheet size={14} /> 預設 Google Sheet 網址或 Spreadsheet ID
          </label>
          <SourceLinkInput
            value={formData.default_spreadsheet_id}
            onChange={(event) => handleChange(event.target.value)}
            sourceType="spreadsheet"
          />
          <p className="section-desc">修改後會自動儲存至目前登入的 Google 帳號；換瀏覽器或重新登入仍可取回。</p>
        </div>
        <div className="page-actions settings-page-actions">
          <button className="btn btn-success" type="submit" disabled={saving}>
            <Save size={18} /> {saving ? '儲存中...' : '立即儲存帳號設定'}
          </button>
        </div>
      </form>
    </div>
  );
}
