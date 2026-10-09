import { useEffect, useState } from 'react';

import { isAmbiguousYtmusicSettingsMutation, ytmusicSettingsApi } from '../api/ytmusicSettingsApi';
import { useToast } from '../../../components/Toast';

import { useOAuthConnect } from '../../../hooks/useOAuthConnect';
import useAccountWorkState from '../../../hooks/useAccountWorkState';

import { DEFAULT_PREFERENCES } from '../model/preferences';
export function useYtmusicSettingsController({ authUser, refreshAuthUser }) {
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
  const [tokenMutationUncertain, setTokenMutationUncertain] = useState(false);
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
      const saved = await savePreferences(
        {
          ...preferences,
          defaultPreset: preset,
          regionPreset: reg,
          language: lang,
          location: loc,
          customLanguage: cLang.trim(),
          customLocation: cLoc.trim().toUpperCase(),
        },
        { debounceMs: 0 }
      );
      if (!saved) {
        toast.error('偏好設定尚未確認儲存，請檢查連線後重試。');
        return;
      }
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
      try {
        await refreshAuthUser?.();
      } catch {
        toast.warning('Token 已儲存，但授權狀態無法重新讀取；請重新整理頁面。');
      }
    } catch (err) {
      if (isAmbiguousYtmusicSettingsMutation(err)) {
        setTokenMutationUncertain(true);
        toast.error('無法確認 Token 是否已儲存；請先核對授權狀態，勿直接重送。');
        try {
          await refreshAuthUser?.();
          if (refreshAuthUser) setTokenMutationUncertain(false);
        } catch {
          // Keep the result uncertain when account status cannot be refreshed.
        }
      } else {
        toast.error(`儲存 Token 失敗：${err.message || '格式不正確'}`);
      }
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
      try {
        await refreshAuthUser?.();
      } catch {
        toast.warning('Token 已清除，但授權狀態無法重新讀取；請重新整理頁面。');
      }
    } catch (err) {
      if (isAmbiguousYtmusicSettingsMutation(err)) {
        setTokenMutationUncertain(true);
        toast.error('無法確認 Token 是否已清除；請先核對授權狀態，勿直接重送。');
        try {
          await refreshAuthUser?.();
          if (refreshAuthUser) setTokenMutationUncertain(false);
        } catch {
          // Keep the result uncertain when account status cannot be refreshed.
        }
      } else {
        toast.error(`清除 Token 失敗：${err.message || '未知錯誤'}`);
      }
    } finally {
      setSavingToken(false);
    }
  };

  return {
    isYtmusicConnected,
    hasCustomToken,
    activeYoutubeConnected,
    ytmusicAuth,
    ytmusicOAuth,
    tokenMutationUncertain,
    tokenValidationResult,
    validatingToken,
    savingToken,
    showTokenUpdateForm,
    customTokenInput,
    handleSaveCustomToken,
    setTokenValidationResult,
    handleValidateCustomToken,
    setShowTokenUpdateForm,
    setShowClearTokenConfirm,
    setCustomTokenInput,
    selectedRegion,
    handleRegionChange,
    customLanguage,
    customLocation,
    selectedPreset,
    handlePresetChange,
    savingPrefs,
    setCustomLanguage,
    setCustomLocation,
    handleSavePreferences,
    showClearTokenConfirm,
    handleClearCustomToken,
  };
}
