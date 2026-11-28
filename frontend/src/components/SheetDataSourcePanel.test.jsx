import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SheetDataSourcePanel from './SheetDataSourcePanel';
import { ToastProvider } from './Toast';
import { sheetsSettingsApi } from '../features/sheets/api/sheetsSettingsApi';

vi.mock('../features/sheets/api/sheetsSettingsApi', () => ({
  sheetsSettingsApi: {
    getAuthUrl: vi.fn(),
  },
}));

describe('SheetDataSourcePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a user-facing error toast when fetching the Sheets auth URL fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sheetsSettingsApi.getAuthUrl.mockRejectedValueOnce(new Error('OAuth config missing'));

    render(
      <ToastProvider>
        <SheetDataSourcePanel
          spreadsheetId="sheet-1"
          onSpreadsheetIdChange={vi.fn()}
          onWorksheetChange={vi.fn()}
          onRefresh={vi.fn()}
          error="google_sheets_scope_required"
        />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /授權 Google 試算表/ }));

    await waitFor(() => {
      expect(screen.getByText('無法取得 Google 試算表授權連結：OAuth config missing')).toBeInTheDocument();
    });
  });
});
