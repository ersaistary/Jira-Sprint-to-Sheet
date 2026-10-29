# Verifikasi logika kode PS-03-YY-ZZZ

Pakai file `contoh-sprint.txt` sebagai sumber data.

Cara menjalankan:
1. `npm run dev`
2. Di UI, pilih mode **paste teks manual** (rawText), salin seluruh isi `contoh-sprint.txt`, lalu **Generate**.
   (Bisa juga mode upload file `.txt`.)
3. Cocokkan kolom `kode_perubahan` dan `lokasi` pada tabel preview teknis dengan tabel di bawah.
4. Pastikan task yang masuk `task_lain` (tabel non-teknis) juga sesuai.

## Hasil yang diharapkan — perubahan_teknis (masuk sheet)

| Task | lokasi (baku) | Kelompok | YY | ZZZ | kode_perubahan |
|------|---------------|----------|----|-----|----------------|
| YANLIK-3001 | Seleksi | A (yanlik) | 02 | 003 | **PS-03-02-003** |
| YANLIK-3002 | JDIH | A (yanlik) | 02 | 006 | **PS-03-02-006** |
| YANLIK-3003 | OSS Hub | A (yanlik) | 02 | 007 | **PS-03-02-007** |
| YANLIK-3004 | Web Komdigi | A (yanlik) | 02 | 005 | **PS-03-02-005** |
| YANLIK-3005 | ShortURL | A (yanlik) | 02 | 006 | **PS-03-02-006** |
| YANLIK-3006 | Simponi Gateway | A (yanlik) | 02 | 009 | **PS-03-02-009** |
| YANLIK-3007 | Portal Layanan Publik | A (yanlik) | 02 | 002 | **PS-03-02-002** |
| YANLIK-3008 | Komso Komdigi | B (non-yanlik) | 00 | 003 | **PS-03-00-003** |
| YANLIK-3009 | Portal komdigi | B (non-yanlik) | 00 | 007 | **PS-03-00-007** |
| YANLIK-3010 | Komso Komdigi | B (non-yanlik) | 00 | 005 | **PS-03-00-005** |

Total: **10 baris teknis** (7 yanlik `PS-03-02-…`, 3 non-yanlik `PS-03-00-…`).

## Pasangan kunci untuk membuktikan "hanya YY yang berubah"

- **YANLIK-3001** (reset password, Seleksi) → `PS-03-02-003`
- **YANLIK-3008** (reset password, Kosmo/Komso Komdigi) → `PS-03-00-003`

Jenis perubahan sama (ZZZ = 003), XX sama (03). Yang beda **hanya YY**: `02` karena Seleksi tim fokus yanlik, `00` karena Kosmo di luar yanlik.

- **YANLIK-3003** (fitur minor, OSS Hub) → `PS-03-02-007`
- **YANLIK-3009** (fitur minor, Portal Komdigi) → `PS-03-00-007`

## Pemetaan lokasi / tag

- Tag `[Kosmo]` → lokasi baku **Komso Komdigi** (Kelompok B → YY 00)
- Tag `[Portal Komdigi]` → lokasi baku **Portal komdigi** (Kelompok B → YY 00)
- Tag `[Seleksi]`, `[JDIH]`, `[OSSHUB]`→OSS Hub, `[Web Komdigi]`, `[ShortUrl]`→ShortURL, `[Simponi Gateway]` → Kelompok A → YY 02

## Hasil yang diharapkan — task_lain (TIDAK masuk sheet)

| Task | Alasan |
|------|--------|
| YANLIK-3011 | Load testing / QA → non-teknis |
| YANLIK-3012 | Tag `[Helpdesk]` → non-teknis |
| YANLIK-3013 | Kerja di dalam tool Metabase (dashboard/query) → non-teknis |
| YANLIK-3014 | Tag `[Dokumentasi]`, nota dinas administratif → non-teknis |

Total: **4 task_lain**.

## Catatan

- YANLIK-3007 sengaja dibuat "menjebak": menyebut Metabase, tapi kerja fisiknya pada **database Portal Layanan Publik** → harus TETAP teknis (Kelompok A → `PS-03-02-002`), lokasi Portal Layanan Publik. Ini membedakan dari YANLIK-3013 yang kerja di dalam Metabase → task_lain.
- Kalau ada `kode_perubahan` yang keluar `PS-03-02-…` padahal lokasinya Kosmo/Portal komdigi (atau sebaliknya), berarti aturan YY di prompt belum kebaca benar oleh model — kabari, nanti prompt-nya dipertajam.
- Perilaku AI tidak bisa diverifikasi otomatis; tabel ini acuan untuk pengecekan manual.
