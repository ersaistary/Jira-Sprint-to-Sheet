'use client';
import { useState, useEffect, ChangeEvent } from 'react';
import styles from './page.module.css';

// Hanya TIPES dan KONSTANTA yang boleh di sini (di luar komponen)
type SourceMode = 'file' | 'text' | 'jira';
type TaskLain = { kode: string; judul: string };
type Row = {
  kode_perubahan: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  pelaksana: string;
  lokasi: string;
  status_perubahan: string;
  inisiasi: string;
  detail: string;
  hasil: string;
  dampak: string;
  keterangan: string;
  status: string;
};
type SprintOption = { id: number; name: string; state: string };

const LOADING_MESSAGES = [
  'membaca dokumen kamu...',
  'memilah task teknis...',
  'mencocokkan kode perubahan...',
  'merapikan tanggal & status...',
  'menyiapkan baris sheet...',
];

export default function Home() {
  const [mode, setMode] = useState<SourceMode>('file');
  const [sprintOptions, setSprintOptions] = useState<SprintOption[]>([]);
  const [selectedSprintIds, setSelectedSprintIds] = useState<number[]>([]);
  const [sprintLoadError, setSprintLoadError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [link, setLink] = useState('');
  const [count, setCount] = useState(0);
  const [sheetTitle, setSheetTitle] = useState('');
  const [taskLain, setTaskLain] = useState<TaskLain[]>([]);
  const [error, setError] = useState('');
  const [reIncludeKeys, setReIncludeKeys] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [pendingCommit, setPendingCommit] = useState(false);
  const [committedSheet, setCommittedSheet] = useState('');


  // Progress asli dari API generateContent tidak bisa di-stream per-persen, jadi kita
  // simulasikan progres yang naik cepat lalu melambat mendekati 92% sambil menunggu
  // respons AI beneran datang - baru discroll cepat ke 100% saat selesai.
  useEffect(() => {
    if (!loading) return;
    setProgress(3);
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 92) return p;
        const step = Math.max(0.4, (92 - p) * 0.06);
        return Math.min(92, p + step);
      });
    }, 180);
    return () => clearInterval(id);
  }, [loading]);

  // Ambil daftar 5 sprint terbaru dari server saat halaman dibuka
  useEffect(() => {
    fetch('/api/sprints')
      .then((res) => res.json())
      .then((data) => {
        if (data.sprints) setSprintOptions(data.sprints);
        else setSprintLoadError(data.error || 'Gagal memuat daftar sprint.');
      })
      .catch(() => setSprintLoadError('Gagal memuat daftar sprint.'));
  }, []);

  const loadingMessage =
    LOADING_MESSAGES[Math.min(LOADING_MESSAGES.length - 1, Math.floor((progress / 100) * LOADING_MESSAGES.length))];

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setInputText('');
      setMode('file'); // pilih file = otomatis balik ke mode file
    }
  };

  const reset = () => {
    setLink('');
    setCount(0);
    setSheetTitle('');
    setTaskLain([]);
    setError('');
    setRows([]);
    setCommittedSheet('');
  };

  const toggleSprint = (id: number) => {
    setSelectedSprintIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev; // max 2 sprint
      return [...prev, id];
    });
  };

  const toggleReInclude = (kode: string) => {
    if (rows.length > 0 && !confirm('Regenerate akan mengganti semua baris di tabel preview (editan kamu hilang). Lanjut?')) {
      return;
    }
    setReIncludeKeys((prev) =>
      prev.includes(kode) ? prev.filter((k) => k !== kode) : [...prev, kode]
    );
  };

  const handleGenerate = async () => {
    if (mode === 'file' && !file) {
      setError('Pilih file dulu ya~');
      return;
    }
    if (mode === 'text' && !inputText.trim()) {
      setError('Paste teks Jira-nya dulu ya~');
      return;
    }
    // mode 'jira' tidak wajib pilih sprint — kalau kosong, server pakai 2 sprint terakhir

    reset();
    setLoading(true);
    try {
      const formData = new FormData();
      if (mode === 'jira') {
        formData.append('source', 'jira');
        if (selectedSprintIds.length > 0) {
          formData.append('sprintIds', JSON.stringify(selectedSprintIds));
        } else {
          formData.append('sprintCount', '2'); // fallback: 2 sprint terakhir
        }
        if (reIncludeKeys.length > 0) {
          formData.append('reInclude', JSON.stringify(reIncludeKeys));
        }
      } else if (mode === 'file' && file) {
        formData.append('file', file);
      } else {
        formData.append('rawText', inputText);
      }

      // reset checkbox re-include SETELAH formData tersusun, biar nilai yang
      // terkirim masih utuh
      setReIncludeKeys([]);

      const res = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      // respons sudah datang - loncat cepat ke 100% biar terasa "selesai", bukan
      // mendadak hilang begitu saja
      setProgress(100);
      await new Promise((r) => setTimeout(r, 450));

      if (data.success) {
        if (data.success) {
          setRows(data.rows || []);
          setTaskLain(data.task_lain || []);
        } else {
          setError(data.error || 'Terjadi kesalahan pada sistem.');
          setTaskLain(data.task_lain || []);
        }
        setTaskLain(data.task_lain || []);
      } else {
        setError(data.error || 'Terjadi kesalahan pada sistem.');
        setTaskLain(data.task_lain || []);
      }
    } catch (err) {
      console.error(err);
      setProgress(100);
      await new Promise((r) => setTimeout(r, 300));
      setError('Gagal terhubung ke server. Coba cek koneksi kamu ya!');
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

    const updateRow = (idx: number, field: keyof Row, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const deleteRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCommit = async () => {
    if (rows.length === 0) return;
    setPendingCommit(true);
    setError('');
    try {
      const res = await fetch('/api/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, existingSheetTitle: committedSheet || null }),
      });
      const data = await res.json();
      if (data.success) {
        setLink(data.link);
        setSheetTitle(data.sheetTitle);
        setCount(data.count);
        setCommittedSheet(data.sheetTitle); // commit berikutnya = overwrite tab ini
      } else {
        setError(data.error || 'Gagal menulis ke Sheets.');
      }
    } catch (err) {
      console.error(err);
      setError('Gagal terhubung ke server saat commit.');
    } finally {
      setPendingCommit(false);
    }
  };


  return (
    <main className={styles.page}>
      <div className={styles.pawPrint + ' ' + styles.ppA} />
      <div className={styles.pawPrint + ' ' + styles.ppB} />
      <div className={styles.pawPrint + ' ' + styles.ppC} />

      {loading && (
        <div className={styles.loadingOverlay} role="status" aria-live="polite">
          <div className={styles.loadingCard}>
            <div className={styles.stage}>
              <div className={styles.cat} style={{ left: `calc(progress{progress}% -progress{progress * 0.7}px)` }}>
                <div className={styles.catImgWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/cat-loading-base.png" alt="" className={styles.catBase} draggable={false} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/cat-pupil-left.png" alt="" className={styles.pupil + ' ' + styles.pupilL} draggable={false} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/cat-pupil-right.png" alt="" className={styles.pupil + ' ' + styles.pupilR} draggable={false} />
                </div>
              </div>
            </div>

            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: `${progress}%` }} />
            </div>

            <p className={styles.loadingPercent}>Loading... {Math.floor(progress)}%</p>
            <p className={styles.loadingSub}>{loadingMessage}</p>
          </div>
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.titleRow}>
          <span className={styles.sprite + ' ' + styles.pawprint} aria-hidden="true">
            <span className={styles.pad} />
            <span className={styles.toe + ' ' + styles.t1} />
            <span className={styles.toe + ' ' + styles.t2} />
            <span className={styles.toe + ' ' + styles.t3} />
          </span>
          <h1 className={styles.title}>SPRINT ⇢ SHEET</h1>
          <span className={styles.sprite + ' ' + styles.pawprint} aria-hidden="true">
            <span className={styles.pad} />
            <span className={styles.toe + ' ' + styles.t1} />
            <span className={styles.toe + ' ' + styles.t2} />
            <span className={styles.toe + ' ' + styles.t3} />
          </span>
        </div>
        <p className={styles.subtitle}>taruh export Jira-mu di sini, biar aku yang beresin 🐾</p>

        {/* Pilih sumber data */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>sumber data</label>
          <div className={styles.modeButtons}>
            <button type="button" onClick={() => setMode('file')} disabled={mode === 'file'}>📁 File</button>
            <button type="button" onClick={() => setMode('text')} disabled={mode === 'text'}>📝 Paste Teks</button>
            <button type="button" onClick={() => setMode('jira')} disabled={mode === 'jira'}>⚡ Dari Jira</button>
          </div>
        </div>

        {/* Upload — hanya tampil di mode file */}
        {mode === 'file' && (
          <>
            <div className={styles.pixelBox + ' ' + styles.uploadBox}>
              <label className={styles.fileLabel}>
                <span className={styles.sprite + ' ' + styles.folder} aria-hidden="true" />
                <span>PILIH FILE (.pdf / .docx / .txt)</span>
                <input
                  type="file"
                  accept=".txt,.pdf,.docx,.doc"
                  className={styles.hiddenInput}
                  onChange={handleFileUpload}
                />
              </label>
              {file && (
                <p className={styles.fileChosen}>📄 {file.name}</p>
              )}
            </div>

            <div className={styles.divider}>
              <span>atau</span>
            </div>

            {/* Textarea di mode file — tetap tampil tapi disabled kalau ada file (perilaku lama) */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>paste teks Jira manual</label>
              <textarea
                className={styles.pixelBox + ' ' + styles.textarea}
                placeholder="paste teks dari Jira di sini..."
                value={inputText}
                disabled={!!file}
                onChange={(e) => setInputText(e.target.value)}
              />
              {file && <span className={styles.hint}>hapus file dulu kalau mau paste teks manual~</span>}
            </div>
          </>
        )}

        {/* Textarea standalone — hanya di mode paste teks */}
        {mode === 'text' && (
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>paste teks Jira manual</label>
            <textarea
              className={styles.pixelBox + ' ' + styles.textarea}
              placeholder="paste teks dari Jira di sini..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
          </div>
        )}

        {/* Mode Jira — pilih sprint (maks 2) */}
        {mode === 'jira' && (
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>pilih sprint (maks. 2)</label>
            {sprintLoadError && <span className={styles.hint}>⚠️ {sprintLoadError}</span>}
            {sprintOptions.length === 0 && !sprintLoadError && (
              <span className={styles.hint}>memuat daftar sprint...</span>
            )}
            {sprintOptions.map((s) => {
              const checked = selectedSprintIds.includes(s.id);
              const disabled = !checked && selectedSprintIds.length >= 2;
              return (
                <label
                  key={s.id}
                  className={styles.hint}
                  style={{ display: 'block', cursor: disabled ? 'not-allowed' : 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleSprint(s.id)}
                  />{' '}
                  {s.name}
                  {s.state === 'active' ? ' (sedang berjalan)' : ''}
                </label>
              );
            })}
            {sprintOptions.length > 0 && !sprintLoadError && selectedSprintIds.length === 0 && (
              <span className={styles.hint}>tidak memilih apa pun = otomatis 2 sprint terakhir</span>
            )}
            <span className={styles.hint}>task akan diambil langsung dari project YANLIK via Jira API ⚡</span>
          </div>
        )}

        <button onClick={handleGenerate} disabled={loading} className={styles.pixelButton}>
          {loading ? (
            <span className={styles.loadingRow}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
              MERACIK DATA...
            </span>
          ) : (
            'GENERATE KE SHEETS ⚡'
          )}
        </button>

        {error && (
          <div className={styles.resultBox + ' ' + styles.errorBox}>
            <span className={styles.sprite + ' ' + styles.cross} aria-hidden="true" />
            <p>{error}</p>
          </div>
        )}

        {link && (
          <div className={styles.resultBox + ' ' + styles.successBox}>
            <span className={styles.sprite + ' ' + styles.star} aria-hidden="true" />
            <p>
              selesai! <strong>{count}</strong> task teknis berhasil masuk ke tab baru
              {sheetTitle ? <> "<strong>{sheetTitle}</strong>"</> : ''}.
            </p>
            <a href={link} target="_blank" rel="noopener noreferrer" className={styles.sheetLink}>
              buka spreadsheet →
            </a>
          </div>
        )}

        {taskLain.length > 0 && (
          <div className={styles.pixelBox + ' ' + styles.taskLainBox}>
            <p className={styles.taskLainTitle}>
              🐾 {taskLain.length} task non-teknis (testing/dokumentasi/helpdesk) — tidak dimasukkan ke sheet:
            </p>
            <p className={styles.hint}>
              ada yang keliru? centang task yang seharusnya masuk, lalu klik generate lagi.
            </p>
            <ul className={styles.taskLainList}>
              {taskLain.map((t, i) => (
                <li key={i}>
                  <label style={{ cursor: 'pointer', display: 'block' }}>
                    <input
                      type="checkbox"
                      checked={reIncludeKeys.includes(t.kode)}
                      onChange={() => toggleReInclude(t.kode)}
                    />{' '}
                    <span className={styles.taskKode}>{t.kode}</span> — {t.judul}
                  </label>
                  {reIncludeKeys.length > 0 && (
                  <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className={styles.pixelButton}
                    style={{ marginTop: '8px', fontSize: '12px', padding: '10px' }}
                  >
                    {loading ? 'MENGGENERATE ULANG...' : `GENERATE ULANG (${reIncludeKeys.length} task di-include) ⚡`}
                  </button>
            )}
                </li>
              ))}
            </ul>
            

          </div>
        )}

        {rows.length > 0 && (
          <div className={styles.pixelBox + ' ' + styles.previewBox}>
            <p className={styles.taskLainTitle}>
              📋 preview — {rows.length} baris siap masuk sheet. klik sel untuk edit, hapus baris yang tidak perlu.
            </p>
            <div className={styles.previewTableWrap}>
              <table className={styles.previewTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Kode Perubahan</th>
                    <th>Tgl Mulai</th>
                    <th>Tgl Selesai</th>
                    <th>Pelaksana</th>
                    <th>Lokasi</th>
                    <th>Status Perubahan</th>
                    <th>Inisiasi</th>
                    <th>Detail</th>
                    <th>Hasil</th>
                    <th>Dampak</th>
                    <th>Keterangan</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      {(Object.keys(r) as (keyof Row)[]).map((k) => (
                        <td key={k}>
                          <input
                            value={r[k] || ''}
                            onChange={(e) => updateRow(i, k, e.target.value)}
                            className={styles.cellInput}
                          />
                        </td>
                      ))}
                      <td>
                        <button type="button" onClick={() => deleteRow(i)} className={styles.deleteRowBtn}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={handleCommit} disabled={pendingCommit} className={styles.pixelButton}>
              {pendingCommit ? 'MENULIS KE SHEETS...' : 'TULIS KE SHEETS ⚡'}
            </button>
          </div>
        )}

      </div>
    </main>
  );
}
