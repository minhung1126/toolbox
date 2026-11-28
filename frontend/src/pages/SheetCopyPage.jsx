import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clipboard, FileSpreadsheet, RotateCcw, Search, Trash2 } from 'lucide-react';
import { sheetsCopyApi } from '../features/sheets/api/sheetsCopyApi';
import SheetDataSourcePanel from '../components/SheetDataSourcePanel';
import TeamPersonFilterPanel from '../components/TeamPersonFilterPanel';
import useTeamPersonFilter from '../hooks/useTeamPersonFilter';
import useAccountWorkState from '../hooks/useAccountWorkState';
import useSharedTeamPersonFilterPersistence from '../hooks/useSharedTeamPersonFilterPersistence';
import { readSharedTeamPersonFilter } from '../utils/teamPersonFilterStorage';
import { personKey } from '../features/sheets/model/personOptions';
import { buildClipboardSelection } from '../features/sheets/model/clipboardSelection';
import { copyToClipboard } from '../utils/clipboard';
import '../features/sheets/sheets.css';

export default function SheetCopyPage({ sysSettings, onSharedFilterSaved }) {
  const {
    ready: workStateReady,
    value: savedState,
    error: workStateError,
    saving: workStateSaving,
    saved: workStateSaved,
    save: saveWorkState,
  } = useAccountWorkState('sheet_copy', {});
  const saved = savedState && typeof savedState === 'object' ? savedState : {};
  const sheetCopyAutosaveStatus = workStateSaving
    ? 'saving'
    : workStateSaved
      ? 'saved'
      : workStateError
        ? 'error'
        : null;
  const sharedFilter = useMemo(
    () => readSharedTeamPersonFilter(sysSettings.shared_team_person_filter),
    [sysSettings.shared_team_person_filter]
  );
  const initialSpreadsheetId = saved.spreadsheetId || sysSettings.default_spreadsheet_id || '';
  const [spreadsheetId, setSpreadsheetId] = useState(initialSpreadsheetId);
  const [appliedSpreadsheetId, setAppliedSpreadsheetId] = useState(initialSpreadsheetId);
  const [sourceReady, setSourceReady] = useState(false);
  const [sourceRevision, setSourceRevision] = useState(0);
  const [worksheets, setWorksheets] = useState([]);
  const [worksheetName, setWorksheetName] = useState(saved.worksheetName || '');
  const [columns, setColumns] = useState([]);
  const [visibleKeys, setVisibleKeys] = useState(Array.isArray(saved.visibleKeys) ? saved.visibleKeys : []);
  const [rows, setRows] = useState([]);
  const [dismissedRowNumbers, setDismissedRowNumbers] = useState([]);
  const [query, setQuery] = useState(saved.query || '');
  const [autoCollapse, setAutoCollapse] = useState(saved.autoCollapse === true);
  const [loading, setLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [sharedFilterSaveError, setSharedFilterSaveError] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState(new Set());
  const [copyFormat, setCopyFormat] = useState('tsv');
  const [copiedCell, setCopiedCell] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const initialLoadRequestedRef = useRef(false);
  const worksheetRequestRef = useRef(0);
  const workStateHydratedRef = useRef(false);
  const localWorkStateEditedRef = useRef(false);
  const lastPersistedWorkStateRef = useRef(null);

  const sourceStale = spreadsheetId.trim() !== appliedSpreadsheetId.trim();
  const teamPersonFilter = useTeamPersonFilter({
    source: appliedSpreadsheetId,
    worksheetName,
    enabled: sourceReady,
    initialTeam: sharedFilter.team,
    initialTeams: sharedFilter.teams,
    initialQuery: sharedFilter.query,
    initialSelectedPeople: sharedFilter.selectedPeople,
    refreshKey: sourceRevision,
  });
  const {
    teams,
    selectedTeams,
    setSelectedTeams,
    query: personQuery,
    setQuery: setPersonQuery,
    people,
    selectedPeople,
    setSelectedPeople,
    loadingTeams,
    loadingPeople,
    ready: teamPersonReady,
    error: teamPersonError,
  } = teamPersonFilter;

  const filterPersistenceReady = sourceReady && (!worksheetName || (teamPersonReady && !loadingPeople));

  useSharedTeamPersonFilterPersistence({
    // Keep the legacy team as a migration anchor for remembered video assignments.
    team: sharedFilter.team,
    teams: selectedTeams,
    query: personQuery,
    selectedPeople,
    ready: filterPersistenceReady,
    initialSavedFilter: sharedFilter,
    onSaved: onSharedFilterSaved,
    onError: setSharedFilterSaveError,
  });

  const serializedWorkState = useMemo(
    () =>
      JSON.stringify({
        spreadsheetId,
        worksheetName,
        visibleKeys,
        query,
        autoCollapse,
      }),
    [autoCollapse, query, spreadsheetId, visibleKeys, worksheetName]
  );

  useEffect(() => {
    if (!workStateReady) return;
    if (!workStateHydratedRef.current) {
      workStateHydratedRef.current = true;
      if (!localWorkStateEditedRef.current) {
        const nextSpreadsheetId = saved.spreadsheetId || sysSettings.default_spreadsheet_id || '';
        const nextWorksheetName = saved.worksheetName || '';
        const nextVisibleKeys = Array.isArray(saved.visibleKeys) ? saved.visibleKeys : [];
        const nextQuery = saved.query || '';
        const nextAutoCollapse = saved.autoCollapse === true;
        const hydratedSnapshot = {
          spreadsheetId: nextSpreadsheetId,
          worksheetName: nextWorksheetName,
          visibleKeys: nextVisibleKeys,
          query: nextQuery,
          autoCollapse: nextAutoCollapse,
        };
        lastPersistedWorkStateRef.current = JSON.stringify(hydratedSnapshot);
        if (nextSpreadsheetId !== spreadsheetId) setSpreadsheetId(nextSpreadsheetId);
        if (nextSpreadsheetId !== appliedSpreadsheetId) setAppliedSpreadsheetId(nextSpreadsheetId);
        if (nextWorksheetName !== worksheetName) setWorksheetName(nextWorksheetName);
        if (JSON.stringify(nextVisibleKeys) !== JSON.stringify(visibleKeys)) setVisibleKeys(nextVisibleKeys);
        if (nextQuery !== query) setQuery(nextQuery);
        if (nextAutoCollapse !== autoCollapse) setAutoCollapse(nextAutoCollapse);
        return;
      }
      lastPersistedWorkStateRef.current = '';
    }
    if (lastPersistedWorkStateRef.current === serializedWorkState) return;
    lastPersistedWorkStateRef.current = serializedWorkState;
    saveWorkState({
      spreadsheetId,
      worksheetName,
      visibleKeys,
      query,
      autoCollapse,
    });
  }, [
    appliedSpreadsheetId,
    autoCollapse,
    query,
    saveWorkState,
    saved.autoCollapse,
    saved.query,
    saved.spreadsheetId,
    saved.visibleKeys,
    saved.worksheetName,
    serializedWorkState,
    spreadsheetId,
    sysSettings.default_spreadsheet_id,
    visibleKeys,
    workStateReady,
    worksheetName,
  ]);

  useEffect(() => {
    if (!copiedCell) return undefined;
    const timer = window.setTimeout(() => setCopiedCell(''), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedCell]);

  const loadWorksheet = useCallback(
    async (name, source) => {
      if (!name || !source) return;
      const requestId = worksheetRequestRef.current + 1;
      worksheetRequestRef.current = requestId;
      setWorksheetName(name);
      setRows([]);
      setSelectedCells(new Set());
      setDismissedRowNumbers([]);
      setColumns([]);
      setSourceError('');
      try {
        const table = await sheetsCopyApi.getCopyableSheetTable(source, name);
        if (worksheetRequestRef.current !== requestId) return;
        const nextColumns = table.columns || [];
        const retained = visibleKeys.filter((key) => nextColumns.some((column) => column.key === key));
        setColumns(nextColumns);
        setVisibleKeys(retained.length ? retained : nextColumns.map((column) => column.key));
        setRows(table.rows || []);
      } catch (err) {
        if (worksheetRequestRef.current === requestId) setSourceError(`讀取工作表內容失敗：${err.message}`);
      }
    },
    [visibleKeys]
  );

  const refresh = useCallback(async () => {
    const nextSource = spreadsheetId.trim();
    if (!nextSource) {
      setSourceError('請先輸入主要試算表 ID 或網址');
      return;
    }
    setLoading(true);
    setSourceError('');
    setDismissedRowNumbers([]);
    try {
      const metadata = await sheetsCopyApi.getSpreadsheetMetadata(nextSource);
      const nextWorksheets = metadata.worksheets || [];
      const nextName = nextWorksheets.some((sheet) => sheet.title === worksheetName)
        ? worksheetName
        : nextWorksheets[0]?.title || '';
      setAppliedSpreadsheetId(nextSource);
      setWorksheets(nextWorksheets);
      setSourceReady(true);
      setSourceRevision((current) => current + 1);
      if (nextName) await loadWorksheet(nextName, nextSource);
      else {
        setWorksheetName('');
        setColumns([]);
        setRows([]);
        setVisibleKeys([]);
      }
    } catch (err) {
      setSourceError(`刷新試算表失敗：${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [loadWorksheet, spreadsheetId, worksheetName]);

  useEffect(() => {
    if (workStateReady && spreadsheetId && !initialLoadRequestedRef.current) {
      initialLoadRequestedRef.current = true;
      refresh();
    }
  }, [refresh, spreadsheetId, workStateReady]);

  const handleSpreadsheetChange = (event) => {
    localWorkStateEditedRef.current = true;
    const nextValue = event.target.value;
    setSpreadsheetId(nextValue);
    if (nextValue.trim() !== appliedSpreadsheetId.trim()) {
      setSourceError('');
      setDismissedRowNumbers([]);
    }
  };

  const handleWorksheetChange = (nextWorksheet) => {
    localWorkStateEditedRef.current = true;
    if (nextWorksheet) loadWorksheet(nextWorksheet, appliedSpreadsheetId);
  };

  const visibleColumns = columns.filter((column) => visibleKeys.includes(column.key));
  const keyword = query.trim().toLocaleLowerCase('zh-TW');
  const displayDisabled = sourceStale || !sourceReady || loading;
  const candidateRows = sourceStale
    ? []
    : rows.filter((row) => {
        const matchesPeople =
          !selectedPeople.length ||
          selectedPeople.includes(
            personKey({ team: row.team, person: row.person || '', kind: row.person ? 'person' : 'team' })
          );
        const matchesQuery =
          !keyword ||
          visibleColumns.some((column) =>
            String(row.cells[column.index] ?? '')
              .toLocaleLowerCase('zh-TW')
              .includes(keyword)
          );
        return matchesPeople && matchesQuery;
      });
  const filteredRows = candidateRows.filter((row) => !dismissedRowNumbers.includes(row.row_number));

  const handleDismissRow = (rowNumber) => {
    setDismissedRowNumbers((current) => (current.includes(rowNumber) ? current : [...current, rowNumber]));
    setCopyStatus(`已隱藏第 ${rowNumber} 列`);
  };

  const handleRestoreRows = () => {
    setDismissedRowNumbers([]);
    setCopyStatus('已復原顯示所有列');
  };

  const toggleCells = (ids) =>
    setSelectedCells((current) => {
      const next = new Set(current);
      const remove = ids.every((id) => current.has(id));
      ids.forEach((id) => (remove ? next.delete(id) : next.add(id)));
      return next;
    });
  const selection = buildClipboardSelection(filteredRows, visibleColumns, selectedCells, copyFormat);
  const copySelection = async () => {
    try {
      await copyToClipboard(selection.text);
      setCopyStatus(`已複製 ${selection.rowCount} 列已選內容到剪貼簿`);
    } catch (err) {
      setCopyStatus(`複製失敗：${err.message}`);
    }
  };
  const handleCopy = async (row, column) => {
    if (selectionMode) {
      toggleCells([`${row.row_number}:${column.key}`]);
      return;
    }
    try {
      await copyToClipboard(String(row.cells[column.index] ?? ''));
      setCopiedCell(`${row.row_number}:${column.key}`);
      setCopyStatus(`已複製第 ${row.row_number} 列「${column.label}」`);
    } catch (err) {
      setCopyStatus(`複製失敗：${err.message}`);
    }
  };

  const allCandidateRowsHidden = candidateRows.length > 0 && filteredRows.length === 0;
  const emptyMessage = sourceStale
    ? '資料來源已修改，請先按刷新套用。'
    : allCandidateRowsHidden
      ? '所有符合條件的列皆已暫時移除。'
      : '目前篩選條件沒有資料。';

  return (
    <div className="section-gap sheet-copy-page">
      <header className="page-header">
        <h1 className="sheet-copy-title">
          <FileSpreadsheet size={28} /> 試算表內容複製
        </h1>
        <p className="section-desc">
          唯讀試算表，複製到剪貼簿，不會寫回 Google
          Sheet。先選擇來源、跨團體人物及欄位；所有篩選與顯示選項會即時記住，點擊任一儲存格即可原樣複製，包含換行。
        </p>
        <div className="sheet-copy-page-options">
          <label className="sheet-copy-auto-collapse" htmlFor="sheet-copy-auto-collapse">
            <input
              id="sheet-copy-auto-collapse"
              type="checkbox"
              checked={autoCollapse}
              onChange={(event) => {
                localWorkStateEditedRef.current = true;
                setAutoCollapse(event.target.checked);
              }}
            />
            <span>自動折疊內容格子</span>
          </label>
          <span className="sheet-copy-page-option-hint">勾選後每格只顯示一行，點擊仍會複製完整內容。</span>
        </div>
      </header>

      <SheetDataSourcePanel
        spreadsheetId={spreadsheetId}
        onSpreadsheetIdChange={handleSpreadsheetChange}
        worksheets={worksheets}
        worksheetName={worksheetName}
        onWorksheetChange={handleWorksheetChange}
        onRefresh={refresh}
        loading={loading}
        sourceReady={sourceReady}
        stale={sourceStale}
        error={sourceError}
        autosaveStatus={sheetCopyAutosaveStatus}
      />

      <TeamPersonFilterPanel
        teams={sourceStale ? [] : teams}
        selectedTeams={selectedTeams}
        onTeamsChange={setSelectedTeams}
        query={personQuery}
        onQueryChange={setPersonQuery}
        people={sourceStale ? [] : people}
        selectedPeople={selectedPeople}
        onSelectedPeopleChange={setSelectedPeople}
        loadingTeams={loadingTeams}
        loadingPeople={loadingPeople}
        error={teamPersonError}
        disabled={sourceStale || !sourceReady}
        description="可跨團體選取人物；未選人物時顯示全部資料。搜尋與團體篩選只改變人物清單。"
      />
      {workStateError && (
        <div className="filter-panel-status filter-panel-status-error" role="alert">
          工作狀態同步失敗：{workStateError}
        </div>
      )}
      {sharedFilterSaveError && (
        <div className="filter-panel-status filter-panel-status-error" role="alert">
          {sharedFilterSaveError}
        </div>
      )}

      <section className="glass-panel card-padding sheet-copy-display-panel">
        <div className="filter-panel-header">
          <div className="filter-panel-heading-group">
            <strong>
              <Search size={17} aria-hidden="true" />
              顯示內容
            </strong>
            <p>搜尋目前顯示欄位，並選擇要保留在資料表中的欄位。</p>
          </div>
        </div>
        <div className="sheet-copy-display-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="sheet-copy-query">
              <Search size={14} />
              搜尋表格內容
            </label>
            <input
              id="sheet-copy-query"
              className="form-input"
              value={query}
              onChange={(event) => {
                localWorkStateEditedRef.current = true;
                setQuery(event.target.value);
              }}
              placeholder="搜尋表格內容"
              disabled={displayDisabled}
            />
          </div>
          <div className="sheet-copy-columns">
            <div className="sheet-copy-columns-head">
              <strong>
                顯示欄位（{visibleKeys.length} / {columns.length}）
              </strong>
              <span>
                <button
                  type="button"
                  onClick={() => {
                    localWorkStateEditedRef.current = true;
                    setVisibleKeys(columns.map((column) => column.key));
                  }}
                  disabled={displayDisabled}
                >
                  全選
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localWorkStateEditedRef.current = true;
                    setVisibleKeys([]);
                  }}
                  disabled={displayDisabled}
                >
                  全不選
                </button>
              </span>
            </div>
            {!columns.length && <p className="filter-panel-status">請先刷新並選擇工作表。</p>}
            {!!columns.length && (
              <div className="sheet-copy-column-grid">
                {columns.map((column) => (
                  <label key={column.key} className={visibleKeys.includes(column.key) ? 'selected' : ''}>
                    <input
                      type="checkbox"
                      checked={visibleKeys.includes(column.key)}
                      disabled={displayDisabled}
                      onChange={() => {
                        localWorkStateEditedRef.current = true;
                        setVisibleKeys((current) =>
                          current.includes(column.key)
                            ? current.filter((key) => key !== column.key)
                            : [...current, column.key]
                        );
                      }}
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="glass-panel card-padding" aria-label="複製已選內容">
        <label>
          <input type="checkbox" checked={selectionMode} onChange={(event) => setSelectionMode(event.target.checked)} />
          選格模式（點格選取；關閉後點格即複製）
        </label>
        <label>
          分隔格式{' '}
          <select className="form-select" value={copyFormat} onChange={(event) => setCopyFormat(event.target.value)}>
            <option value="tsv">TSV（含換行的欄位加引號）</option>
            <option value="plain">純文字（每格一行）</option>
          </select>
        </label>
        <button className="btn btn-primary" disabled={displayDisabled || !selection.rowCount} onClick={copySelection}>
          複製已選內容
        </button>
        <button className="btn btn-secondary" onClick={() => setSelectedCells(new Set())}>
          清除選格
        </button>
        <p>
          依工作表列序與目前欄序輸出 {selection.rowCount} 列；欄序：{selection.columns.join(' → ')}
          。篩選外或隱藏的列不會複製。
        </p>
        <pre className="selection-preview" aria-label="貼上預覽">
          {selection.text}
        </pre>
      </section>
      <section className="glass-panel sheet-copy-panel">
        <header className="sheet-copy-panel-header">
          <div className="sheet-copy-panel-header-content">
            <div className="sheet-copy-panel-title-row">
              <strong className="sheet-copy-panel-count">{filteredRows.length} 列結果</strong>
              {dismissedRowNumbers.length > 0 && (
                <span className="sheet-copy-dismissed-badge">
                  （已隱藏 {dismissedRowNumbers.length} 列）
                  <button
                    type="button"
                    className="sheet-copy-restore-btn"
                    onClick={handleRestoreRows}
                    title="復原所有已隱藏的列"
                    aria-label="復原所有已隱藏的列"
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                    復原
                  </button>
                </span>
              )}
            </div>
            <small className="sheet-copy-panel-caption">
              {autoCollapse ? '內容格已折疊；' : ''}點擊儲存格即複製完整內容。
            </small>
          </div>
          <span className="sheet-copy-panel-copy-status" aria-live="polite">
            {copyStatus}
          </span>
        </header>
        {!visibleColumns.length ? (
          <div className="sheet-copy-empty">請至少勾選一個欄位。</div>
        ) : !filteredRows.length ? (
          <div className="sheet-copy-empty">
            <p>{emptyMessage}</p>
            {allCandidateRowsHidden && (
              <button
                type="button"
                className="sheet-copy-restore-btn sheet-copy-restore-all-btn"
                onClick={handleRestoreRows}
              >
                <RotateCcw size={13} aria-hidden="true" />
                復原顯示所有列
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="sheet-copy-scroll-hint" role="note">
              左右滑動查看完整欄位；列號固定在左側。
            </div>
            <div className="sheet-copy-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="row-number">列</th>
                    {visibleColumns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.row_number}>
                      <th className="row-number">
                        <div className="sheet-copy-row-header-content">
                          <input
                            type="checkbox"
                            aria-label={`選取第 ${row.row_number} 列`}
                            checked={visibleColumns.every((column) =>
                              selectedCells.has(`${row.row_number}:${column.key}`)
                            )}
                            onChange={() =>
                              toggleCells(visibleColumns.map((column) => `${row.row_number}:${column.key}`))
                            }
                          />
                          <span className="sheet-copy-row-index">{row.row_number}</span>
                          <button
                            type="button"
                            className="sheet-copy-row-remove-btn"
                            title={`隱藏第 ${row.row_number} 列`}
                            aria-label={`移除第 ${row.row_number} 列`}
                            onClick={() => handleDismissRow(row.row_number)}
                          >
                            <Trash2 size={13} aria-hidden="true" />
                          </button>
                        </div>
                      </th>
                      {visibleColumns.map((column) => {
                        const id = `${row.row_number}:${column.key}`;
                        const copied = copiedCell === id;
                        const value = String(row.cells[column.index] ?? '');
                        return (
                          <td key={column.key}>
                            <button
                              type="button"
                              className={`sheet-copy-cell${autoCollapse ? ' sheet-copy-cell-collapsed' : ''}${copied ? ' copied' : ''}`}
                              aria-pressed={selectionMode ? selectedCells.has(id) : undefined}
                              title={value || '（空白）'}
                              onClick={() => handleCopy(row, column)}
                            >
                              <span className={`sheet-copy-cell-content${autoCollapse ? ' is-collapsed' : ''}`}>
                                {value || <em>（空白）</em>}
                              </span>
                              <small>
                                {copied ? (
                                  <>
                                    <Check size={14} /> 已複製
                                  </>
                                ) : (
                                  <>
                                    <Clipboard size={14} />{' '}
                                    {selectionMode ? (selectedCells.has(id) ? '已選取' : '選取') : '複製'}
                                  </>
                                )}
                              </small>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
