import { Button } from '../../../shared/ui';
import { CheckCircle2, Globe, HelpCircle, Loader2, Save } from 'lucide-react';
export default function YtmusicPreferences({
  selectedRegion,
  handleRegionChange,
  REGION_PRESETS,
  customLanguage,
  customLocation,
  selectedPreset,
  handlePresetChange,
  PRESET_OPTIONS,
  savingPrefs,
  setCustomLanguage,
  setCustomLocation,
  handleSavePreferences,
}) {
  return (
    <div className="glass-panel card-padding settings-card card-stack">
      <div className="ytmusic-settings-card-header">
        <div>
          <h2 className="settings-heading ytmusic-settings-card-title">
            <Globe size={20} aria-hidden="true" /> 歌名與藝人顯示地區／語言偏好
          </h2>
          <p className="section-desc ytmusic-settings-card-description">
            設定 YouTube Music 讀取與排序時的在地化語言與國家/地區（預設為台灣繁體中文）。系統將固定使用此設定向 Google
            請求對應語系的曲目與藝人名稱。
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
        <Button
          variant="primary"
          size="sm"
          type="button"
          className="btn btn-primary btn-sm ytmusic-settings-inline-button"
          onClick={() => handleSavePreferences()}
          disabled={savingPrefs}
        >
          {savingPrefs ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          儲存偏好設定
        </Button>
      </div>
    </div>
  );
}
