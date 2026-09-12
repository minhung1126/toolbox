import React from 'react';
import { Outlet } from 'react-router-dom';

export default function AccountSettingsLayout() {
  return (
    <div className="section-gap settings-page">
      <header className="page-header">
        <h1>控制台帳號設定</h1>
        <p className="section-desc">管理控制台 Google 登入身分與安全性；模組功能設定請至對應模組選單。</p>
      </header>
      <Outlet />
    </div>
  );
}

