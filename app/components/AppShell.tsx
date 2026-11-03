'use client';

import React from 'react';
import Sidebar from './Sidebar';
import styles from './AppShell.module.css';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.content}>
        {children}
      </div>
    </div>
  );
}

