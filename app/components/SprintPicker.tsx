'use client';

import React, { useMemo, useEffect } from 'react';
import { SprintItem } from '../types/monthly';
import styles from './SprintPicker.module.css';

export function getSprintMonthLabel(sprint: SprintItem): string {
  const dateStr = sprint.endDate || sprint.startDate;
  if (!dateStr) return 'Tanpa tanggal';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Tanpa tanggal';
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}

export function formatSprintDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export type SprintPickerProps = {
  sprints: SprintItem[];
  loading: boolean;
  error?: string;
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  selectedSprintIds: number[];
  onSelectionChange: (ids: number[]) => void;
};

export default function SprintPicker({
  sprints,
  loading,
  error,
  selectedMonth,
  onMonthChange,
  selectedSprintIds,
  onSelectionChange,
}: SprintPickerProps) {
  // Ambil daftar bulan unik dari sprint (berdasarkan endDate atau startDate)
  const uniqueMonths = useMemo(() => {
    const list: string[] = [];
    for (const s of sprints) {
      const m = getSprintMonthLabel(s);
      if (!list.includes(m)) list.push(m);
    }
    return list;
  }, [sprints]);

  // Sprint yang masuk ke bulan terpilih
  const sprintsInMonth = useMemo(() => {
    if (!selectedMonth) return [];
    return sprints.filter((s) => getSprintMonthLabel(s) === selectedMonth);
  }, [sprints, selectedMonth]);

  // Inisialisasi default bulan ke bulan sprint terbaru saat data sprint dimuat
  useEffect(() => {
    if (uniqueMonths.length > 0 && (!selectedMonth || !uniqueMonths.includes(selectedMonth))) {
      const defaultMonth = uniqueMonths[0];
      onMonthChange(defaultMonth);
      const defaultIds = sprints
        .filter((s) => getSprintMonthLabel(s) === defaultMonth)
        .map((s) => s.id);
      onSelectionChange(defaultIds);
    }
  }, [uniqueMonths, selectedMonth, sprints, onMonthChange, onSelectionChange]);

  const handleMonthSelect = (month: string) => {
    onMonthChange(month);
    // Semua sprint di bulan terpilih langsung tercentang otomatis
    const ids = sprints
      .filter((s) => getSprintMonthLabel(s) === month)
      .map((s) => s.id);
    onSelectionChange(ids);
  };

  const handleSelectAll = () => {
    onSelectionChange(sprintsInMonth.map((s) => s.id));
  };

  const handleDeselectAll = () => {
    onSelectionChange([]);
  };

  const toggleSprint = (id: number) => {
    if (selectedSprintIds.includes(id)) {
      onSelectionChange(selectedSprintIds.filter((item) => item !== id));
    } else {
      onSelectionChange([...selectedSprintIds, id]);
    }
  };

  return (
    <div className={styles.container}>
      {error && <div className={styles.errorHint}>⚠️ {error}</div>}

      <div className={styles.monthSelectRow}>
        <label htmlFor="month-select" className={styles.label}>
          📅 Pilih Periode Bulan
        </label>
        <div className={styles.selectWrap}>
          <select
            id="month-select"
            className={styles.monthSelect}
            value={selectedMonth}
            onChange={(e) => handleMonthSelect(e.target.value)}
            disabled={loading || uniqueMonths.length === 0}
          >
            {uniqueMonths.length === 0 ? (
              <option value="">{loading ? 'Memuat sprint...' : 'Tidak ada sprint'}</option>
            ) : (
              uniqueMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))
            )}
          </select>

          {sprintsInMonth.length > 0 && (
            <div className={styles.actionsRow}>
              <button
                type="button"
                onClick={handleSelectAll}
                className={styles.actionBtn}
                title="Pilih semua sprint di bulan ini"
              >
                PILIH SEMUA
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                className={styles.actionBtn}
                title="Kosongkan pilihan sprint"
              >
                KOSONGKAN
              </button>
            </div>
          )}
        </div>
        <span className={styles.hint}>
          Bulan dikelompokkan dari tanggal selesai (endDate) 5 sprint terbaru di Jira.
        </span>
      </div>

      <div className={styles.sprintListWrap}>
        <div className={styles.sprintListHeader}>
          <span className={styles.sprintListTitle}>
            Daftar Sprint Bulan {selectedMonth || '-'}
          </span>
          <span className={styles.selectionCountBadge}>
            {selectedSprintIds.length} dipilih
          </span>
        </div>

        {loading ? (
          <div className={styles.emptyBox}>Memuat daftar sprint dari Jira... 🐾</div>
        ) : sprintsInMonth.length === 0 ? (
          <div className={styles.emptyBox}>
            Tidak ada sprint pada bulan {selectedMonth || 'ini'}.
          </div>
        ) : (
          <div className={styles.sprintItems}>
            {sprintsInMonth.map((sprint) => {
              const isChecked = selectedSprintIds.includes(sprint.id);
              return (
                <div
                  key={sprint.id}
                  className={`${styles.sprintItem} ${isChecked ? styles.sprintItemChecked : ''}`}
                  onClick={() => toggleSprint(sprint.id)}
                >
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={isChecked}
                    onChange={() => {}} // handled by parent onClick
                    aria-label={`Pilih ${sprint.name}`}
                  />
                  <div className={styles.sprintInfo}>
                    <div className={styles.sprintTitleRow}>
                      <span className={styles.sprintName}>{sprint.name}</span>
                      {sprint.state === 'active' ? (
                        <span className={styles.badgeActive}>sedang berjalan</span>
                      ) : (
                        <span className={styles.badgeClosed}>selesai</span>
                      )}
                    </div>
                    <span className={styles.sprintDates}>
                      🗓️ {formatSprintDate(sprint.startDate)} s/d {formatSprintDate(sprint.endDate)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <span className={styles.hint} style={{ marginTop: '12px' }}>
          Tiket akan diambil langsung dari Jira project YANLIK sesuai sprint yang dicentang.
        </span>
      </div>
    </div>
  );
}

