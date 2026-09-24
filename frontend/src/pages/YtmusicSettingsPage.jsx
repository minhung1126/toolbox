import React, { useEffect, useState } from 'react';
import '../features/ytmusic/ytmusic-settings.css';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpDown,
  CheckCircle2,
  Code2,
  Disc3,
  ExternalLink,
  Globe,
  HelpCircle,
  Info,
  Key,
  ListMusic,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ytmusicSettingsApi } from '../features/ytmusic/api/ytmusicSettingsApi';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import ServiceAuthCard from '../components/ServiceAuthCard';
import { useOAuthConnect } from '../hooks/useOAuthConnect';
import useAccountWorkState from '../hooks/useAccountWorkState';
import { PATHS } from '../routes/paths';
import { formatTokenDate, tokenStatusLabel } from '../utils/formatters';

export const REGION_PRESETS = [
  {
    id: 'TW',
    label: '台灣（繁體中文）',
    badge: '預設',
    language: 'zh_TW',
    location: 'TW',
    description: '顯示台灣在地化中文歌名與藝人名稱（例如：五月天、周興哲、小男孩樂團）',
  },
  {
    id: 'US',
    label: '英文 (English)',
    badge: 'US',
    language: 'en',
    location: 'US',
    description: '顯示英文歌名與羅馬拼音藝人名稱（例如：Mayday、Eric Chou）',
  },
  {
    id: 'KR',
    label: '韓文 (한국어)',
    badge: 'KR',
    language: 'ko',
    location: 'KR',
    description: '顯示韓文在地化藝人與歌曲名稱',
  },
  {
    id: 'JP',
    label: '日文 (日本語)',
    badge: 'JP',
    language: 'ja',
    location: 'JP',
    description: '顯示日文在地化藝人與歌曲名稱',
  },
  {
    id: 'custom',
    label: '其他（自訂地區與語言代碼）',
    badge: '自訂',
    language: '',
    location: '',
    description: '自訂 YouTube Music Innertube API 與備援管道的語言代碼與地區縮寫',
  },
];

const PRESET_OPTIONS = [
  { value: 'album-order', label: '經典完整專輯（藝人 → 年份 → 專輯 → 曲目 #）' },
  { value: 'artist-album-track', label: '藝人專輯曲目（藝人 → 專輯 → 曲目 #）' },
  { value: 'title-asc', label: '歌名 A → Z' },
  { value: 'title-desc', label: '歌名 Z → A' },
  { value: 'artist-asc', label: '頻道／藝人 A → Z' },
  { value: 'artist-desc', label: '頻道／藝人 Z → A' },
  { value: 'added-newest', label: '新增日期（新 → 舊）' },
  { value: 'added-oldest', label: '新增日期（舊 → 新）' },
  { value: 'published-newest', label: '發布日期（新 → 舊）' },
  { value: 'published-oldest', label: '發布日期（舊 → 新）' },
  { value: 'duration-shortest', label: '長度（短 → 長）' },
  { value: 'duration-longest', label: '長度（長 → 短）' },
  { value: 'random', label: '隨機排序' },
];

const DEFAULT_PREFERENCES = Object.freeze({
  defaultPreset: 'title-asc',
  regionPreset: 'TW',
  language: 'zh_TW',
  location: 'TW',
  customLanguage: '',
  customLocation: '',
});

