'use client';

import { useState, useEffect } from 'react';
import styles from './monthly.module.css';
import SprintPicker from '../components/SprintPicker';
import LoadingOverlay from '../components/LoadingOverlay';
import {
  SprintItem,
  MonthlyRow,
  MonthlyExcluded,
  MonthlyRekap,
  MonthlyGenerateResponse,
  MonthlyCommitResponse,
} from '../types/monthly';

const LOADING_STEPS = [
  'Mengambil tiket dari Jira Cloud...',
  'Memeriksa duplikasi carry-over tiket...',
  'Menjalankan prefilter assignee & kelayakan...',
  'Mengevaluasi sasaran & capaian via Gemini AI (Tahap 1)...',
  'Mengelompokkan tiket sejenis via Gemini AI (Tahap 2 Grouping)...',
  'Merumuskan 10 kolom laporan bulanan & rekonsiliasi...',
  'Menyiapkan preview laporan bulanan...',
];

export default function MonthlyPage() {
  const [sprints, setSprints] = useState<SprintItem[]>([]);
  const [loadingSprints, setLoadingSprints] = useState(true);
  const [sprintError, setSprintError] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedSprintIds, setSelectedSprintIds] = useState<number[]>([]);

  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const [rows, setRows] = useState<MonthlyRow[]>([]);
  const [excluded, setExcluded] = useState<MonthlyExcluded[]>([]);
  const [rekap, setRekap] = useState<MonthlyRekap | null>(null);
  const [activeTab, setActiveTab] = useState<'main' | 'excluded' | 'rekap'>('main');

  // State Commit ke Google Sheets
  const [pendingCommit, setPendingCommit] = useState(false);
  const [commitResult, setCommitResult] = useState<{
    link: string;
    mainSheetTitle: string;
    followUpSheetTitle: string;
    count: number;
    followUpCount: number;
  } | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState<{
    shown: boolean;
    mainSheetTitle: string;
    message: string;
  }>({ shown: false, mainSheetTitle: '', message: '' });
  const [isEdited, setIsEdited] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  // Ambil daftar sprint saat halaman dibuka
  useEffect(() => {
    fetch('/api/sprints')
      .then((res) => res.json())
      .then((data) => {
        if (data.sprints && Array.isArray(data.sprints)) {
          setSprints(data.sprints);
        } else {
          setSprintError(data.error || 'Gagal memuat daftar sprint.');
        }
      })
      .catch((err: unknown) => {
        console.error('Error fetching sprints:', err);
        setSprintError('Gagal terhubung ke Jira API untuk mengambil sprint.');
      })
      .finally(() => {
        setLoadingSprints(false);
      });
  }, []);

  // Animasi progress bar saat loading generate
  useEffect(() => {
    if (!loadingGenerate) return;
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 92) {
          clearInterval(id);
          return p;
        }
        const step = Math.max(0.4, (92 - p) * 0.05);
        return Math.min(92, p + step);
      });
    }, 200);
    return () => clearInterval(id);
  }, [loadingGenerate]);

  const currentLoadingMessage =
    LOADING_STEPS[
      Math.min(
        LOADING_STEPS.length - 1,
        Math.floor((progress / 100) * LOADING_STEPS.length)
      )
    ];

  const handleGenerate = async () => {
    if (selectedSprintIds.length === 0) return;
    setProgress(5);
    setLoadingGenerate(true);
    setError('');
    setCommitResult(null);
    setConfirmOverwrite({ shown: false, mainSheetTitle: '', message: '' });

    try {
      const res = await fetch('/api/monthly/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sprintIds: selectedSprintIds }),
      });

      const data: MonthlyGenerateResponse = await res.json();

      if (data.success && data.rows) {
        setProgress(100);
        setRows(data.rows);
        setExcluded(data.excluded || []);
        setRekap(data.rekap || null);
        setActiveTab('main');
        setIsEdited(false);
        setShowRegenerateConfirm(false);
      } else {
        setError(data.error || 'Gagal memproses laporan Monthly.');
      }
    } catch (err: unknown) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'Gagal terhubung ke server saat memproses laporan.'
      );
    } finally {
      setTimeout(() => {
        setLoadingGenerate(false);
        setProgress(0);
      }, 300);
    }
  };

  const handleCommit = async (overwrite = false) => {
    if (rows.length === 0) return;
    setPendingCommit(true);
    setError('');
    setConfirmOverwrite({ shown: false, mainSheetTitle: '', message: '' });

    try {
      const res = await fetch('/api/monthly/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          monthLabel: selectedMonth,
          overwrite,
        }),
      });

      const data: MonthlyCommitResponse = await res.json();

      if (data.requireConfirmation) {
        setConfirmOverwrite({
          shown: true,
          mainSheetTitle: data.mainSheetTitle || `Monthly ${selectedMonth}`,
          message:
            data.error ||
            `Tab "${data.mainSheetTitle}" sudah ada. Apakah Anda ingin menimpa tab tersebut?`,
        });
      } else if (data.success && data.link) {
        setCommitResult({
          link: data.link,
          mainSheetTitle: data.mainSheetTitle || '',
          followUpSheetTitle: data.followUpSheetTitle || '',
          count: data.count || rows.length,
          followUpCount: data.followUpCount || 0,
        });
      } else {
        setError(data.error || 'Gagal menulis ke Google Sheets.');
      }
    } catch (err: unknown) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : 'Gagal terhubung ke server saat commit ke Google Sheets.'
      );
    } finally {
      setPendingCommit(false);
    }
  };

  const updateRow = (idx: number, field: keyof MonthlyRow, value: string) => {
    setIsEdited(true);
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  };

  const deleteRow = (idx: number) => {
    setIsEdited(true);
    setRows((prev) => {
      const updated = prev.filter((_, i) => i !== idx);
      return updated.map((r, i) => ({ ...r, no: i + 1 }));
    });
  };

  const addRow = () => {
    setIsEdited(true);
    setRows((prev) => [
      ...prev,
      {
        no: prev.length + 1,
        kegiatan: 'Web Komdigi',
        sasaran_kpi: '',
        capaian: '',
        rencana_tindak_lanjut: '',
        tanggal_permohonan: '',
        tanggal_selesai: '',
        status: 'Todo',
        pemohon: '',
        data_pendukung: '',
        source_keys: [],
        needs_verification: false,
      },
    ]);
  };

  const handleRegenerateClick = () => {
    if (isEdited) {
      setShowRegenerateConfirm(true);
    } else {
      handleGenerate();
    }
  };

  const isGenerateDisabled =
    loadingSprints || selectedSprintIds.length === 0 || loadingGenerate;

  return (
    <main className={styles.page}>
      <div className={styles.pawPrint + ' ' + styles.ppA} />
      <div className={styles.pawPrint + ' ' + styles.ppB} />
      <div className={styles.pawPrint + ' ' + styles.ppC} />

      <LoadingOverlay
        active={loadingGenerate}
        progress={progress}
        message={currentLoadingMessage}
      />

      <div className={styles.card}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>MONTHLY REPORT ⇢ SHEET</h1>
        </div>
        <p className={styles.subtitle}>
          Laporan Capaian Layanan Publik 10 Kolom (Yanlik)
        </p>

        <SprintPicker
          sprints={sprints}
          loading={loadingSprints}
          error={sprintError}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          selectedSprintIds={selectedSprintIds}
          onSelectionChange={setSelectedSprintIds}
        />

        {rows.length === 0 ? (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerateDisabled}
            className={styles.pixelButton}
          >
            {loadingGenerate
              ? 'MERACIK DATA DENGAN AI...'
              : isGenerateDisabled
              ? 'PILIH MINIMAL 1 SPRINT 🐾'
              : `GENERATE LAPORAN (${selectedSprintIds.length} SPRINT) ⚡`}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => handleCommit(false)}
              disabled={pendingCommit || loadingGenerate}
              className={`${styles.pixelButton} ${styles.commitButton}`}
              style={{ flex: 2, marginTop: 0 }}
            >
              {pendingCommit ? 'MENULIS KE SPREADSHEET...' : 'TULIS KE SPREADSHEET ⚡'}
            </button>
            <button
              type="button"
              onClick={handleRegenerateClick}
              disabled={pendingCommit || loadingGenerate || selectedSprintIds.length === 0}
              className={styles.pixelButton}
              style={{ flex: 1, marginTop: 0, fontSize: '11px', background: '#4b5563' }}
              title="Generate ulang dari Jira (data editan preview akan diperbarui)"
            >
              {loadingGenerate ? 'MERACIK...' : 'GENERATE ULANG ↺'}
            </button>
          </div>
        )}

        {showRegenerateConfirm && (
          <div className={styles.confirmBox}>
            <div className={styles.confirmTitle}>⚠️ Perubahan Manual Akan Hilang</div>
            <p className={styles.confirmMessage}>
              Perubahan manual Anda pada tabel preview akan hilang jika Anda generate ulang. Lanjutkan?
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                onClick={() => {
                  setShowRegenerateConfirm(false);
                  setIsEdited(false);
                  handleGenerate();
                }}
                className={styles.confirmBtn}
              >
                YA, GENERATE ULANG
              </button>
              <button
                type="button"
                onClick={() => setShowRegenerateConfirm(false)}
                className={styles.cancelBtn}
              >
                BATAL
              </button>
            </div>
          </div>
        )}

        {confirmOverwrite.shown && (
          <div className={styles.confirmBox}>
            <div className={styles.confirmTitle}>⚠️ Konfirmasi Timpa Tab</div>
            <p className={styles.confirmMessage}>{confirmOverwrite.message}</p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                onClick={() => handleCommit(true)}
                className={styles.confirmBtn}
              >
                YA, TIMPA KEDUA TAB INI
              </button>
              <button
                type="button"
                onClick={() =>
                  setConfirmOverwrite({ shown: false, mainSheetTitle: '', message: '' })
                }
                className={styles.cancelBtn}
              >
                BATAL
              </button>
            </div>
          </div>
        )}

        {commitResult && (
          <div className={styles.successBox}>
            <div className={styles.successHeader}>
              <span>🎉</span>
              <span>Berhasil Ditulis ke Spreadsheet Monthly!</span>
            </div>
            <p>
              Laporan berhasil ditulis ke tab <strong>&quot;{commitResult.mainSheetTitle}&quot;</strong> ({commitResult.count} baris) dan tab{' '}
              <strong>&quot;{commitResult.followUpSheetTitle}&quot;</strong> ({commitResult.followUpCount} tiket sumber).
            </p>
            <p style={{ fontSize: '11px', color: '#166534', marginTop: '4px' }}>
              ℹ️ Catatan: Jawaban yang pernah Anda isi pada tab Follow-up Pemohon dipertahankan secara otomatis.
            </p>
            <a
              href={commitResult.link}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.sheetLink}
            >
              BUKA SPREADSHEET MONTHLY →
            </a>
          </div>
        )}

        {error && (
          <div className={styles.errorBox}>
            <span>⚠️ {error}</span>
          </div>
        )}

        {rekap && (
          <div className={styles.summaryBox}>
            <div className={styles.summaryTitle}>
              📊 Ringkasan Pemrosesan Tiket ({selectedMonth})
            </div>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryCard}>
                <div className={styles.summaryNum}>{rekap.totalEntries}</div>
                <div className={styles.summaryLabel}>Total Entri Dibaca</div>
              </div>
              <div className={styles.summaryCard}>
                <div className={styles.summaryNum}>{rekap.uniqueTasks}</div>
                <div className={styles.summaryLabel}>Tiket Unik</div>
              </div>
              <div className={styles.summaryCard}>
                <div className={styles.summaryNum}>{rekap.duplicateEntries}</div>
                <div className={styles.summaryLabel}>Duplikat Dieliminasi</div>
              </div>
              <div className={styles.summaryCard}>
                <div className={styles.summaryNum} style={{ color: '#16a34a' }}>
                  {rekap.includedTasks}
                </div>
                <div className={styles.summaryLabel}>Tiket Masuk</div>
              </div>
              <div className={styles.summaryCard}>
                <div className={styles.summaryNum} style={{ color: '#2563eb' }}>
                  {rekap.includedRows}
                </div>
                <div className={styles.summaryLabel}>Baris Laporan (Grouped)</div>
              </div>
              <div className={styles.summaryCard}>
                <div className={styles.summaryNum} style={{ color: '#dc2626' }}>
                  {rekap.excludedTasks}
                </div>
                <div className={styles.summaryLabel}>Dikecualikan</div>
              </div>
              <div className={styles.summaryCard}>
                <div className={styles.summaryNum} style={{ color: '#ca8a04' }}>
                  {rekap.needsVerification}
                </div>
                <div className={styles.summaryLabel}>Perlu Verifikasi</div>
              </div>
            </div>
          </div>
        )}

        {(rows.length > 0 || excluded.length > 0) && (
          <div className={styles.previewBox}>
            {/* Navigasi Tab */}
            <div className={styles.tabNav}>
              <button
                type="button"
                className={`${styles.tabBtn} ${
                  activeTab === 'main' ? styles.tabBtnActive : ''
                }`}
                onClick={() => setActiveTab('main')}
              >
                📋 Tabel Utama ({rows.length} Baris)
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${
                  activeTab === 'excluded' ? styles.tabBtnActive : ''
                }`}
                onClick={() => setActiveTab('excluded')}
              >
                🚫 Tidak Masuk Laporan ({excluded.length})
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${
                  activeTab === 'rekap' ? styles.tabBtnActive : ''
                }`}
                onClick={() => setActiveTab('rekap')}
              >
                📈 Rekapitulasi & Validasi
              </button>
            </div>

            {/* TAB 1: TABEL UTAMA */}
            {activeTab === 'main' && (
              <>
                <div className={styles.previewTableWrap}>
                  <table className={styles.previewTable}>
                    <thead>
                      <tr>
                        <th>NO</th>
                        <th>KEGIATAN</th>
                        <th>SASARAN DAN KEY PERFORMANCE INDICATOR</th>
                        <th>CAPAIAN</th>
                        <th>RENCANA TINDAK LANJUT / PENDING MATTERS</th>
                        <th>TANGGAL PERMOHONAN</th>
                        <th>TANGGAL SELESAI</th>
                        <th>STATUS</th>
                        <th>PEMOHON</th>
                        <th>DATA PENDUKUNG</th>
                        <th>AKSI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 800, textAlign: 'center' }}>
                            {row.no}
                          </td>
                          <td>
                            <input
                              className={styles.cellInput}
                              value={row.kegiatan}
                              onChange={(e) =>
                                updateRow(idx, 'kegiatan', e.target.value)
                              }
                            />
                            {row.source_keys.length > 1 && (
                              <span className={styles.taskCountBadge}>
                                📦 {row.source_keys.length} tiket digabung
                              </span>
                            )}
                          </td>
                          <td>
                            <textarea
                              className={styles.cellTextarea}
                              value={row.sasaran_kpi}
                              onChange={(e) =>
                                updateRow(idx, 'sasaran_kpi', e.target.value)
                              }
                            />
                          </td>
                          <td>
                            <textarea
                              className={styles.cellTextarea}
                              value={row.capaian}
                              onChange={(e) =>
                                updateRow(idx, 'capaian', e.target.value)
                              }
                            />
                          </td>
                          <td>
                            <textarea
                              className={styles.cellTextarea}
                              value={row.rencana_tindak_lanjut}
                              placeholder="(kosong)"
                              onChange={(e) =>
                                updateRow(
                                  idx,
                                  'rencana_tindak_lanjut',
                                  e.target.value
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              className={styles.cellInput}
                              style={{ width: '90px' }}
                              value={row.tanggal_permohonan}
                              onChange={(e) =>
                                updateRow(
                                  idx,
                                  'tanggal_permohonan',
                                  e.target.value
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              className={styles.cellInput}
                              style={{ width: '90px' }}
                              value={row.tanggal_selesai}
                              placeholder="-"
                              onChange={(e) =>
                                updateRow(idx, 'tanggal_selesai', e.target.value)
                              }
                            />
                          </td>
                          <td>
                            <input
                              className={styles.cellInput}
                              style={{ width: '85px' }}
                              value={row.status}
                              onChange={(e) =>
                                updateRow(idx, 'status', e.target.value)
                              }
                            />
                          </td>
                          <td>
                            <input
                              className={styles.cellInput}
                              style={{ width: '80px' }}
                              value={row.pemohon}
                              placeholder="(kosong)"
                              onChange={(e) =>
                                updateRow(idx, 'pemohon', e.target.value)
                              }
                            />
                          </td>
                          <td>
                            <textarea
                              className={styles.cellTextarea}
                              value={row.data_pendukung}
                              onChange={(e) =>
                                updateRow(idx, 'data_pendukung', e.target.value)
                              }
                            />
                            {row.needs_verification && (
                              <span className={styles.warningBadge}>
                                ⚠️ Perlu Verifikasi
                                {row.verification_note
                                  ? `: ${row.verification_note}`
                                  : ''}
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => deleteRow(idx)}
                              className={styles.deleteRowBtn}
                              title="Hapus baris ini"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  type="button"
                  onClick={addRow}
                  className={styles.addRowBtn}
                >
                  <span>+</span>
                  <span>TAMBAH BARIS</span>
                </button>
              </>
            )}

            {/* TAB 2: TIDAK MASUK LAPORAN */}
            {activeTab === 'excluded' && (
              <div className={styles.previewTableWrap}>
                <table className={styles.previewTable}>
                  <thead>
                    <tr>
                      <th>NO</th>
                      <th>ID TIKET</th>
                      <th>JUDUL TIKET</th>
                      <th>ASSIGNEE</th>
                      <th>STATUS JIRA</th>
                      <th>ALASAN TIDAK MASUK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excluded.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          style={{
                            textAlign: 'center',
                            padding: '16px',
                            color: '#1e293b',
                          }}
                        >
                          Tidak ada tiket yang dikecualikan. Seluruh tiket masuk laporan.
                        </td>
                      </tr>
                    ) : (
                      excluded.map((item, idx) => (
                        <tr key={idx}>
                          <td className={styles.excludedNo}>
                            {idx + 1}
                          </td>
                          <td className={styles.excludedKey}>{item.key}</td>
                          <td className={styles.excludedText}>{item.summary}</td>
                          <td className={styles.excludedText}>{item.assignee}</td>
                          <td className={styles.excludedText}>{item.status}</td>
                          <td className={styles.excludedReason}>
                            {item.reason}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 3: REKAPITULASI */}
            {activeTab === 'rekap' && rekap && (
              <div className={styles.rekapDetailBox}>
                <div className={styles.rekapRow}>
                  <span>Total Entri Dibaca dari Jira:</span>
                  <strong>{rekap.totalEntries}</strong>
                </div>
                <div className={styles.rekapRow}>
                  <span>Jumlah Tiket Unik (setelah deduplikasi ID):</span>
                  <strong>{rekap.uniqueTasks}</strong>
                </div>
                <div className={styles.rekapRow}>
                  <span>Jumlah Duplikat Carry-Over Dieliminasi:</span>
                  <strong>{rekap.duplicateEntries}</strong>
                </div>
                <div className={styles.rekapRow}>
                  <span>Tiket Unik Lolos Kriteria:</span>
                  <strong style={{ color: '#16a34a' }}>
                    {rekap.includedTasks}
                  </strong>
                </div>
                <div className={styles.rekapRow}>
                  <span>Jumlah Baris Laporan Utama (Setelah Pengelompokan):</span>
                  <strong style={{ color: '#2563eb' }}>
                    {rekap.includedRows}
                  </strong>
                </div>
                <div className={styles.rekapRow}>
                  <span>Tiket Unik Dikecualikan:</span>
                  <strong style={{ color: '#dc2626' }}>
                    {rekap.excludedTasks}
                  </strong>
                </div>
                <div className={styles.rekapRow}>
                  <span>Tiket Memerlukan Verifikasi Tambahan:</span>
                  <strong style={{ color: '#ca8a04' }}>
                    {rekap.needsVerification}
                  </strong>
                </div>
                <div className={styles.rekapRow} style={{ marginTop: '12px' }}>
                  <span>
                    Status Rekonsiliasi (Tiket Unik = Masuk + Dikecualikan):
                  </span>
                  {rekap.reconciliationValid ? (
                    <span className={styles.validBadge}>
                      VALID & TEREKONSILIASI ✓
                    </span>
                  ) : (
                    <span className={styles.invalidBadge}>
                      TERDAPAT SELISIH ⚠️
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
