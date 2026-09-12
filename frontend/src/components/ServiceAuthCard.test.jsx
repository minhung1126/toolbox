import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileSpreadsheet } from 'lucide-react';
import ServiceAuthCard from './ServiceAuthCard';

describe('ServiceAuthCard', () => {
  it('renders connected state with reconnect and disconnect actions', () => {
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();

    render(
      <ServiceAuthCard
        icon={FileSpreadsheet}
        title="Google 試算表授權"
        connected={true}
        connectedBadgeText="已授權試算表"
        description="唯讀存取試算表資料"
        accountEmail="test@example.com"
        reconnectText="重新授權 Google 試算表"
        disconnectText="解除試算表授權"
        onConnect={onConnect}
        onDisconnect={onDisconnect}
      />
    );

    expect(screen.getByText('Google 試算表授權')).toBeInTheDocument();
    expect(screen.getByText('已授權試算表')).toBeInTheDocument();
    expect(screen.getByText(/唯讀存取試算表資料/)).toBeInTheDocument();
    expect(screen.getByText(/test@example.com/)).toBeInTheDocument();

    const reconnectBtn = screen.getByRole('button', { name: '重新授權 Google 試算表' });
    fireEvent.click(reconnectBtn);
    expect(onConnect).toHaveBeenCalledTimes(1);

    const disconnectBtn = screen.getByRole('button', { name: '解除試算表授權' });
    fireEvent.click(disconnectBtn);
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('renders disconnected state with warning banner and connect button', () => {
    const onConnect = vi.fn();

    render(
      <ServiceAuthCard
        icon={FileSpreadsheet}
        title="Google 試算表授權"
        connected={false}
        disconnectedBadgeText="尚未授權試算表"
        warningText="尚未連結 Google 試算表"
        connectText="連結 Google 試算表"
        onConnect={onConnect}
      />
    );

    expect(screen.getByText('Google 試算表授權')).toBeInTheDocument();
    expect(screen.getByText('尚未授權試算表')).toBeInTheDocument();
    expect(screen.getByText('尚未連結 Google 試算表')).toBeInTheDocument();

    const connectBtn = screen.getByRole('button', { name: '連結 Google 試算表' });
    fireEvent.click(connectBtn);
    expect(onConnect).toHaveBeenCalledTimes(1);
  });
});
