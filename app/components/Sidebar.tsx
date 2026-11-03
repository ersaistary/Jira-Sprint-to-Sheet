'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const pathname = usePathname();

  const isTIActive = pathname === '/';
  const isMonthlyActive = pathname === '/monthly' || pathname.startsWith('/monthly/');

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandIcon} aria-hidden="true">🐾</span>
        <div className={styles.brandText}>
          <span className={styles.brandTitle}>AUTO GENERATE</span>
          <span className={styles.brandSub}>Yanlik Doc Generator</span>
        </div>
      </div>

      <nav aria-label="Menu Utama">
        <ul className={styles.navList}>
          <li className={styles.navItem}>
            <Link
              href="/"
              className={`${styles.navLink} ${isTIActive ? styles.navLinkActive : ''}`}
            >
              <div className={styles.menuHeader}>
                <span className={styles.menuIcon} aria-hidden="true">📋</span>
                <span className={styles.menuTitle}>TI Standar</span>
              </div>
              <span className={styles.menuSubtitle}>Sprint → Change Log</span>
            </Link>
          </li>

          <li className={styles.navItem}>
            <Link
              href="/monthly"
              className={`${styles.navLink} ${isMonthlyActive ? styles.navLinkActive : ''}`}
            >
              <div className={styles.menuHeader}>
                <span className={styles.menuIcon} aria-hidden="true">📊</span>
                <span className={styles.menuTitle}>Monthly</span>
              </div>
              <span className={styles.menuSubtitle}>Laporan bulanan 10 kolom</span>
            </Link>
          </li>
        </ul>
      </nav>

      <div className={styles.footer}>
        <span>v2.0 • Yanlik Tools</span>
      </div>
    </aside>
  );
}

