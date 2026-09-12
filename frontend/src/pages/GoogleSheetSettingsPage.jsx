import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Key, RefreshCw, Save, Unlink, XCircle } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import SourceLinkInput from '../components/SourceLinkInput';
import { saveOAuthReturnPath } from '../utils/authReturnPath';

export function initialGoogleSheetForm(defaultSpreadsheetId) {
  return { default_spreadsheet_id: defaultSpreadsheetId || '' };
}

function sameGoogleSheetForm(left, right) {
  return left?.default_spreadsheet_id === right?.default_spreadsheet_id;
}

export default function GoogleSheetSettingsPage({ sysSettings = {}, refreshSettings, authUser, refreshAuthUser }) {
  const toast = useToast();
  const location = useLocation();
  const [formData, setFormData] = useState(() => initialGoogleSheetForm(sysSettings.default_spreadsheet_id));
  const latestFormRef = useRef(formData);
  const mountedRef = useRef(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [msg, setMsg] = useState(null);
  const saveTimerRef = useRef(null);
  const saveChainRef = useRef(Promise.resolve());
  const pendingSaveRef = useRef(null);
  const queueSaveRef = useRef(null);
  const editVersionRef = useRef(0);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) {
      const nextData = initialGoogleSheetForm(sysSettings.default_spreadsheet_id);
      latestFormRef.current = nextData;
      setFormData(nextData);
    }
  }, [sysSettings.default_spreadsheet_id]);

  const queueSave = (nextData, { notify = false } = {}) => {
    const version = editVersionRef.current;
    const pendingSave = { version, data: nextData, promise: null };
    pendingSaveRef.current = pendingSave;
    const request = saveChainRef.current.catch(() => undefined).then(async () => {
      if (version !== editVersionRef.current) return;
      if (mountedRef.current) {
        setSaving(true);
        setMsg(null);
      }
      try {
        await api.updateSharedSettings(nextData);
        if (version !== editVersionRef.current) return;
        dirtyRef.current = false;
        if (!mountedRef.current) return;
        await refreshSettings?.();
        if (version !== editVersionRef.current || !mountedRef.current) return;
        setMsg({ type: 'success', text: '目前帳號的 Google Sheet 設定已自動儲存。' });
        if (notify) toast.success('設定已儲存');
      } catch (error) {
        if (version !== editVersionRef.current || !mountedRef.current) return;
        setMsg({ type: 'error', text: error.message || '伺服器儲存失敗，請稍後重試。' });
        if (notify) toast.error(`儲存失敗：${error.message || '未知錯誤'}`);
      } finally {
        if (version === editVersionRef.current && mountedRef.current) setSaving(false);
      }
    });
    pendingSave.promise = request;
    pendingSaveRef.current = pendingSave;
    saveChainRef.current = request;
    request.then(
      () => { if (pendingSaveRef.current === pendingSave) pendingSaveRef.current = null; },
      () => { if (pendingSaveRef.current === pendingSave) pendingSaveRef.current = null; },
    );
    return request;
  };
  queueSaveRef.current = queueSave;

  const scheduleSave = (nextData) => {
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      queueSave(nextData);
    }, 500);
  };

  const handleChange = (value) => {
    const nextData = { ...latestFormRef.current, default_spreadsheet_id: value };
    editVersionRef.current += 1;
    latestFormRef.current = nextData;
    dirtyRef.current = true;
    setFormData(nextData);
    scheduleSave(nextData);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    await queueSave(latestFormRef.current, { notify: true });
  };

  useEffect(() => () => {
    mountedRef.current = false;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    if (!dirtyRef.current) return;

    const latestData = latestFormRef.current;
    const pendingSave = pendingSaveRef.current;
    const hasPendingLatestSave = pendingSave
      && pendingSave.version === editVersionRef.current
      && sameGoogleSheetForm(pendingSave.data, latestData);
    if (!hasPendingLatestSave) queueSaveRef.current?.(latestData);
  }, []);

  const handleConnectSheets = async () => {
    setConnecting(true);
    try {
      saveOAuthReturnPath('sheets', `${location.pathname}${location.search}`);
      const res = await api.getSheetsAuthUrl();
      if (res?.auth_url) {
        window.location.href = res.auth_url;
      } else {
        toast.error('無法取得 Google 試算表授權網址。');
        setConnecting(false);
      }
    } catch (error) {
      toast.error(`取得 Google 試算表授權網址失敗：${error.message}`);
      setConnecting(false);
    }
  };

  const handleConfirmDisconnectSheets = async () => {
    setConfirmDisconnect(false);
    try {
      await api.disconnectSheets();
      await refreshAuthUser?.();
      toast.success('已解除 Google 試算表授權');
    } catch (error) {
      toast.error(`解除試算表授權失敗：${error.message}`);
    }
  };

  const sheetsAuth = authUser?.authorizations?.sheets;
  const isSheetsConnected = Boolean(sheetsAuth?.connected || authUser?.google_scopes?.sheets_readonly);

  return (
    <div className="settings-page-section">
      {msg && <div className="info-banner">{msg.type === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}{msg.text}</div>}
      
      {/* Google Sheets Authorization Status Card */}
      <div className="glass-panel card-padding settings-card card-stack">
        <div className="card-header">
          <div className="card-header-title">
            <FileSpreadsheet size={20} color="var(--primary)" />
            <h2>Google 試算表授權狀態</h2>
          </div>
          {isSheetsConnected ? (
            <span className="badge badge-connected"><CheckCircle2 size={14} /> 已授權 Google 試算表</span>
          ) : (
            <span className="badge badge-disconnected"><XCircle size={14} /> 尚未授權 Google 試算表</span>
          )}
        </div>
        {isSheetsConnected ? (
          <div>
            <p className="section-desc">已取得 Google 試算表唯讀權限，系統可讀取試算表工作表清單、名單與欄位對照資料。{sheetsAuth?.user?.email && `（授權帳號：${sheetsAuth.user.email}）`}</p>
            <div className="page-actions settings-card-actions">
              <button className="btn btn-secondary" type="button" onClick={handleConnectSheets} disabled={connecting}>
                <RefreshCw size={16} /> 重新授權 Google 試算表
              </button>
              <button className="btn btn-danger" type="button" onClick={() => setConfirmDisconnect(true)}>
                <Unlink size={16} /> 解除試算表授權
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="info-banner warning-banner">
              <AlertCircle size={18} />
              <span>目前尚未連結 Google 試算表。請點擊下方按鈕授權，以啟用試算表資料讀取功能。</span>
            </div>
            <div className="page-actions settings-card-actions">
              <button className="btn btn-primary" type="button" onClick={handleConnectSheets} disabled={connecting}>
                <Key size={16} /> 連結 Google 試算表
              </button>
            </div>
          </div>
        )}
      </div>

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 className="settings-heading"><FileSpreadsheet size={20} color="var(--accent)" /> 帳號預設 Google Sheet</h2>
            <p className="section-desc">這是目前帳號未指定其他來源時的預設值，供 Sheet 內容複製與 YouTube 工作流使用；修改後會自動儲存。</p>
          </div>
          {saving && (
            <span className="badge badge-info"><RefreshCw size={12} className="spin" /> 自動儲存中...</span>
          )}
          {!saving && msg?.type === 'success' && (
            <span className="badge badge-connected"><CheckCircle2 size={12} /> 已自動儲存</span>
          )}
          {!saving && msg?.type === 'error' && (
            <span className="badge badge-disconnected"><XCircle size={12} /> 自動儲存失敗</span>
          )}
        </div>
        <div className="form-group">
          <label className="form-label"><FileSpreadsheet size={14} /> 預設 Google Sheet 網址或 Spreadsheet ID</label>
          <SourceLinkInput value={formData.default_spreadsheet_id} onChange={(event) => handleChange(event.target.value)} sourceType="spreadsheet" />
          <p className="section-desc">修改後會自動儲存至目前登入的 Google 帳號；換瀏覽器或重新登入仍可取回。</p>
        </div>
        <div className="page-actions settings-page-actions"><button className="btn btn-success" type="submit" disabled={saving}><Save size={18} /> {saving ? '儲存中...' : '立即儲存帳號設定'}</button></div>
      </form>
    </div>
  );
}
