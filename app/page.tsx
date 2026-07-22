'use client';
import { useState, useEffect, ChangeEvent } from 'react';
import styles from './page.module.css';

type TaskLain = { kode: string; judul: string };

const LOADING_MESSAGES = [
  'membaca dokumen kamu...',
  'memilah task teknis...',
  'mencocokkan kode perubahan...',
  'merapikan tanggal & status...',
  'menyiapkan baris sheet...',
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [link, setLink] = useState('');
  const [count, setCount] = useState(0);
  const [sheetTitle, setSheetTitle] = useState('');
  const [taskLain, setTaskLain] = useState<TaskLain[]>([]);
  const [error, setError] = useState('');

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

  const loadingMessage =
    LOADING_MESSAGES[Math.min(LOADING_MESSAGES.length - 1, Math.floor((progress / 100) * LOADING_MESSAGES.length))];

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setInputText('');
    }
  };

  const reset = () => {
    setLink('');
    setCount(0);
    setSheetTitle('');
    setTaskLain([]);
    setError('');
  };

  const handleGenerate = async () => {
    if (!file && !inputText.trim()) {
      setError('Upload file dulu (PDF/DOCX/TXT) atau paste teks Jira-nya ya~');
      return;
    }

    reset();
    setLoading(true);
    try {
      const formData = new FormData();
      if (file) {
        formData.append('file', file);
      } else {
        formData.append('rawText', inputText);
      }

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
        setLink(data.link);
        setCount(data.count || 0);
        setSheetTitle(data.sheetTitle || '');
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

  return (
    <main className={styles.page}>
      <div className={`${styles.pawPrint} ${styles.ppA}`} />
      <div className={`${styles.pawPrint} ${styles.ppB}`} />
      <div className={`${styles.pawPrint} ${styles.ppC}`} />

      {loading && (
        <div className={styles.loadingOverlay} role="status" aria-live="polite">
          <div className={styles.loadingCard}>
            <div className={styles.stage}>
              <div className={styles.cat} style={{ left: `calc(${progress}% - ${progress * 0.7}px)` }}>
                <div className={styles.catImgWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/cat-loading-base.png" alt="" className={styles.catBase} draggable={false} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/cat-pupil-left.png" alt="" className={`${styles.pupil} ${styles.pupilL}`} draggable={false} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/cat-pupil-right.png" alt="" className={`${styles.pupil} ${styles.pupilR}`} draggable={false} />
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
          <span className={`${styles.sprite} ${styles.pawprint}`} aria-hidden="true">
            <span className={styles.pad} />
            <span className={`${styles.toe} ${styles.t1}`} />
            <span className={`${styles.toe} ${styles.t2}`} />
            <span className={`${styles.toe} ${styles.t3}`} />
          </span>
          <h1 className={styles.title}>SPRINT ⇢ SHEET</h1>
          <span className={`${styles.sprite} ${styles.pawprint}`} aria-hidden="true">
            <span className={styles.pad} />
            <span className={`${styles.toe} ${styles.t1}`} />
            <span className={`${styles.toe} ${styles.t2}`} />
            <span className={`${styles.toe} ${styles.t3}`} />
          </span>
        </div>
        <p className={styles.subtitle}>taruh export Jira-mu di sini, biar aku yang beresin 🐾</p>

        {/* Upload */}
        <div className={`${styles.pixelBox} ${styles.uploadBox}`}>
          <label className={styles.fileLabel}>
            <span className={`${styles.sprite} ${styles.folder}`} aria-hidden="true" />
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

        {/* Textarea */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>paste teks Jira manual</label>
          <textarea
            className={`${styles.pixelBox} ${styles.textarea}`}
            placeholder="paste teks dari Jira di sini..."
            value={inputText}
            disabled={!!file}
            onChange={(e) => setInputText(e.target.value)}
          />
          {file && <span className={styles.hint}>hapus file dulu kalau mau paste teks manual~</span>}
        </div>

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
          <div className={`${styles.resultBox} ${styles.errorBox}`}>
            <span className={`${styles.sprite} ${styles.cross}`} aria-hidden="true" />
            <p>{error}</p>
          </div>
        )}

        {link && (
          <div className={`${styles.resultBox} ${styles.successBox}`}>
            <span className={`${styles.sprite} ${styles.star}`} aria-hidden="true" />
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
          <div className={`${styles.pixelBox} ${styles.taskLainBox}`}>
            <p className={styles.taskLainTitle}>
              🐾 {taskLain.length} task non-teknis (testing/dokumentasi/helpdesk) — tidak dimasukkan ke sheet:
            </p>
            <ul className={styles.taskLainList}>
              {taskLain.map((t, i) => (
                <li key={i}>
                  <span className={styles.taskKode}>{t.kode}</span> — {t.judul}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}