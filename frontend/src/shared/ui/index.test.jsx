import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Badge, Button, Card, EmptyState, LoadingState, PageHeader, TextField } from './index';

describe('shared UI primitives', () => {
  it('connects field labels and error messages to the input', () => {
    render(<TextField label="試算表網址" error="網址格式不正確。" />);
    const input = screen.getByRole('textbox', { name: '試算表網址' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('網址格式不正確。');
  });

  it('disables an action and exposes its busy state while loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        儲存中
      </Button>
    );
    const button = screen.getByRole('button', { name: '儲存中' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders state, badge, card and page title with their semantic roles', () => {
    render(
      <>
        <PageHeader title="設定" description="管理工具設定。" />
        <Card as="article">
          <Badge tone="success">完成</Badge>
        </Card>
        <LoadingState>載入設定</LoadingState>
        <EmptyState title="沒有項目" description="請先設定來源。" />
      </>
    );
    expect(screen.getByRole('heading', { level: 1, name: '設定' })).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveTextContent('完成');
    expect(screen.getByRole('status')).toHaveTextContent('載入設定');
    expect(screen.getByRole('heading', { level: 3, name: '沒有項目' })).toBeInTheDocument();
  });
});
