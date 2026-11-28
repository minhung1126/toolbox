import { useEffect, useRef, useState } from 'react';
import { api } from '../../../services/api';
import type { DraftPublishRequest } from '../api/draftPublishApi';
import { parsePublishOperation, type PublishOperation } from '../api/draftPublishOperation';

export interface OperationReference {
  version: 1;
  operation_id?: string;
  request_id?: string;
  revision?: number;
}
export function useDraftPublishOperation({
  pending,
  reference,
  enabled,
  onOperation,
}: {
  pending?: DraftPublishRequest;
  reference?: OperationReference;
  enabled: boolean;
  onOperation: (operation: PublishOperation) => void;
}) {
  const [operation, setOperation] = useState<PublishOperation | null>(null);
  const [pollError, setPollError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const callback = useRef(onOperation);
  callback.current = onOperation;
  const latestRevision = useRef(0);
  const inFlight = useRef(false);
  const hasPending = Boolean(pending);
  const operationId = reference?.operation_id;
  const requestId = pending?.request_id;
  const stageId = pending?.stage_snapshot.stage_id;
  useEffect(() => {
    if (!pending) {
      setPollError('');
      return;
    }
    if (!enabled) return;
    let cancelled = false,
      timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    latestRevision.current = reference?.revision || 0;
    let failures = 0;
    async function poll() {
      if (cancelled) return;
      if (inFlight.current) {
        timer = setTimeout(poll, 100);
        return;
      }
      inFlight.current = true;
      let delay = 1000,
        terminal = false;
      try {
        const value = operationId
          ? await api.getOperation(operationId, { signal: controller.signal })
          : requestId
            ? await api.findYoutubePublishJob(requestId, { signal: controller.signal })
            : await api.findYoutubePublishStage(stageId!, { signal: controller.signal });
        if (cancelled) return;
        const next = parsePublishOperation(value, pending!, operationId);
        if (next.progress.revision >= latestRevision.current) {
          latestRevision.current = next.progress.revision;
          setOperation(next);
          setPollError('');
          callback.current(next);
        }
        terminal = !['prepared', 'running'].includes(next.state);
        failures = 0;
      } catch (caughtError: unknown) {
        if (cancelled) return;
        const error = caughtError as { status?: number; retryAfter?: number; message?: string };
        failures += 1;
        delay = Math.max([2000, 5000, 10000][Math.min(failures - 1, 2)], Number(error.retryAfter || 0) * 1000);
        setPollError(
          error.status === 404
            ? '受理結果待確認，請稍後重新查詢；保留原請求 ID。'
            : `進度更新暫停：${error.message} 將重新查詢，既有成果仍保留。`
        );
      } finally {
        inFlight.current = false;
      }
      if (!cancelled && !terminal) timer = setTimeout(poll, delay);
    }
    void poll();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
    // A reference revision update does not restart polling or overlap a read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPending, operationId, requestId, stageId, enabled, refreshKey]);
  return { operation, pollError, refresh: () => setRefreshKey((value) => value + 1) };
}
