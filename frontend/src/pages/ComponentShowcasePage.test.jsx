import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ComponentShowcasePage from './ComponentShowcasePage';

describe('ComponentShowcasePage', () => {
  it('presents shared controls and visual states used by feature pages', () => {
    render(<ComponentShowcasePage />);
    expect(screen.getByRole('heading', { level: 1, name: '共用元件展示' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '主要操作' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '儲存中' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: '工作表名稱' })).toHaveAccessibleDescription('請輸入來源工作表名稱。');
    expect(screen.getByRole('heading', { level: 3, name: '目前沒有項目' })).toBeInTheDocument();
  });
});
