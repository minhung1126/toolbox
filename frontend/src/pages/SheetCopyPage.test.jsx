import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SheetCopyPage from './SheetCopyPage';
import { api } from '../services/api';
import { AccountWorkStateProvider } from '../hooks/useAccountWorkState';

vi.mock('../services/api', () => ({
  api: {
    updateWorkState: vi.fn(),
    getSpreadsheetMetadata: vi.fn(),
    getCopyableSheetTable: vi.fn(),
  },
}));

vi.mock('../components/SheetDataSourcePanel', () => ({
  default: ({ onRefresh, onWorksheetChange }) => (
    <div data-testid="sheet-source">
      {onRefresh && <button type="button" onClick={onRefresh}>MockRefresh</button>}
      {onWorksheetChange && <button type="button" onClick={() => onWorksheetChange('工作表2')}>MockChangeSheet</button>}
    </div>
  ),
}));
vi.mock('../components/TeamPersonFilterPanel', () => ({ default: () => <div data-testid="team-person-filter" /> }));
vi.mock('../hooks/useTeamPersonFilter', () => ({
  default: () => ({
    teams: [],
    selectedTeam: '',
    setSelectedTeam: vi.fn(),
    people: [],
    selectedPeople: [],
    setSelectedPeople: vi.fn(),
    loadingTeams: false,
    loadingPeople: false,
    ready: false,
    error: '',
  }),
}));
vi.mock('../hooks/useSharedTeamPersonFilterPersistence', () => ({ default: () => ({}) }));

function renderPage(initialState) {
  return render(
    <AccountWorkStateProvider initialState={initialState}>
      <SheetCopyPage sysSettings={{ shared_team_person_filter: {} }} />
    </AccountWorkStateProvider>,
  );
}

describe('SheetCopyPage work-state persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    api.updateWorkState.mockResolvedValue({ state: {} });
  });

  afterEach(() => vi.useRealTimers());

  it('restores the last display option and saves a changed option once', async () => {
    renderPage({ sheet_copy: { autoCollapse: true, query: 'last search' } });

    const autoCollapse = screen.getByLabelText('自動折疊內容格子');
    expect(autoCollapse).toBeChecked();
    expect(screen.getByLabelText('內容搜尋')).toHaveValue('last search');

    fireEvent.click(autoCollapse);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450);
    });

    expect(api.updateWorkState).toHaveBeenCalledTimes(1);
    expect(api.updateWorkState).toHaveBeenCalledWith('sheet_copy', {
      spreadsheetId: '',
      worksheetName: '',
      visibleKeys: [],
      query: 'last search',
      autoCollapse: false,
    });
  });
});

describe('SheetCopyPage row dismissal and restoration', () => {
  const mockTable = {
    columns: [
      { key: 'title', label: '影片標題', index: 0 },
      { key: 'desc', label: '影片說明', index: 1 },
    ],
    rows: [
      { row_number: 2, team: '', person_option: '', cells: ['標題 A', '說明 A'] },
      { row_number: 3, team: '', person_option: '', cells: ['標題 B', '說明 B'] },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    api.updateWorkState.mockResolvedValue({ state: {} });
    api.getSpreadsheetMetadata.mockResolvedValue({
      worksheets: [{ title: '工作表1' }],
    });
    api.getCopyableSheetTable.mockResolvedValue(mockTable);
  });

  it('allows dismissing individual rows and restoring all dismissed rows', async () => {
    renderPage({
      sheet_copy: {
        spreadsheetId: 'sheet-123',
        worksheetName: '工作表1',
        visibleKeys: ['title', 'desc'],
      },
    });

    expect(await screen.findByText('2 列結果')).toBeInTheDocument();
    expect(screen.getByText('標題 A')).toBeInTheDocument();
    expect(screen.getByText('標題 B')).toBeInTheDocument();

    const removeRow2Btn = screen.getByRole('button', { name: '移除第 2 列' });
    fireEvent.click(removeRow2Btn);

    expect(screen.getByText('1 列結果')).toBeInTheDocument();
    expect(screen.getByText('（已隱藏 1 列）')).toBeInTheDocument();
    expect(screen.queryByText('標題 A')).not.toBeInTheDocument();
    expect(screen.getByText('標題 B')).toBeInTheDocument();

    const restoreBtn = screen.getByRole('button', { name: '復原所有已隱藏的列' });
    fireEvent.click(restoreBtn);

    expect(screen.getByText('2 列結果')).toBeInTheDocument();
    expect(screen.queryByText('（已隱藏 1 列）')).not.toBeInTheDocument();
    expect(screen.getByText('標題 A')).toBeInTheDocument();
    expect(screen.getByText('標題 B')).toBeInTheDocument();
  });

  it('shows empty state with restore button when all candidate rows are dismissed', async () => {
    renderPage({
      sheet_copy: {
        spreadsheetId: 'sheet-123',
        worksheetName: '工作表1',
        visibleKeys: ['title', 'desc'],
      },
    });

    expect(await screen.findByText('2 列結果')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '移除第 2 列' }));
    fireEvent.click(screen.getByRole('button', { name: '移除第 3 列' }));

    expect(screen.getByText('0 列結果')).toBeInTheDocument();
    expect(screen.getByText('所有符合條件的列皆已暫時移除。')).toBeInTheDocument();

    const restoreAllBtn = screen.getByRole('button', { name: '復原顯示所有列' });
    fireEvent.click(restoreAllBtn);

    expect(screen.getByText('2 列結果')).toBeInTheDocument();
    expect(screen.getByText('標題 A')).toBeInTheDocument();
    expect(screen.getByText('標題 B')).toBeInTheDocument();
  });

  it('resets dismissed rows when switching worksheet', async () => {
    renderPage({
      sheet_copy: {
        spreadsheetId: 'sheet-123',
        worksheetName: '工作表1',
        visibleKeys: ['title', 'desc'],
      },
    });

    expect(await screen.findByText('2 列結果')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '移除第 2 列' }));
    expect(screen.getByText('1 列結果')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'MockChangeSheet' }));
    expect(await screen.findByText('2 列結果')).toBeInTheDocument();
    expect(screen.getByText('標題 A')).toBeInTheDocument();
    expect(screen.queryByText('（已隱藏 1 列）')).not.toBeInTheDocument();
  });
});

