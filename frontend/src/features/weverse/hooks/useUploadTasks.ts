import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import { weverseUploadApi } from '../api/weverseUploadApi';
import type { WeverseUploadTask } from '../api/types';
import { isActiveTask, pendingCaptionCount, taskReducer, uploadError } from '../model/taskState';
import type { UploadToast, UploadView } from '../model/taskState';

export function useUploadTasks(toast: UploadToast, setViewStep: Dispatch<SetStateAction<UploadView>>) {
  const [state, dispatch] = useReducer(taskReducer, { task: null, error: '', loading: false });
  const [historyList, setHistoryList] = useState<WeverseUploadTask[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [params, setParams] = useSearchParams();
  const requestedId = params.get('task');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const generation = useRef(0);
  const historyVersion = useRef(0);
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const loadHistory = useCallback(async () => {
    const version = ++historyVersion.current;
    setHistoryLoading(true);
    try {
      const result = await weverseUploadApi.getHistory(10);
      if (version !== historyVersion.current) return;
      setHistoryList(result.tasks);
      setHistoryError('');
    } catch {
      if (version === historyVersion.current) setHistoryError('無法讀取上傳歷史，請重試。');
    } finally {
      if (version === historyVersion.current) setHistoryLoading(false);
    }
  }, []);
  useEffect(() => {
    loadHistory();
    return () => {
      historyVersion.current++;
    };
  }, [loadHistory]);
  const openTask = useCallback(
    (id: string) => {
      setRefreshVersion((value) => value + 1);
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set('task', id);
        return next;
      });
    },
    [setParams]
  );
  useEffect(() => {
    const version = ++generation.current;
    if (!requestedId) {
      dispatch({ type: 'clear' });
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    dispatch({ type: 'clear' });
    dispatch({ type: 'load' });
    const poll = async () => {
      try {
        const result = await weverseUploadApi.getTask(requestedId);
        if (version !== generation.current) return;
        failures = 0;
        dispatch({ type: 'task', task: result.task });
        setViewStep(result.task.status === 'completed' ? 'completed' : 'uploading');
        if (isActiveTask(result.task)) timer = setTimeout(poll, 2000);
        else {
          loadHistory();
          if (result.task.status === 'completed' && pendingCaptionCount(result.task))
            toastRef.current.warning?.('影片已上傳，但部分字幕仍待處理。');
        }
      } catch (caught) {
        if (version !== generation.current) return;
        const error = uploadError(caught);
        if (++failures >= 3 || error.status === 404 || error.code === 'weverse_task_invalid') {
          dispatch({ type: 'error', message: '無法確認任務狀態。請重新讀取歷史並核對 YouTube Studio，勿直接重送。' });
          loadHistory();
        } else timer = setTimeout(poll, 2000);
      }
    };
    poll();
    return () => {
      generation.current++;
      clearTimeout(timer);
    };
  }, [requestedId, refreshVersion, loadHistory, setViewStep]);
  const trackQueued = (id: string, title: string) => {
    dispatch({
      type: 'task',
      task: { task_id: id, title, status: 'pending', progress_percent: 0, current_step: '任務已排入佇列。' },
    });
    setViewStep('uploading');
    openTask(id);
    loadHistory();
  };
  const clearTask = () => {
    generation.current++;
    dispatch({ type: 'clear' });
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete('task');
        return next;
      },
      { replace: true }
    );
  };
  return {
    taskStatus: state.task,
    taskPollingError: state.error,
    taskLoading: state.loading,
    currentTaskId: requestedId,
    historyList,
    historyLoading,
    historyError,
    loadHistory,
    openTask,
    trackQueued,
    clearTask,
  };
}
