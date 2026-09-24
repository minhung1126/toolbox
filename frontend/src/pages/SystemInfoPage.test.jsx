import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import SystemInfoPage from './SystemInfoPage';

describe('SystemInfoPage', () => {
  it('shows read-only deployment values and links to the design system showcase', () => {
    render(
      <MemoryRouter>
        <SystemInfoPage sysSettings={{ public_base_url: 'https://example.test' }} />
      </MemoryRouter>
    );
    expect(screen.getByRole('textbox', { name: '對外公開網址（PUBLIC_BASE_URL）' })).toHaveValue(
      'https://example.test'
    );
    expect(screen.getByRole('link', { name: '查看共用元件展示' })).toHaveAttribute('href', '/system/design-system');
  });
});