export default function YtmusicSettingsPage({ authUser, refreshAuthUser }) {
  const toast = useToast();
  const ytmusicAuth = authUser?.authorizations?.ytmusic;
  const isYtmusicConnected = Boolean(ytmusicAuth?.connected);
  const hasCustomToken = Boolean(ytmusicAuth?.has_custom_token);
  const activeYoutubeConnected = Boolean(authUser?.youtube?.slots?.primary?.authenticated);

  const ytmusicOAuth = useOAuthConnect({
    serviceName: 'ytmusic',
    getAuthUrl: ytmusicSettingsApi.getAuthUrl,
    disconnect: ytmusicSettingsApi.disconnect,
    onAfterDisconnect: refreshAuthUser,
    serviceLabel: 'YouTube Music 授權',
    successMessage: '已解除 YouTube Music 授權',
  });

  const { value: preferences, save: savePreferences } = useAccountWorkState('ytmusic_preferences', DEFAULT_PREFERENCES);

  const [selectedPreset, setSelectedPreset] = useState(() => preferences?.defaultPreset || 'title-asc');
  const [selectedRegion, setSelectedRegion] = useState(() => preferences?.regionPreset || 'TW');
  const [customLanguage, setCustomLanguage] = useState(() => preferences?.customLanguage || '');
  const [customLocation, setCustomLocation] = useState(() => preferences?.customLocation || '');
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [customTokenInput, setCustomTokenInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [validatingToken, setValidatingToken] = useState(false);
  const [tokenValidationResult, setTokenValidationResult] = useState(null);
  const [showClearTokenConfirm, setShowClearTokenConfirm] = useState(false);
  const [showTokenUpdateForm, setShowTokenUpdateForm] = useState(false);

  useEffect(() => {
    if (preferences?.defaultPreset) {
      setSelectedPreset(preferences.defaultPreset);
    }
    if (preferences?.regionPreset) {
      setSelectedRegion(preferences.regionPreset);
    }
    if (preferences?.customLanguage !== undefined) {
      setCustomLanguage(preferences.customLanguage);
    }
    if (preferences?.customLocation !== undefined) {
      setCustomLocation(preferences.customLocation);
    }
  }, [preferences?.defaultPreset, preferences?.regionPreset, preferences?.customLanguage, preferences?.customLocation]);

  const handleSavePreferences = async (overrideParams = {}) => {
    const reg = overrideParams.regionPreset !== undefined ? overrideParams.regionPreset : selectedRegion;
    const preset = overrideParams.defaultPreset !== undefined ? overrideParams.defaultPreset : selectedPreset;
    const cLang = overrideParams.customLanguage !== undefined ? overrideParams.customLanguage : customLanguage;
    const cLoc = overrideParams.customLocation !== undefined ? overrideParams.customLocation : customLocation;

    let lang = 'zh_TW';
    let loc = 'TW';

    if (reg === 'TW') {
      lang = 'zh_TW';
      loc = 'TW';
    } else if (reg === 'US') {
      lang = 'en';
      loc = 'US';
    } else if (reg === 'KR') {
      lang = 'ko';
      loc = 'KR';
    } else if (reg === 'JP') {
      lang = 'ja';
      loc = 'JP';
    } else if (reg === 'custom') {
      lang = cLang.trim() || 'zh_TW';
      loc = cLoc.trim().toUpperCase() || 'TW';
    }

    setSavingPrefs(true);
    try {
      await savePreferences({
        ...preferences,
        defaultPreset: preset,
        regionPreset: reg,
        language: lang,
        location: loc,
        customLanguage: cLang.trim(),
        customLocation: cLoc.trim().toUpperCase(),
      });
      toast.success('YouTube Music 偏好設定已成功儲存！');
    } catch (err) {
      toast.error(`儲存偏好設定失敗：${err.message || '未知錯誤'}`);
    } finally {
      setSavingPrefs(false);
    }
  };

  const handlePresetChange = (e) => {
    const nextPreset = e.target.value;
    setSelectedPreset(nextPreset);
    handleSavePreferences({ defaultPreset: nextPreset });
  };

  const handleRegionChange = (e) => {
    const nextRegion = e.target.value;
    setSelectedRegion(nextRegion);
    if (nextRegion !== 'custom') {
      handleSavePreferences({ regionPreset: nextRegion });
    }
  };

  const handleValidateCustomToken = async (tokenToTest = null) => {
    setValidatingToken(true);
    setTokenValidationResult(null);
    try {
      const res = await ytmusicSettingsApi.validate(tokenToTest);
      setTokenValidationResult({
        valid: true,
        message: res.message || 'Token 驗證成功，可正常讀取 YouTube Music 音樂庫與播放清單。',
        account_name: res.account_name,
        channel_handle: res.channel_handle,
        account_photo_url: res.account_photo_url,
      });
      toast.success(res.message || 'YouTube Music Token 驗證成功！');
    } catch (err) {
      const errMsg = err.message || 'Token 驗證失敗或 Cookie 已過期';
      setTokenValidationResult({
        valid: false,
        message: errMsg,
      });
      toast.error(`Token 驗證失敗：${errMsg}`);
    } finally {
      setValidatingToken(false);
    }
  };

  const handleSaveCustomToken = async () => {
    const trimmed = customTokenInput.trim();
    if (!trimmed) {
      toast.warning('請輸入 Cookie 或 Request Headers 內容');
      return;
    }
    setSavingToken(true);
    try {
      await ytmusicSettingsApi.save(trimmed);
      toast.success('YouTube Music 自訂 Token 已成功儲存！');
      setCustomTokenInput('');
      setTokenValidationResult(null);
      await refreshAuthUser?.();
    } catch (err) {
      toast.error(`儲存 Token 失敗：${err.message || '格式不正確'}`);
    } finally {
      setSavingToken(false);
    }
  };

  const handleClearCustomToken = async () => {
    setShowClearTokenConfirm(false);
    setSavingToken(true);
    try {
      await ytmusicSettingsApi.clear();
      toast.success('已清除 YouTube Music 自訂 Token');
      setTokenValidationResult(null);
      await refreshAuthUser?.();
    } catch (err) {
      toast.error(`清除 Token 失敗：${err.message || '未知錯誤'}`);
    } finally {
      setSavingToken(false);
    }
  };

  return (
    <div className="section-gap settings-page-section">
      <header className="page-header">
        <div className="badge badge-info dashboard-eyebrow">
          <Sparkles size={14} /> YouTube Music
        </div>
        <h1 className="ytmusic-settings-page-title">
          <Disc3 size={28} className="ytmusic-settings-title-icon" /> YouTube Music 設定
        </h1>
        <p className="section-desc">管理 YouTube Music 專屬帳號授權、瀏覽器 Token 憑證與播放清單多重排序預設偏好。</p>
      </header>

      {/* 1. YouTube Music Authorization Status Card */}
      <ServiceAuthCard
        icon={Disc3}
        title="YouTube Music 帳號授權狀態"
        connected={isYtmusicConnected}
        connectedBadgeText={hasCustomToken ? '自訂 Token 連線中' : '專屬帳號已授權'}
        disconnectedBadgeText={activeYoutubeConnected ? '共用 YouTube 授權中' : '尚未授權'}
        description="存取個人 YouTube Music 播放清單與音樂庫，完全獨立於 YouTube 創作者品牌頻道。更新操作採用 YouTube Music 協定，不消耗 YouTube Data API 配額（0 Credit）。"
        accountEmail={
          ytmusicAuth?.user?.email ||
          (hasCustomToken
            ? '已設定自訂瀏覽器 Token'
            : activeYoutubeConnected
              ? `${authUser?.youtube?.slots?.primary?.channel_title}（共用頻道）`
              : undefined)
        }
        accountEmailPrefix={isYtmusicConnected ? (hasCustomToken ? '憑證模式：' : '專屬音樂帳號：') : '目前共用來源：'}
        warningText={
          activeYoutubeConnected && !hasCustomToken
            ? '目前沿用主要 YouTube 頻道授權。若要管理個人日常生活聆聽的 YouTube Music 專屬歌單，建議點擊下方連結個人音樂 Google 帳號或填入瀏覽器 Token。'
            : !isYtmusicConnected
              ? '尚未連結 YouTube 或 YouTube Music 帳號。請先完成授權以使用播放清單排序與音樂庫功能。'
              : undefined
        }
        connecting={ytmusicOAuth.connecting}
        onConnect={ytmusicOAuth.handleConnect}
        onDisconnect={() => ytmusicOAuth.setConfirmDisconnect(true)}
        connectText="連結 YouTube Music 專屬帳號"
        reconnectText="重新授權 YouTube Music"
        disconnectText="解除專屬授權"
      />

      {/* 2. Custom Browser Token / Cookie Setup Card */}
      <div className="glass-panel card-padding settings-card card-stack">
        <div className="ytmusic-settings-card-header">
          <div>
            <h2 className="settings-heading ytmusic-settings-card-title">
              <Key size={20} aria-hidden="true" /> 自訂 YouTube Music 瀏覽器 Token／Cookie
            </h2>
            <p className="section-desc ytmusic-settings-card-description">
              支援直接貼上來自 music.youtube.com 的 <strong>Copy as fetch</strong>、<strong>Copy as cURL</strong>
              、Request Headers 或 Cookie。使用 Token 排序可讀取完整專輯與曲目序號且{' '}
              <strong>消耗 0 Google API 配額</strong>。
            </p>
          </div>
          {hasCustomToken && (
            <span className="badge badge-connected">
              <CheckCircle2 size={12} /> 自訂 Token 已啟用 (0 Quota 模式)
            </span>
          )}
        </div>

        {tokenValidationResult && (
          <div
            data-testid="token-validation-result"
            className={`ytmusic-token-validation${tokenValidationResult.valid ? ' ytmusic-token-validation-success' : ' ytmusic-token-validation-error'}`}
          >
            <div className="ytmusic-token-validation-summary">
              {tokenValidationResult.valid ? (
                <CheckCircle2 size={20} className="ytmusic-token-validation-icon" aria-hidden="true" />
              ) : (
                <AlertCircle size={20} className="ytmusic-token-validation-icon" aria-hidden="true" />
              )}
              <div>
                <div className="ytmusic-token-validation-title">
                  {tokenValidationResult.valid ? 'Token 驗證成功' : 'Token 驗證失敗'}
                </div>
                <div className="ytmusic-token-validation-message">{tokenValidationResult.message}</div>
                {tokenValidationResult.account_name && (
                  <div className="ytmusic-token-validation-account">
                    認證帳號：<strong>{tokenValidationResult.account_name}</strong>
                    {tokenValidationResult.channel_handle && ` (${tokenValidationResult.channel_handle})`}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm ytmusic-token-validation-close"
              onClick={() => setTokenValidationResult(null)}
            >
              關閉
            </button>
          </div>
        )}

        {hasCustomToken && (
          <div className="ytmusic-token-active-panel">
            <div>
              <strong className="ytmusic-token-active-title">
                <CheckCircle2 size={16} /> 已啟用自訂瀏覽器 Token
              </strong>
              <p className="ytmusic-token-active-description">
                系統將優先使用此 Token 進行 YouTube Music 播放清單與曲目操作。若 Cookie 逾期失效，可隨時重新貼上更新。
              </p>
            </div>
            <div className="ytmusic-token-active-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm ytmusic-settings-inline-button"
                onClick={() => handleValidateCustomToken()}
                disabled={validatingToken || savingToken}
              >
                {validatingToken ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
                檢查目前 Token 有效性
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowTokenUpdateForm(!showTokenUpdateForm)}
              >
                {showTokenUpdateForm ? '收合教學與輸入框' : '更換 / 重新設定 Token'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm ytmusic-settings-inline-button ytmusic-token-clear-button"
                onClick={() => setShowClearTokenConfirm(true)}
                disabled={savingToken || validatingToken}
              >
                <Trash2 size={14} /> 清除自訂 Token
              </button>
            </div>
          </div>
        )}

        {(!hasCustomToken || showTokenUpdateForm) && (
          <div className="ytmusic-token-setup">
            {/* Step-by-Step DevTools Guide */}
            <div className="ytmusic-token-guide">
              <div className="ytmusic-token-guide-header">
                <div className="ytmusic-token-guide-title">
                  <HelpCircle size={18} />
                  <span>開發者工具 (F12) 快速獲取教學</span>
                </div>
                <span className="badge badge-info ytmusic-token-guide-badge">
                  <Code2 size={12} /> 最推薦 Copy as cURL
                </span>
              </div>

              <div className="ytmusic-token-guide-steps">
                <div className="ytmusic-token-guide-step">
                  <span className="ytmusic-token-guide-step-number">1</span>
                  <div>
                    <strong>開啟 YouTube Music 並登入</strong>：在瀏覽器分頁中打開{' '}
                    <a
                      href="https://music.youtube.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ytmusic-token-guide-link"
                    >
                      music.youtube.com <ExternalLink size={12} />
                    </a>
                    ，確認右上角已登入個人 Google 帳號。
                  </div>
                </div>

                <div className="ytmusic-token-guide-step">
                  <span className="ytmusic-token-guide-step-number">2</span>
                  <div>
                    <strong>開啟開發者工具 (DevTools)</strong>：在 YouTube Music 頁面上按下鍵盤{' '}
                    <kbd className="ytmusic-token-guide-key">F12</kbd>
                    （或在網頁任意處按右鍵選擇「檢查 / Inspect」），上方切換至 <strong>Network (網路)</strong> 標籤頁。
                  </div>
                </div>

                <div className="ytmusic-token-guide-step">
                  <span className="ytmusic-token-guide-step-number">3</span>
                  <div>
                    <strong>觸發任一網路請求</strong>：在 YouTube Music 頁面上隨意點選任一歌單、歌曲或「媒體庫 /
                    Library」，Network 面板便會出現請求列表（可在上方篩選框輸入 <code>browse</code> 快速過濾定位）。
                  </div>
                </div>

                <div className="ytmusic-token-guide-step">
                  <span className="ytmusic-token-guide-step-number">4</span>
                  <div className="ytmusic-token-guide-step-content">
                    <strong>右鍵直接複製（支援以下任一種方式，推薦方式一或方式二）：</strong>
                    <div className="ytmusic-token-guide-methods">
                      <div className="ytmusic-token-guide-method ytmusic-token-guide-method-recommended">
                        <div className="ytmusic-token-guide-method-title">
                          ⭐ 方式一（最簡單・最推薦）：Copy as Node.js fetch
                        </div>
                        <div className="ytmusic-token-guide-method-description">
                          在請求（如 <code>browse</code>）上點擊右鍵 ➔ <strong>Copy (複製)</strong> ➔{' '}
                          <strong>Copy as Node.js fetch</strong>，整段貼入下方即可！Node.js 版會完整附帶 Cookie
                          與所有認證。
                        </div>
                      </div>

                      <div className="ytmusic-token-guide-method ytmusic-token-guide-method-alternative">
                        <div className="ytmusic-token-guide-method-title">⭐ 方式二：Copy as cURL (cmd 或 bash)</div>
                        <div className="ytmusic-token-guide-method-description">
                          在請求上點擊右鍵 ➔ <strong>Copy</strong> ➔ <strong>Copy as cURL (cmd)</strong> 或{' '}
                          <strong>Copy as cURL (bash)</strong>，整段貼入即可（系統已支援 Windows <code>^</code> 轉義與{' '}
                          <code>-b</code> 標籤）。
                        </div>
                      </div>

                      <div className="ytmusic-token-guide-method">
                        <div className="ytmusic-token-guide-method-title">
                          方式三：手動複製 Request Headers 或 Cookie
                        </div>
                        <div className="ytmusic-token-guide-method-description">
                          點選該請求 ➔ 右側切換至 <strong>Headers (標頭)</strong> ➔ 滾動至{' '}
                          <strong>Request Headers</strong> ➔ 複製整段 Request Headers 或 <code>Cookie:</code> 欄位的值。
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="ytmusic-token-guide-warning">
                <Info size={16} className="ytmusic-token-guide-warning-icon" aria-hidden="true" />
                <div>
                  <strong>⚠️ 為什麼不能用普通的「Copy as fetch」？</strong>
                  <br />
                  Chrome／Edge 的「Copy as fetch」是專門給瀏覽器內部 JavaScript 執行的，根據 W3C 瀏覽器安全規範會
                  <strong>刻意移除 Cookie 標頭</strong>（改為 <code>{'credentials: "include"'}</code>
                  ）。後端伺服器缺少登入 Cookie 就無法識別身分。
                  <br />
                  因此<strong>請務必選擇【Copy as cURL】</strong>，即可一鍵完整複製 Cookie 與認證！
                </div>
              </div>
            </div>

            {/* Input Form */}
            <div className="form-group ytmusic-token-form-group">
              <label className="form-label ytmusic-token-input-label" htmlFor="ytmusic-custom-token-input">
                <span>貼上 Token 代碼、cURL、Node.js fetch 或 Cookie</span>
                <span className="ytmusic-token-input-hint">支援 cURL / Node.js fetch / Headers / Cookie</span>
              </label>
              <textarea
                id="ytmusic-custom-token-input"
                className="form-input ytmusic-token-input"
                rows={4}
                placeholder="直接貼上右鍵『Copy as cURL (bash/cmd)』、『Copy as Node.js fetch』、Request Headers 或 Cookie 字串..."
                value={customTokenInput}
                onChange={(e) => setCustomTokenInput(e.target.value)}
                disabled={savingToken || validatingToken}
              />
            </div>
            <div className="ytmusic-token-form-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm ytmusic-settings-inline-button"
                onClick={handleSaveCustomToken}
                disabled={savingToken || validatingToken || !customTokenInput.trim()}
              >
                {savingToken ? <Loader2 size={14} className="spin" /> : <Key size={14} />}
                儲存自訂 Token
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm ytmusic-settings-inline-button"
                onClick={() => handleValidateCustomToken(customTokenInput.trim())}
                disabled={savingToken || validatingToken || !customTokenInput.trim()}
              >
                {validatingToken ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
                檢查此 Token 是否有效
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Token Status Grid if connected via OAuth */}
      {isYtmusicConnected && ytmusicAuth && !hasCustomToken && (
        <div className="glass-panel card-padding settings-card">
          <h3 className="ytmusic-settings-section-title">
            <RefreshCw size={16} className="ytmusic-settings-section-icon" aria-hidden="true" /> 憑證健康狀態
          </h3>
          <div className="settings-grid">
            <div className="glass-panel settings-info-card">
              <strong>Token 狀態</strong>
              <p>{tokenStatusLabel(ytmusicAuth.token_status)}</p>
            </div>
            <div className="glass-panel settings-info-card">
              <strong>最近重新整理</strong>
              <p>{formatTokenDate(ytmusicAuth.last_refreshed_at)}</p>
            </div>
            <div className="glass-panel settings-info-card">
              <strong>目前 Token 到期時間</strong>
              <p>{formatTokenDate(ytmusicAuth.token_expires_at)}</p>
            </div>
          </div>
          {ytmusicAuth.last_refresh_error && (
            <div className="info-banner ytmusic-token-refresh-warning">
              <span>Token 最近更新未成功；請點擊上方「重新授權」以更新憑證。</span>
            </div>
          )}
        </div>
      )}

      {/* 4. YouTube Music Default Preferences */}
      <div className="glass-panel card-padding settings-card card-stack">
        <div className="ytmusic-settings-card-header">
          <div>
            <h2 className="settings-heading ytmusic-settings-card-title">
              <Globe size={20} aria-hidden="true" /> 歌名與藝人顯示地區／語言偏好
            </h2>
            <p className="section-desc ytmusic-settings-card-description">
              設定 YouTube Music 讀取與排序時的在地化語言與國家/地區（預設為台灣繁體中文）。系統將固定使用此設定向
              Google 請求對應語系的曲目與藝人名稱。
            </p>
          </div>
          <span className="badge badge-connected">
            <CheckCircle2 size={12} /> 自動儲存
          </span>
        </div>

        {/* Region & Language Selector */}
        <div className="form-group ytmusic-region-field">
          <label className="form-label" htmlFor="ytmusic-region-preset">
            顯示地區與語言偏好
          </label>
          <select
            id="ytmusic-region-preset"
            className="form-select ytmusic-settings-select"
            value={selectedRegion}
            onChange={handleRegionChange}
          >
            {REGION_PRESETS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label} {opt.badge ? `[${opt.badge}]` : ''}
              </option>
            ))}
          </select>
          <div className="ytmusic-region-description">
            {REGION_PRESETS.find((p) => p.id === selectedRegion)?.description}
          </div>
        </div>

        {/* Custom Inputs if "custom" is selected */}
        {selectedRegion === 'custom' && (
          <div className="ytmusic-custom-region">
            <div className="ytmusic-custom-region-title">自訂語言代碼與地區縮寫</div>
            <div className="ytmusic-custom-region-grid">
              <div className="form-group ytmusic-custom-region-field">
                <label className="form-label" htmlFor="ytmusic-custom-language">
                  語言代碼 (Language)
                </label>
                <input
                  id="ytmusic-custom-language"
                  type="text"
                  className="form-input ytmusic-custom-region-input"
                  placeholder="例如：zh_TW, zh_CN, fr, de, es, it"
                  value={customLanguage}
                  onChange={(e) => setCustomLanguage(e.target.value)}
                />
              </div>
              <div className="form-group ytmusic-custom-region-field">
                <label className="form-label" htmlFor="ytmusic-custom-location">
                  地區縮寫 (Location / Country)
                </label>
                <input
                  id="ytmusic-custom-location"
                  type="text"
                  className="form-input ytmusic-custom-region-input"
                  placeholder="例如：TW, US, JP, KR, HK, GB, DE"
                  value={customLocation}
                  onChange={(e) => setCustomLocation(e.target.value.toUpperCase())}
                />
              </div>
            </div>
          </div>
        )}

        {/* Standard Reference Info Banner */}
        <div className="ytmusic-code-reference">
          <div className="ytmusic-code-reference-row">
            <HelpCircle size={16} className="ytmusic-code-reference-icon" />
            <div>
              <strong className="ytmusic-code-reference-title">代碼標準參考指南：</strong>
              <ul className="ytmusic-code-reference-list">
                <li>
                  <strong>地區縮寫標準</strong>：請參考 <strong>ISO 3166-1 alpha-2</strong>{' '}
                  雙字母國家/地區標準代碼（例如：台灣 <code>TW</code>、美國 <code>US</code>、日本 <code>JP</code>、韓國{' '}
                  <code>KR</code>、香港 <code>HK</code>、英國 <code>GB</code>、德國 <code>DE</code> 等）。
                </li>
                <li>
                  <strong>語言代碼標準</strong>：請參考 <strong>ISO 639-1</strong> / YouTube Music
                  支援語系代碼（例如：繁體中文 <code>zh_TW</code>、簡體中文 <code>zh_CN</code>、英文 <code>en</code>
                  、日文 <code>ja</code>、韓文 <code>ko</code>、法文 <code>fr</code>、德文 <code>de</code>、西班牙文{' '}
                  <code>es</code> 等）。
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Default Sort Preset */}
        <div className="form-group ytmusic-preset-field">
          <label className="form-label" htmlFor="ytmusic-default-preset">
            預設排序規則
          </label>
          <select
            id="ytmusic-default-preset"
            className="form-select ytmusic-settings-select"
            value={selectedPreset}
            onChange={handlePresetChange}
          >
            {PRESET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Explicit Save Button */}
        <div className="ytmusic-preferences-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm ytmusic-settings-inline-button"
            onClick={() => handleSavePreferences()}
            disabled={savingPrefs}
          >
            {savingPrefs ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            儲存偏好設定
          </button>
        </div>
      </div>

      {/* 5. Quick Navigation Card */}
      <div className="glass-panel card-padding settings-card ytmusic-quick-nav">
        <div>
          <h3 className="ytmusic-quick-nav-title">
            <ListMusic size={18} className="ytmusic-quick-nav-icon" /> 播放清單智慧排序
          </h3>
          <p className="section-desc ytmusic-quick-nav-description">
            讀取您的 YouTube Music 播放清單，以藝人、專輯、曲目第幾首等多重規則排序，零配額消耗更新。
          </p>
        </div>
        <Link className="btn btn-primary" to={PATHS.ytmusicPlaylistSort}>
          <ArrowUpDown size={16} /> 進入播放清單排序 <ArrowRight size={16} />
        </Link>
      </div>

      <ConfirmDialog
        open={ytmusicOAuth.confirmDisconnect}
        title="解除 YouTube Music 授權"
        message="確定要解除 YouTube Music 專屬授權嗎？解除後各功能將無法讀取您的個人音樂歌單，直到重新授權為止。"
        confirmText="確認解除"
        cancelText="取消"
        variant="destructive"
        onConfirm={ytmusicOAuth.handleConfirmDisconnect}
        onCancel={() => ytmusicOAuth.setConfirmDisconnect(false)}
      />

      <ConfirmDialog
        open={showClearTokenConfirm}
        title="清除自訂 Token"
        message="確定要清除 YouTube Music 自訂 Token 嗎？清除後系統將回退使用 Google OAuth 授權連線。"
        confirmText="確認清除"
        cancelText="取消"
        variant="destructive"
        onConfirm={handleClearCustomToken}
        onCancel={() => setShowClearTokenConfirm(false)}
      />
    </div>
  );
}
