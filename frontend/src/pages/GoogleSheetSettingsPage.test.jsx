import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import GoogleSheetSettingsPage from './GoogleSheetSettingsPage';
import { sheetsSettingsApi } from '../features/sheets/api/sheetsSettingsApi';

vi.mock('../features/sheets/api/sheetsSettingsApi', () => ({
  sheetsSettingsApi: {
    getAuthUrl: vi.fn(),
    disconnect: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
}));

vi.mock('../components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

function renderPage(refreshSettings = vi.fn().mockResolvedValue({})) {
  return render(
    <MemoryRouter>
      <GoogleSheetSettingsPage
        sysSettings={{ default_spreadsheet_id: 'old-sheet' }}
        refreshSettings={refreshSettings}
      />
    </MemoryRouter>
  );
}

describe('GoogleSheetSettingsPage autosave lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    sheetsSettingsApi.updateSettings.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('labels the real source input and explains its persistence', () => {
    renderPage();
    const input = screen.getByRole('textbox', { name: /預設 Google Sheet 網址或 Spreadsheet ID/ });
    expect(input).toHaveAccessibleDescription('修改後會自動儲存至目前登入的 Google 帳號；換瀏覽器或重新登入仍可取回。');
    expect(screen.getByRole('link', { name: '開啟資料來源' })).toHaveAttribute(
      'href',
      'https://docs.google.com/spreadsheets/d/old-sheet/edit'
    );
  });

  it('saves a pasted source without surrounding whitespace', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/預設 Google Sheet 網址或 Spreadsheet ID/), {
      target: { value: '  https://docs.google.com/spreadsheets/d/sheet-1/edit  ' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '立即儲存帳號設定' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sheetsSettingsApi.updateSettings).toHaveBeenCalledWith({
      default_spreadsheet_id: 'https://docs.google.com/spreadsheets/d/sheet-1/edit',
    });
    expect(screen.getByText('目前帳號的 Google Sheet 設定已自動儲存。')).toBeInTheDocument();
    expect(screen.queryByText('自動儲存失敗')).not.toBeInTheDocument();
  });

  it('flushes the latest debounced value once when the page unmounts', async () => {
    const refreshSettings = vi.fn().mockResolvedValue({});
    const { unmount } = renderPage(refreshSettings);

    fireEvent.change(screen.getByLabelText(/預設 Google Sheet 網址或 Spreadsheet ID/), {
      target: { value: 'latest-sheet' },
    });
    expect(sheetsSettingsApi.updateSettings).not.toHaveBeenCalled();

    unmount();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sheetsSettingsApi.updateSettings).toHaveBeenCalledTimes(1);
    expect(sheetsSettingsApi.updateSettings).toHaveBeenCalledWith({ default_spreadsheet_id: 'latest-sheet' });
    expect(refreshSettings).not.toHaveBeenCalled();
  });

  it('does not duplicate an autosave already queued before unmount', async () => {
    let resolveSave;
    sheetsSettingsApi.updateSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    const { unmount } = renderPage();

    fireEvent.change(screen.getByLabelText(/預設 Google Sheet 網址或 Spreadsheet ID/), {
      target: { value: 'queued-sheet' },
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(sheetsSettingsApi.updateSettings).toHaveBeenCalledTimes(1);

    unmount();
    expect(sheetsSettingsApi.updateSettings).toHaveBeenCalledTimes(1);

    resolveSave({});
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('shows a refresh warning after a confirmed settings write', async () => {
    renderPage(vi.fn().mockRejectedValue(new Error('refresh failed')));
    fireEvent.change(screen.getByLabelText(/預設 Google Sheet 網址或 Spreadsheet ID/), {
      target: { value: 'new-sheet' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '立即儲存帳號設定' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sheetsSettingsApi.updateSettings).toHaveBeenCalledWith({ default_spreadsheet_id: 'new-sheet' });
    expect(screen.getByText(/設定已儲存，但畫面更新失敗/)).toBeInTheDocument();
    expect(screen.queryByText('自動儲存失敗')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/預設 Google Sheet 網址或 Spreadsheet ID/)).toHaveValue('new-sheet');
  });
});
