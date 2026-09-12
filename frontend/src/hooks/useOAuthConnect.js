import { useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { saveOAuthReturnPath } from '../utils/authReturnPath';

export function useOAuthConnect({
  serviceName,
  getAuthUrl,
  disconnect,
  onAfterDisconnect,
  serviceLabel = '授權',
  successMessage,
}) {
  const toast = useToast();
  const location = useLocation();
  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      saveOAuthReturnPath(serviceName, `${location.pathname}${location.search}`);
      const res = await getAuthUrl();
      if (res?.auth_url) {
        window.location.href = res.auth_url;
      } else {
        toast.error(`無法取得 ${serviceLabel} 網址。`);
        setConnecting(false);
      }
    } catch (error) {
      toast.error(`取得 ${serviceLabel} 網址失敗：${error.message}`);
      setConnecting(false);
    }
  }, [serviceName, location.pathname, location.search, getAuthUrl, serviceLabel, toast]);

  const handleConfirmDisconnect = useCallback(async () => {
    setConfirmDisconnect(false);
    try {
      await disconnect();
      await onAfterDisconnect?.();
      toast.success(successMessage || `已解除 ${serviceLabel}`);
    } catch (error) {
      toast.error(`解除 ${serviceLabel} 失敗：${error.message}`);
    }
  }, [disconnect, onAfterDisconnect, successMessage, serviceLabel, toast]);

  return {
    connecting,
    confirmDisconnect,
    setConfirmDisconnect,
    handleConnect,
    handleConfirmDisconnect,
  };
}

export default useOAuthConnect;
