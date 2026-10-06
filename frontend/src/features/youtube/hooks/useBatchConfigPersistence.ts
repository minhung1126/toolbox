import { useCallback, useEffect, useRef } from 'react';
import type { FieldSetters } from '../../../shared/model/useWorkflowModel';
import type { BatchWorkflowState } from './useBatchWorkflowState';
import type { BatchWorkflowOptions, BatchConfig } from '../model/batchWorkflowTypes';
import { youtubeBatchApi, normalizeYoutubePlaylistInput } from '../api/youtubeBatchApi';
function workflowError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
interface Options {
  state: BatchWorkflowState;
  setters: FieldSetters<BatchWorkflowState>;
  authUser: BatchWorkflowOptions['authUser'];
  videoType: BatchWorkflowOptions['videoType'];
  toast: BatchWorkflowOptions['toast'];
}
export function useBatchConfigPersistence({ state, setters, authUser, videoType, toast }: Options) {
  const { spreadsheetId, worksheetName, titleColumn, descriptionColumn, playlistId } = state;
  const { setConfigSaveError, setDraftAutosaveStatus, setPlaylistAutosaveStatus, setConfigSaving } = setters;
  const draftSaveTimerRef = useRef<number | undefined>(undefined);
  const playlistSaveTimerRef = useRef<number | undefined>(undefined);
  const accountKey = `${authUser?.sub || authUser?.email || ''}:${videoType}`;
  const activeAccount = useRef(accountKey);
  activeAccount.current = accountKey;
  useEffect(() => {
    activeAccount.current = accountKey;
    return () => {
      if (activeAccount.current === accountKey) activeAccount.current = '';
      window.clearTimeout(draftSaveTimerRef.current);
      window.clearTimeout(playlistSaveTimerRef.current);
    };
  }, [accountKey]);
  const clearConfigSaveError = useCallback(() => {
    setConfigSaveError('');
  }, []);

  const scheduleDraftSave = useCallback(
    (overrides: Partial<BatchConfig> = {}) => {
      if (!authUser) return;
      const requestAccount = accountKey;
      setDraftAutosaveStatus('saving');
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = window.setTimeout(async () => {
        if (activeAccount.current !== requestAccount) return;
        try {
          const nextSpreadsheetId = overrides.spreadsheetId !== undefined ? overrides.spreadsheetId : spreadsheetId;
          const nextWorksheetName = overrides.worksheetName !== undefined ? overrides.worksheetName : worksheetName;
          const nextTitleColumn = overrides.titleColumn !== undefined ? overrides.titleColumn : titleColumn;
          const nextDescriptionColumn =
            overrides.descriptionColumn !== undefined ? overrides.descriptionColumn : descriptionColumn;
          const nextPlaylistId = overrides.playlistId !== undefined ? overrides.playlistId : playlistId;

          await youtubeBatchApi.updateDraftSettings(videoType, {
            spreadsheet_id: nextSpreadsheetId.trim(),
            worksheet_name: nextWorksheetName,
            title_column: nextTitleColumn,
            description_column: nextDescriptionColumn,
            playlist_id: nextPlaylistId.trim(),
          });
          if (activeAccount.current !== requestAccount) return;
          setDraftAutosaveStatus('saved');
        } catch (caughtError: unknown) {
          if (activeAccount.current !== requestAccount) return;
          const error = workflowError(caughtError);
          setDraftAutosaveStatus('error');
          setConfigSaveError(`草稿設定未能自動儲存：${error.message}`);
        }
      }, 800);
    },
    [accountKey, authUser, descriptionColumn, playlistId, spreadsheetId, titleColumn, videoType, worksheetName]
  );

  const schedulePlaylistSave = useCallback(
    (value: string) => {
      if (!authUser) return;
      const requestAccount = accountKey;
      setPlaylistAutosaveStatus('saving');
      window.clearTimeout(playlistSaveTimerRef.current);
      playlistSaveTimerRef.current = window.setTimeout(async () => {
        if (activeAccount.current !== requestAccount) return;
        try {
          const normalized = normalizeYoutubePlaylistInput(value);
          if (value.trim() && !normalized) {
            setPlaylistAutosaveStatus('invalid');
            return;
          }
          await youtubeBatchApi.updatePlaylist({ playlistId: normalized || '' });
          if (activeAccount.current !== requestAccount) return;
          setPlaylistAutosaveStatus('saved');
          scheduleDraftSave({ playlistId: value });
        } catch {
          if (activeAccount.current !== requestAccount) return;
          setPlaylistAutosaveStatus('error');
        }
      }, 800);
    },
    [accountKey, authUser, scheduleDraftSave]
  );

  const saveDraftConfig = useCallback(async () => {
    if (!authUser) return;
    window.clearTimeout(draftSaveTimerRef.current);
    const requestAccount = accountKey;
    setConfigSaving(true);
    setDraftAutosaveStatus('saving');
    setConfigSaveError('');
    try {
      await youtubeBatchApi.updateDraftSettings(videoType, {
        spreadsheet_id: spreadsheetId.trim(),
        worksheet_name: worksheetName,
        title_column: titleColumn,
        description_column: descriptionColumn,
        playlist_id: playlistId.trim(),
      });
      if (activeAccount.current !== requestAccount) return;
      setDraftAutosaveStatus('saved');
      toast.success('YouTube 草稿設定已儲存');
    } catch (caughtError: unknown) {
      if (activeAccount.current !== requestAccount) return;
      const error = workflowError(caughtError);
      setDraftAutosaveStatus('error');
      setConfigSaveError(`設定未能同步至伺服器：${error.message}`);
    } finally {
      if (activeAccount.current === requestAccount) setConfigSaving(false);
    }
  }, [
    accountKey,
    authUser,
    descriptionColumn,
    playlistId,
    spreadsheetId,
    titleColumn,
    toast,
    videoType,
    worksheetName,
  ]);

  return { clearConfigSaveError, scheduleDraftSave, schedulePlaylistSave, saveDraftConfig };
}
