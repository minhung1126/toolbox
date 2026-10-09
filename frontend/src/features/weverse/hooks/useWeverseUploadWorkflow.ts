import { useEffect, useRef, useState } from 'react';
import { weverseUploadApi } from '../api/weverseUploadApi';
import { useUploadPackage } from './useUploadPackage';
import { useUploadTasks } from './useUploadTasks';
import { uploadError } from '../model/taskState';
import type { UploadToast, UploadView } from '../model/taskState';
export { YOUTUBE_CATEGORIES, COMMON_BCP47_LANGS, formatBytes } from '../model/options';

export function useWeverseUploadWorkflow({
  isVideoAuthConnected,
  toast,
}: {
  isVideoAuthConnected: boolean;
  toast: UploadToast;
}) {
  const [viewStep, setViewStep] = useState<UploadView>('pick');
  const [uploadConfirmOpen, setUploadConfirmOpen] = useState(false);
  const [uploadStarting, setUploadStarting] = useState(false);
  const [uploadOutcomeUncertain, setUploadOutcomeUncertain] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const selection = useUploadPackage(toast, setViewStep);
  const tasks = useUploadTasks(toast, setViewStep);
  const { videoInfo, packageSource, selectedFolderFiles, metadata, subtitles } = selection;
  const { loadHistory } = tasks;
  // Quota calculation
  const enabledSubsCount = subtitles.filter((s) => s.enabled).length;
  const estimatedQuota = 1600 + enabledSubsCount * 400;

  // Execute Upload
  const handleStartUpload = async () => {
    setUploadConfirmOpen(false);

    if (uploadOutcomeUncertain || inFlight.current) return;

    if (!isVideoAuthConnected) {
      toast.error('請先完成專屬影片上傳 YouTube 頻道授權。');
      return;
    }

    if (!metadata.title.trim()) {
      toast.error('請輸入影片標題。');
      return;
    }

    if (!videoInfo || (packageSource !== 'path' && !selectedFolderFiles.videoFile)) return;
    inFlight.current = true;
    setUploadStarting(true);
    try {
      let res;
      if (packageSource === 'path') {
        const payload = {
          video_path: videoInfo.full_path || '',
          title: metadata.title.trim(),
          description: metadata.description.trim(),
          privacy_status: metadata.privacy_status,
          tags: metadata.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          category_id: metadata.category_id,
          default_language: metadata.default_language,
          subtitles: subtitles.map((s) => ({
            full_path: s.full_path,
            filename: s.filename,
            raw_lang: s.raw_lang,
            bcp47: s.bcp47,
            label: s.label,
            enabled: s.enabled,
          })),
        };
        res = await weverseUploadApi.uploadFromPath(payload);
      } else {
        // Upload from browser files
        const formData = new FormData();
        formData.append('video', selectedFolderFiles.videoFile!);

        selectedFolderFiles.subtitleFiles.forEach((file) => {
          formData.append('subtitles', file);
        });

        const metaPayload = {
          title: metadata.title.trim(),
          description: metadata.description.trim(),
          privacy_status: metadata.privacy_status,
          tags: metadata.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          category_id: metadata.category_id,
          default_language: metadata.default_language,
          subtitles: subtitles.map((s) => ({
            filename: s.filename,
            bcp47: s.bcp47,
            label: s.label,
            enabled: s.enabled,
          })),
        };
        formData.append('metadata', JSON.stringify(metaPayload));

        res = await weverseUploadApi.uploadFiles(formData);
      }

      if (!mounted.current) return;
      tasks.trackQueued(res.task_id, metadata.title.trim());
      toast.success('上傳任務已啟動！正在背景傳輸至 YouTube。');
    } catch (caught) {
      if (!mounted.current) return;
      const err = uploadError(caught);
      if (
        err?.code === 'weverse_upload_result_invalid' ||
        err?.code === 'timeout' ||
        err?.code === 'network_error' ||
        (err.status ?? 0) >= 500
      ) {
        setUploadOutcomeUncertain(true);
        loadHistory();
        toast.error('無法確認上傳任務是否已啟動；請先檢查上傳歷史及 YouTube Studio，勿直接重送。');
      } else {
        toast.error(`啟動上傳失敗：${err?.message || '未知錯誤'}`);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setUploadStarting(false);
    }
  };

  const handleReset = () => {
    if (inFlight.current) return;
    setUploadOutcomeUncertain(false);
    setViewStep('pick');
    selection.resetPackage();
    tasks.clearTask();
  };
  return {
    ...selection,
    ...tasks,
    viewStep,
    setViewStep,
    uploadConfirmOpen,
    setUploadConfirmOpen,
    uploadStarting,
    uploadOutcomeUncertain,
    enabledSubsCount,
    estimatedQuota,
    handleStartUpload,
    handleReset,
  };
}
