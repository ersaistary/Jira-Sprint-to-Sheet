# Prompt Implementasi — Sidebar + Menu Monthly

> **Untuk AI coding agent.** Prompt ini harus dibaca bersama repo `D:\Sheets\auto-sprint-doc` dan file aturan bisnis `prompts/monthly.md`. Jangan mulai menulis kode sebelum membaca keduanya dan membuat rencana singkat.

---

## 0. Peran dan cara kerja

Kamu adalah senior full-stack engineer yang bekerja pada aplikasi Next.js yang sudah berjalan. Tugasmu **menambahkan sidebar dan satu menu baru bernama Monthly**. Kamu **tidak** membangun ulang aplikasi, dan kamu **tidak** mengubah perilaku flow yang sudah ada tanpa alasan yang jelas.

Aturan kerja:

1. Baca `AGENTS.md`, `README.md`, `app/page.tsx`, `app/api/generate/route.ts`, `app/api/commit/route.ts`, `app/api/sprints/route.ts`, `app/lib/jira.ts`, dan `app/page.module.css`.
2. Baca `prompts/monthly.md` sampai selesai. File itu adalah **sumber kebenaran aturan bisnis** laporan Monthly.
3. Baca dokumentasi Next.js 16 yang relevan di `node_modules/next/dist/docs/` sebelum menulis kode. Versi ini punya breaking changes; jangan mengandalkan ingatan dari Next.js versi lama.
4. Buat rencana implementasi singkat: file yang akan dibuat, file yang akan diubah, dan urutan pengerjaan. Tunjukkan rencana itu ke user sebelum mulai coding.
5. Implementasikan bertahap. Setelah setiap fase, jalankan `npx tsc --noEmit` dan laporkan hasilnya. Jangan lanjut jika masih ada error.
6. Jangan menghapus, merapikan, atau merefactor kode lama di luar scope. Jangan mengubah prompt change log di `app/api/generate/route.ts` kecuali benar-benar diperlukan.
7. Jangan pernah commit `.env.local` atau menaruh secret di kode client.
8. Jangan menulis ke spreadsheet produksi saat testing tanpa konfirmasi user. Sarankan spreadsheet/tab uji.
9. User belum pernah develop sebelumnya. Jelaskan perubahan dengan bahasa sederhana, sebutkan file yang berubah, dan beri langkah testing yang bisa diikuti.
10. Jika ada keputusan yang belum jelas, tanyakan. Jangan mengarang requirement.

---

## 1. Konteks aplikasi yang ada

Aplikasi ini mengubah task Jira menjadi baris spreadsheet. Stack:

- Next.js 16 dengan App Router dan Turbopack.
- TypeScript.
- CSS Modules (`app/page.module.css`), tanpa UI library.
- Gemini melalui `@google/genai`, model `gemini-3.5-flash`.
- Google Sheets API melalui `googleapis`.
- Jira Cloud REST API read-only.

Alur yang sudah ada:

- `app/page.tsx` — satu halaman client. Tiga sumber: upload file, paste teks, atau ambil dari Jira. Menampilkan preview yang bisa diedit, daftar task non-teknis, fitur re-include, dan tombol commit.
- `app/api/generate/route.ts` — menerima input, memanggil Gemini, mengembalikan preview JSON. **Tidak menulis ke Sheets.**
- `app/api/commit/route.ts` — satu-satunya penulis ke spreadsheet change log. Header 19 kolom. Commit pertama membuat tab baru; commit berikutnya menimpa tab yang sama jika masih ada.
- `app/api/sprints/route.ts` — mengembalikan 5 sprint terbaru dari `app/lib/jira.ts`.
- `app/lib/jira.ts` — mengambil sprint dan issue, merender issue menjadi teks, dan melakukan deduplikasi carry-over dengan `seenKeys`.

Perilaku yang **wajib dipertahankan**:

- Tiga sumber di flow lama tetap berjalan.
- Re-include tetap memakai `FORCE_TECHNICAL_OVERRIDE`.
- Retry Gemini hanya untuk 503/500. **429 tidak boleh di-retry.**
- Batching change log tetap memakai `MAX_CHUNK_CHARS` yang ada.
- Prompt bisnis change log tetap menjadi sumber kebenaran kode `PS-03-YY-ZZZ`.
- `npx tsc --noEmit` harus exit 0.
- `npm run build` bisa gagal karena OOM Turbopack di mesin minim RAM; itu masalah lingkungan, bukan kode. Untuk uji fungsional gunakan `npm run dev`.
- ESLint banyak menandai `any`/`require()`/setState-in-effect. Itu pola lama; jangan bersihkan massal di luar scope.

---

## 2. Tujuan akhir

Setelah pekerjaan selesai:

1. Aplikasi punya **sidebar dengan dua menu**:
   - **TI Kategori Standar** — flow sprint → change log yang sudah ada.
   - **Monthly** — flow baru laporan bulanan 10 kolom.
2. Menu Monthly bisa:
   - Menampilkan daftar sprint dari Jira, difilter per bulan, dengan checkbox.
   - Mengambil task dari sprint terpilih.
   - Menghasilkan laporan 10 kolom sesuai `prompts/monthly.md`.
   - Menampilkan preview yang bisa diedit.
   - Menulis hasil ke **spreadsheet Monthly yang terpisah** dalam **dua tab**.
3. Flow lama tetap berjalan persis seperti sebelumnya.

---

## 3. Keputusan produk yang sudah final

Jangan mengubah keputusan berikut tanpa bertanya ke user.

| Topik | Keputusan |
|---|---|
| Menu | Dua menu: TI Kategori Standar (flow lama) dan Monthly (baru). |
| Lingkup Monthly | YANLIK, 7 aplikasi: Web Komdigi, ShortURL, Seleksi, Portal Layanan Publik, OSS Hub, JDIH Komdigi, Gateway Simponi. |
| Format Monthly | 10 kolom persis seperti master prompt. |
| Pengelompokan baris | AI mengelompokkan mengikuti aturan master prompt, bukan satu baris per aplikasi. |
| Sumber sprint | Tetap 5 sprint terbaru. Tidak perlu mengambil semua sprint. |
| Filter bulan | Berdasarkan `endDate` sprint. Semua sprint di bulan terpilih langsung tercentang; user boleh menghapus centang. |
| Spreadsheet Monthly | File terpisah dari change log, memakai env baru `SPREADSHEET_ID_MONTHLY`. |
| Tab utama | `Monthly <Bulan> <Tahun>`, 10 kolom. |
| Tab kedua | `Follow-up Pemohon <Bulan> <Tahun>`, satu baris per tiket. |
| PEMOHON | Selalu kosong di tabel utama saat commit. User mengisi setelah bertanya ke reporter. |
| Reporter | Ditulis di DATA PENDUKUNG dan di tab Follow-up. |
| Tabel pengecualian | Hanya tampil di web, tidak ditulis ke spreadsheet. |
| Rekap | Hanya tampil di web, tidak ditulis ke spreadsheet. |
| Deploy | Lokal saja. Tidak perlu desain untuk Vercel. |
| Tombol utama | `Generate` berubah menjadi `Tulis ke spreadsheet` setelah preview tersedia. |
| Loading | Modal loading, memakai animasi kucing yang sudah ada. |
| Edit preview | User boleh mengedit sel, menambah baris, dan menghapus baris. |

---

## 4. Non-goals

Jangan kerjakan hal-hal berikut pada iterasi ini:

- Integrasi Grafana, UptimeRobot, MongoDB, atau backend Monthly Report lama di `D:\Sheets\Monthly Report`.
- Autentikasi, multi-user, atau manajemen role.
- Deploy ke Vercel.
- Merge sel, border, atau reproduksi persis tampilan PDF.
- Sinkronisasi otomatis PEMOHON dari tab Follow-up ke tabel utama.
- Mengedit tabel pengecualian atau rekap.
- Mengubah prompt change log yang lama.
- Membersihkan seluruh ESLint warning.

---

## 5. Arsitektur target

Gunakan struktur berikut sebagai acuan. Nama file boleh disesuaikan sedikit, tetapi pemisahan tanggung jawabnya harus sama.

```text
app/
  layout.tsx                     # bungkus children dengan AppShell
  page.tsx                       # flow lama, tetap dipertahankan
  monthly/page.tsx               # halaman baru
  components/
    AppShell.tsx                 # sidebar + area konten
    Sidebar.tsx                  # dua menu, active state
    SprintPicker.tsx             # filter bulan + checkbox
    LoadingOverlay.tsx           # modal loading (bisa diekstrak dari page lama)
    PreviewTable.tsx             # tabel editable dengan kolom konfigurabel
    MonthlySummary.tsx           # ringkasan rekap di atas preview
  api/
    sprints/route.ts             # tambah startDate/endDate
    monthly/generate/route.ts    # baru
    monthly/commit/route.ts      # baru
  lib/
    jira.ts                      # tambah reporter, tanggal sprint, monthly fetch
    sheets.ts                    # helper tulis sheet dengan spreadsheetId + header
    monthly.ts                   # tipe, normalisasi, rekonsiliasi, enrichment
  types/
    monthly.ts                   # tipe data Monthly
prompts/
  monthly.md                     # master prompt, jangan diubah isinya
```

Prinsip:

- **Jangan memindahkan logika bisnis flow lama.** Cukup bungkus tampilannya dengan `AppShell`.
- `AppShell` dan `Sidebar` adalah client component karena butuh `usePathname`.
- `app/layout.tsx` tetap memuat `<html>` dan `<body>`, lalu render `<AppShell>{children}</AppShell>`.
- Flow lama tetap di `/`. Menu kedua di `/monthly`.
- Jika layout lama terlihat sempit karena sidebar, sesuaikan CSS di `AppShell`, bukan dengan mengubah struktur konten flow lama.

---

## 6. Perubahan pada data layer Jira

### 6.1 Daftar sprint

`getRecentSprints()` tetap mengambil 5 sprint terbaru. Tambahkan `startDate` dan `endDate` ke objek yang dikembalikan.

`GET /api/sprints` mengembalikan:

```json
{
  "sprints": [
    {
      "id": 123,
      "name": "Sprint 1 Oktober 2026",
      "state": "closed",
      "startDate": "2026-10-01T00:00:00.000Z",
      "endDate": "2026-10-14T00:00:00.000Z"
    }
  ]
}
```

Field baru harus **backward compatible**: halaman lama yang hanya membaca `id`, `name`, dan `state` tetap berjalan.

### 6.2 Reporter

Tipe `JiraIssue` dan fungsi pencarian issue harus menyertakan `reporter`. Saat merender teks untuk Monthly, sertakan:

- `Task: [KEY] summary`
- `Status`
- `Created`
- `Resolved` jika ada
- `Assignee`
- `Reporter`
- `Priority`
- `Description`
- `Comments`

Jangan mengubah format teks flow lama jika tidak perlu. Lebih aman buat fungsi baru khusus Monthly daripada mengubah `fetchIssuesFromSprint` yang dipakai change log.

### 6.3 Fetch Monthly

Buat fungsi baru, misalnya `fetchMonthlyTasks(sprintIds)`, yang mengembalikan data terstruktur:

```ts
type MonthlySourceTask = {
  key: string;
  summary: string;
  status: string;
  created: string;
  resolved: string | null;
  assignee: string;
  reporter: string;
  description: string;
  comments: string;
  sprintIds: number[];
  url: string;
};
```

Fungsi ini harus:

- Mengambil issue dari setiap sprint terpilih.
- Menghitung `totalEntries` sebelum deduplikasi.
- Deduplikasi berdasarkan Jira key.
- Menyimpan `duplicateEntries` dan `duplicateKeys` untuk rekap.
- Menyimpan semua `sprintIds` tempat task muncul (carry-over).
- Tidak membuang task yang field-nya kosong.

Jangan memakai `seenKeys` yang lama tanpa mencatat statistik duplikasi. Monthly membutuhkan angka duplikat untuk rekonsiliasi.

---

## 7. API Monthly

### 7.1 `POST /api/monthly/generate`

Request:

```json
{
  "sprintIds": [123, 456]
}
```

Validasi:

- `sprintIds` harus array berisi 1–5 ID.
- Semua ID harus berasal dari daftar 5 sprint terbaru.
- Tolak jika kosong.

Response sukses:

```json
{
  "success": true,
  "rows": [
    {
      "no": 1,
      "kegiatan": "Web Komdigi",
      "sasaran_kpi": "...",
      "capaian": "...",
      "rencana_tindak_lanjut": "",
      "tanggal_permohonan": "01-10-2026",
      "tanggal_selesai": "14-10-2026",
      "status": "Done",
      "pemohon": "",
      "data_pendukung": "YANLIK-2916 - Budi Santoso (https://komdigi.atlassian.net/browse/YANLIK-2916)",
      "source_keys": ["YANLIK-2916"],
      "needs_verification": false,
      "verification_note": ""
    }
  ],
  "excluded": [
    {
      "no": 1,
      "key": "YANLIK-3000",
      "summary": "...",
      "assignee": "Rafli Aran",
      "status": "Done",
      "reason": "Assignee termasuk daftar pengecualian",
      "needs_verification": false
    }
  ],
  "rekap": {
    "totalEntries": 87,
    "uniqueTasks": 84,
    "duplicateEntries": 3,
    "includedTasks": 40,
    "includedRows": 12,
    "excludedTasks": 40,
    "needsVerification": 4,
    "reconciliationValid": true
  },
  "meta": {
    "sprints": [],
    "warnings": []
  }
}
```

Response error:

```json
{ "success": false, "error": "pesan yang jelas" }
```

Langkah server:

1. Ambil task dari sprint terpilih.
2. Jalankan prefilter deterministik (lihat bagian 8).
3. Jalankan Tahap 1 AI untuk task yang tersisa.
4. Validasi semua key task tercakup.
5. Jalankan Tahap 2 AI untuk pengelompokan.
6. Validasi keanggotaan grup.
7. Enrich baris secara deterministik.
8. Bentuk tabel pengecualian dan rekap di kode.
9. Kembalikan JSON preview.

Jangan menulis ke Sheets dari endpoint ini.

### 7.2 `POST /api/monthly/commit`

Request:

```json
{
  "rows": [],
  "excluded": [],
  "rekap": {},
  "monthLabel": "Oktober 2026",
  "overwrite": false
}
```

Perilaku:

- Validasi `rows` tidak kosong.
- Gunakan `SPREADSHEET_ID_MONTHLY`. Jika kosong, kembalikan error jelas; **jangan fallback** ke `SPREADSHEET_ID`.
- Tulis dua tab: tabel utama dan follow-up.
- Kembalikan link ke tab utama.

Response sukses:

```json
{
  "success": true,
  "link": "https://docs.google.com/spreadsheets/d/.../edit#gid=...",
  "mainSheetTitle": "Monthly Oktober 2026",
  "followUpSheetTitle": "Follow-up Pemohon Oktober 2026",
  "count": 18,
  "followUpCount": 54
}
```

---

## 8. Pipeline AI dua tahap

Ini bagian paling penting. Jangan meminta AI menyusun seluruh laporan dalam satu panggilan jika task banyak. Pengelompokan membutuhkan pandangan global, sedangkan output panjang berisiko terpotong.

### 8.1 Prefilter deterministik

Sebelum AI:

- Keluarkan task dengan Assignee **Rafli Aran** atau **Eryan**. Cocokkan case-insensitive dan variasi penulisan yang jelas merujuk orang yang sama. Alasan: `Assignee termasuk daftar pengecualian`.
- Jangan menggunakan Reporter untuk pengecualian ini.
- Task yang dikeluarkan di tahap ini tetap masuk tabel pengecualian dan rekap, tetapi tidak perlu dikirim ke AI.
- Normalisasi tanggal, status, URL, dan Reporter di kode.
- `pemohon` selalu string kosong.

### 8.2 Tahap 1 — ekstraksi per task

Prompt Tahap 1 = isi `prompts/monthly.md` (aturan relevan) + kontrak output JSON + teks task.

Output yang diminta:

```json
{
  "tasks": [
    {
      "key": "YANLIK-123",
      "kategori": "Web Komdigi",
      "masuk_laporan": true,
      "alasan_pengecualian": "",
      "kegiatan": "Web Komdigi",
      "sasaran_kpi": "...",
      "capaian": "...",
      "rencana_tindak_lanjut": "",
      "perlu_verifikasi": false,
      "catatan_verifikasi": ""
    }
  ]
}
```

Aturan:

- `kategori` harus salah satu dari 7 aplikasi yang diizinkan.
- `masuk_laporan=false` wajib disertai `alasan_pengecualian` yang spesifik.
- Jika kategori tidak dapat dipastikan, set `perlu_verifikasi=true` dan jangan mengarang.
- Jangan mengisi tanggal, Reporter, link, atau PEMOHON; itu tugas kode.
- Jangan menyalin seluruh judul ke `kegiatan`; ikuti aturan Bagian 9 master prompt.
- `sasaran_kpi` dan `capaian` mengikuti aturan Bagian 11–12 master prompt.
- `rencana_tindak_lanjut` kosong untuk task Done, kecuali sumber menyebut tindak lanjut eksplisit.

Pecah input menjadi beberapa chunk jika perlu. Setelah semua chunk selesai:

- Gabungkan hasil.
- Pastikan setiap key yang dikirim ke AI muncul tepat satu kali.
- Jika ada key yang hilang, ulangi chunk terkait. Jika tetap hilang, tambahkan task itu ke daftar `needs_verification` dengan alasan `Task tidak berhasil dievaluasi oleh AI`. Jangan pernah membuangnya diam-diam.

### 8.3 Tahap 2 — pengelompokan

Input Tahap 2 adalah daftar **ringkas** task yang lolos Tahap 1, bukan deskripsi panjang. Minimal berisi:

- key, kategori, judul ringkas, status, tanggal, assignee, reporter
- kegiatan, sasaran_kpi, capaian, rencana_tindak_lanjut, perlu_verifikasi

Prompt Tahap 2 = aturan pengelompokan master prompt (Bagian 10, 13, 21) + kontrak output JSON.

Output yang diminta:

```json
{
  "rows": [
    {
      "member_keys": ["YANLIK-1", "YANLIK-2"],
      "kegiatan": "...",
      "sasaran_kpi": "...",
      "capaian": "...",
      "rencana_tindak_lanjut": "",
      "perlu_verifikasi": false,
      "catatan_verifikasi": ""
    }
  ]
}
```

Aturan:

- Setiap task yang lolos Tahap 1 harus muncul tepat satu kali di salah satu `member_keys`.
- Jangan menggabungkan task dari aplikasi berbeda.
- Jangan menggabungkan task yang tujuannya berbeda hanya karena tanggal atau sprint-nya sama.
- Jika ragu, pisahkan.
- Jangan mengisi tanggal, status, Reporter, link, atau PEMOHON di Tahap 2; kode yang menghitung.

Setelah output diterima, validasi:

- Union `member_keys` = seluruh key yang lolos.
- Tidak ada key dobel.
- Tidak ada key yang tidak dikenal.

Jika validasi gagal:

1. Coba sekali lagi dengan prompt perbaikan yang menyebut key yang bermasalah.
2. Jika tetap gagal, fallback ke **satu baris per task** untuk task yang bermasalah, set `needs_verification=true`, dan tambahkan warning di `meta.warnings`. Jangan menghilangkan task.

### 8.4 Enrichment deterministik

Kode, bukan AI, yang mengisi:

- `no`
- `tanggal_permohonan` = Created paling awal di antara anggota grup, format `DD-MM-YYYY`.
- `tanggal_selesai` = Resolved paling akhir, **hanya jika semua anggota memiliki Resolved**. Jika ada yang belum, kosongkan.
- `status` = status paling konservatif di antara anggota. Urutan konservatif: `Todo` < `In Progress` < `Testing` < `Done`. Jika ada anggota `Todo`, grup `Todo`. Jika semua Done, `Done`. Jika status tidak dapat dipetakan dengan yakin, pertahankan status asli dan set `needs_verification=true`.
- Validasi `kategori`: jika bukan salah satu dari 7 aplikasi yang diizinkan, pindahkan task ke tabel pengecualian dengan alasan yang jelas. Jika kategori kosong atau tidak pasti, set `needs_verification=true`; jangan mengarang kategori.
- Jangan pernah mengecualikan task hanya karena status Jira-nya `Testing`. Pengecualian testing harus berdasarkan isi pekerjaan, bukan status.
- `pemohon` = `""`.
- `data_pendukung` = satu baris per anggota: `[KEY] - [Reporter] (https://komdigi.atlassian.net/browse/[KEY])`. Gunakan Reporter, bukan Assignee.
- `source_keys`.
- `needs_verification` = true jika salah satu anggota perlu verifikasi.
- Urutan baris: kategori sesuai urutan master prompt, lalu tanggal permohonan naik, lalu ID Jira.
- `rekap` dihitung dari data nyata, bukan dari angka yang disebut user.
- Tabel pengecualian dihitung dari prefilter + Tahap 1 + task yang perlu verifikasi.

### 8.5 Konfigurasi Gemini

- Model: `gemini-3.5-flash`.
- `temperature`: 0.2.
- `responseMimeType`: `application/json`.
- `maxOutputTokens`: 32768.
- Retry hanya untuk 503/500. Jangan retry 429.
- Backoff eksponensial dengan jitter, sama seperti flow lama.
- Budget waktu lokal: 5 menit. Tidak perlu menyesuaikan untuk Vercel.
- Jika output terpotong, pecah chunk dan ulangi. Jangan menerima JSON yang tidak lengkap tanpa penanganan.

---

## 9. Aturan bisnis yang tidak boleh dilanggar

`prompts/monthly.md` adalah sumber lengkap. Ringkasan yang wajib dipatuhi:

1. Setiap tiket unik harus punya keputusan yang dapat ditelusuri: masuk laporan, dikecualikan dengan alasan, atau perlu verifikasi.
2. Exclude Assignee Rafli Aran dan Eryan. Gunakan field Assignee, bukan Reporter.
3. Exclude pekerjaan desain yang berdiri sendiri. Jangan exclude implementasi frontend/perbaikan UI.
4. Exclude pekerjaan testing/QA. Jangan exclude task teknis hanya karena status Jira `Testing`.
5. Exclude dokumentasi/administrasi.
6. Hanya 7 kategori yang boleh masuk. Exclude Design System dan Lain-lain.
7. Tabel utama tepat 10 kolom dengan urutan: NO, KEGIATAN, SASARAN DAN KEY PERFORMANCE INDICATOR, CAPAIAN, RENCANA TINDAK LANJUT / PENDING MATTERS, TANGGAL PERMOHONAN, TANGGAL SELESAI, STATUS, PEMOHON, DATA PENDUKUNG.
8. Satu tabel utama. Jangan memecah per kategori.
9. Pengelompokan hanya jika aplikasi dan tujuan/pekerjaannya sama. Status grup harus konservatif. Tanggal permohonan = paling awal. Tanggal selesai hanya jika semua anggota selesai.
10. Tanggal permohonan dari Created. Tanggal selesai hanya dari bukti eksplisit; jangan menyimpulkan dari Done atau Updated.
11. Status dinormalisasi ke `Todo`, `In Progress`, `Testing`, atau `Done`.
12. PEMOHON selalu kosong.
13. DATA PENDUKUNG memakai format `[ID] - [Reporter] (link)`. Jangan memakai Assignee.
14. Deduplikasi berdasarkan Jira ID. Catat jumlah entri sebelum dan sesudah dedup.
15. Rekap harus memenuhi: `uniqueTasks = includedTasks + excludedTasks + needsVerification`.
16. Jangan mengarang data, tanggal, status, alasan, atau nama.
17. Jangan memaksa jumlah task agar cocok dengan angka yang disebut user. Gunakan angka aktual dari Jira.
18. Urutan kategori: Web Komdigi, ShortURL, Seleksi, Portal Layanan Publik, OSS Hub, JDIH Komdigi, Gateway Simponi. Di dalam kategori, urutkan tanggal permohonan lalu ID.
19. KEGIATAN adalah nama aplikasi/layanan/kelompok kegiatan, bukan seluruh judul tiket.
20. Jangan pernah membuang task tanpa penjelasan.

---

## 10. Data model

Gunakan tipe berikut sebagai acuan. Boleh ditambah field internal, tetapi jangan mengubah nama kolom yang dikirim ke spreadsheet.

```ts
type MonthlyRow = {
  no: number;
  kegiatan: string;
  sasaran_kpi: string;
  capaian: string;
  rencana_tindak_lanjut: string;
  tanggal_permohonan: string;
  tanggal_selesai: string;
  status: string;
  pemohon: string;
  data_pendukung: string;
  source_keys: string[];
  needs_verification: boolean;
  verification_note?: string;
};

type MonthlyExcluded = {
  no: number;
  key: string;
  summary: string;
  assignee: string;
  status: string;
  reason: string;
  needs_verification: boolean;
};

type MonthlyRekap = {
  totalEntries: number;
  uniqueTasks: number;
  duplicateEntries: number;
  includedTasks: number;
  includedRows: number;
  excludedTasks: number;
  needsVerification: number;
  reconciliationValid: boolean;
};
```

Simpan metadata internal per baris (misalnya `source_tasks` lengkap dengan Reporter dan judul) untuk membangun tab Follow-up dan panel detail. Jangan hanya menyimpan string `data_pendukung`.

---

## 11. UI dan UX

### 11.1 Sidebar

- Dua item:
  - **TI Kategori Standar** → `/` (flow lama)
  - **Monthly** → `/monthly`
- Beri subjudul kecil agar jelas:
  - `TI Kategori Standar` — "Sprint → Change Log"
  - `Monthly` — "Laporan bulanan"
- Active state jelas.
- Gaya mengikuti tema pixel/kucing yang sudah ada. Jangan memakai UI library baru.
- Lebar sekitar 220–240px. Di layar sempit, sidebar bisa menjadi top bar atau tombol buka/tutup.
- Jangan mengubah judul `SPRINT ⇢ SHEET` di halaman lama.

### 11.2 Halaman Monthly

Susun dari atas ke bawah:

1. Judul dan penjelasan singkat.
2. Pemilih bulan.
3. Daftar sprint dengan checkbox.
4. Tombol utama.
5. Ringkasan hasil setelah generate.
6. Tab preview.
7. Tombol commit.

Pemilih sprint:

- Ambil data dari `/api/sprints`.
- Buat daftar bulan unik dari `endDate` sprint. Jika `endDate` kosong, gunakan `startDate`; jika keduanya kosong, tampilkan di grup `Tanpa tanggal`.
- Default bulan = bulan sprint terbaru.
- Saat bulan berganti, tampilkan sprint yang `endDate`-nya di bulan itu.
- Semua sprint di bulan itu tercentang otomatis saat pertama kali bulan dipilih.
- Sediakan "Pilih semua" dan "Kosongkan".
- Tampilkan nama sprint, state, tanggal mulai–selesai.
- Jika tidak ada sprint di bulan itu, tampilkan pesan kosong yang jelas.
- Tombol Generate disabled jika tidak ada sprint terpilih.

Loading:

- Pakai modal overlay yang sudah ada, termasuk animasi kucing.
- Tahapan yang ditampilkan harus sesuai proses nyata: mengambil task, menghapus duplikat, mengevaluasi task, menyusun laporan, menghitung rekap.
- Progress bar boleh tetap simulasi, tetapi jangan menampilkan pesan yang tidak sesuai tahap.
- Karena lokal, request bisa lama. Beri tombol batal hanya jika implementasinya memungkinkan; jika tidak, tampilkan perkiraan bahwa proses bisa beberapa menit.

Preview:

- Ringkasan di atas tabel:
  - `87 entri dibaca`
  - `84 task unik`
  - `3 duplikat dihilangkan`
  - `40 task masuk`
  - `12 baris laporan`
  - `40 dikecualikan`
  - `4 perlu verifikasi`
- Tiga tab:
  - **Tabel Utama** — editable.
  - **Tidak Masuk Laporan** — read-only.
  - **Rekap** — read-only.
- Tabel utama:
  - Kolom NO tidak bisa diedit; nomor dihitung ulang otomatis.
  - Kolom panjang (`SASARAN`, `CAPAIAN`, `RENCANA`, `DATA PENDUKUNG`) memakai textarea multiline.
  - Kolom NO dan KEGIATAN tetap terlihat saat horizontal scroll jika memungkinkan.
  - Tombol tambah baris dan hapus baris.
  - Tampilkan badge jumlah task sumber per baris.
  - Baris yang `needs_verification` diberi penanda visual.
- Tabel pengecualian:
  - Kolom: NO, ID TIKET, JUDUL, ASSIGNEE, STATUS, ALASAN.
  - Tidak bisa diedit.
- Rekap:
  - Tampilkan angka dan status validasi.
  - Jika `reconciliationValid=false`, tampilkan peringatan merah dan jelaskan selisihnya.

Tombol:

- Sebelum generate: `Generate`.
- Saat generate: `Meracik data...`.
- Setelah preview ada: `Tulis ke spreadsheet`.
- Saat commit: `Menulis ke spreadsheet...`.
- Setelah commit: tampilkan link dan status berhasil.
- Jika user mengedit preview, tombol tetap di mode commit.
- Jika user menekan generate ulang saat preview sudah diedit, tampilkan konfirmasi bahwa editan akan hilang.

Commit:

- Sebelum menulis, jika tab bulan yang sama sudah ada, minta konfirmasi timpa.
- Setelah sukses, tampilkan link ke spreadsheet Monthly dan sebutkan bahwa ada dua tab.

Error:

- Tampilkan pesan yang bisa ditindaklanjuti, bukan stack trace.
- Contoh: env Monthly belum diset, service account tidak punya akses, Jira gagal, Gemini overload, output AI tidak lengkap.

---

## 12. Layout spreadsheet

### 12.1 Tab utama

Nama: `Monthly <Bulan> <Tahun>`, contoh `Monthly Oktober 2026`.

Header tepat 10 kolom:

```text
NO
KEGIATAN
SASARAN DAN KEY PERFORMANCE INDICATOR
CAPAIAN
RENCANA TINDAK LANJUT / PENDING MATTERS
TANGGAL PERMOHONAN
TANGGAL SELESAI
STATUS
PEMOHON
DATA PENDUKUNG
```

Nilai:

- `NO` berurutan 1..N.
- `PEMOHON` selalu kosong.
- `DATA PENDUKUNG` boleh multiline.
- `CAPAIAN` boleh multiline.
- Tanggal ditulis sebagai teks `DD-MM-YYYY` agar tidak berubah format karena locale.
- Jangan menambahkan kolom lain.

Format:

- Baris header di-freeze.
- Wrap text aktif untuk seluruh sel.
- Vertical alignment atas.
- Lebar kolom diatur agar terbaca; `CAPAIAN` dan `DATA PENDUKUNG` lebih lebar.
- Merge sel tidak diperlukan pada versi ini.

### 12.2 Tab Follow-up

Nama: `Follow-up Pemohon <Bulan> <Tahun>`.

Header:

```text
Reporter
Jira ID
Judul Task
Kegiatan
Baris Laporan
Status Follow-up
Pemohon
Link Jira
```

Aturan:

- Satu baris per tiket yang masuk ke tabel utama.
- Urutkan berdasarkan Reporter, lalu Jira ID, agar mudah ditanyakan per orang.
- `Baris Laporan` = nilai NO baris utama tempat tiket itu berada.
- `Status Follow-up` default `Belum ditanya`.
- `Pemohon` kosong.
- `Link Jira` = URL tiket.
- Sertakan Reporter `Unassigned` jika kosong; jangan disembunyikan.
- Tab ini ditulis saat commit, bukan saat generate.

### 12.3 Preservation saat commit ulang

Ini wajib:

1. Sebelum menulis tab Follow-up, baca nilai yang sudah ada.
2. Buat map berdasarkan `Jira ID`.
3. Untuk ID yang masih ada, pertahankan `Status Follow-up` dan `Pemohon`.
4. Untuk ID baru, isi `Belum ditanya` dan `Pemohon` kosong.
5. Perbarui `Baris Laporan` jika urutan tabel utama berubah.
6. Jangan menghapus jawaban user hanya karena generate ulang.

Jika tab utama ditimpa, kolom PEMOHON di tabel utama akan kembali kosong. Itu diterima; jawaban tetap aman di tab Follow-up. Beri tahu user di UI.

### 12.4 Penamaan dan konflik tab

- Jika tab utama sudah ada dan `overwrite=false`, buat nama baru dengan suffix ` (2)`, ` (3)`, dst.
- Jika `overwrite=true`, timpa tab utama dan tab follow-up dengan nama yang sama.
- Jangan menimpa tab change log.
- Link yang dikembalikan harus mengarah ke tab utama Monthly.

---

## 13. Environment dan akses

Tambahkan satu variabel baru di `.env.local`:

```text
SPREADSHEET_ID_MONTHLY=...
```

Variabel lama tetap:

```text
GEMINI_API_KEY
GOOGLE_SERVICE_ACCOUNT_JSON
SPREADSHEET_ID
JIRA_BASE_URL
JIRA_EMAIL
JIRA_API_TOKEN
JIRA_PROJECT_KEY
```

Catatan:

- Service account Google yang sama harus diberi akses **Editor** ke spreadsheet Monthly.
- Jangan fallback ke `SPREADSHEET_ID` jika `SPREADSHEET_ID_MONTHLY` kosong.
- Jangan pernah mengirim service account JSON ke client.
- Jangan commit `.env.local`.

---

## 14. Edge cases yang wajib ditangani

- Sprint terpilih tidak punya task.
- Task carry-over muncul di dua sprint.
- Reporter kosong atau `Unassigned`.
- Assignee kosong.
- Status Jira tidak dikenal.
- Task tanpa deskripsi.
- Task tanpa tanggal Resolved.
- Task yang hanya punya judul.
- Kategori tidak dikenal.
- Task yang perlu verifikasi.
- AI mengembalikan key yang tidak ada di sumber.
- AI menghilangkan key.
- AI menggandakan key.
- Output AI terpotong.
- Gemini 503 setelah semua retry.
- Gemini 429.
- Jira API error.
- Spreadsheet Monthly belum diset.
- Service account tidak punya akses.
- Tab dengan nama yang sama sudah ada.
- Tab Follow-up sudah berisi jawaban user.
- User mengedit preview lalu generate ulang.
- User menghapus baris yang berisi beberapa task.
- User menambah baris manual tanpa task sumber.
- Bulan terpilih tidak ada di 5 sprint terbaru.
- Teks panjang melebihi lebar sel.

Untuk setiap edge case, pilih perilaku yang **tidak menghilangkan data** dan beri pesan yang jelas.

---

## 15. Pengujian dan acceptance criteria

### 15.1 Perintah wajib

```bash
npx tsc --noEmit
npm run dev
```

`npx tsc --noEmit` harus exit 0. Jangan mengandalkan `npm run build` karena bisa OOM di mesin ini.

### 15.2 Regression flow lama

- Buka `/`.
- Pastikan sidebar muncul dan menu TI Kategori Standar aktif.
- Uji paste teks dari `verifikasi/contoh-sprint.txt`.
- Pastikan hasil change log tetap 10 baris teknis dan 4 task non-teknis.
- Pastikan re-include masih berfungsi.
- Pastikan commit change log tetap menulis ke spreadsheet lama, bukan spreadsheet Monthly.
- Pastikan tampilan lama tidak rusak karena sidebar.

### 15.3 Monthly satu sprint

- Buka `/monthly`.
- Pilih bulan yang memiliki sprint.
- Pastikan semua sprint di bulan itu tercentang.
- Generate.
- Pastikan preview punya 10 kolom.
- Pastikan tabel pengecualian dan rekap terisi.
- Pastikan tidak ada ID yang hilang atau dobel.
- Pastikan `reconciliationValid=true`, atau jika false, selisihnya dijelaskan.
- Commit ke spreadsheet uji.
- Pastikan dua tab terbentuk dan kolomnya benar.
- Pastikan PEMOHON kosong.
- Pastikan DATA PENDUKUNG memuat Reporter dan link.
- Pastikan tab Follow-up berisi satu baris per tiket.

### 15.4 Monthly multi-sprint

- Pilih 2–3 sprint.
- Pastikan task carry-over tidak dihitung dua kali sebagai task unik, tetapi jumlah entri dan duplikatnya muncul di rekap.
- Pastikan pengelompokan tidak menggabungkan aplikasi berbeda.

### 15.5 Commit ulang

- Isi beberapa `Status Follow-up` dan `Pemohon` di tab Follow-up.
- Generate ulang atau commit ulang.
- Pastikan jawaban yang sudah diisi tetap ada untuk Jira ID yang sama.
- Pastikan baris baru mendapat status `Belum ditanya`.

### 15.6 Error

- Kosongkan `SPREADSHEET_ID_MONTHLY`, pastikan muncul error jelas dan tidak menulis ke spreadsheet lama.
- Pilih bulan tanpa sprint, pastikan muncul pesan kosong.
- Cabut akses service account sementara, pastikan error permission terbaca.

### 15.7 Acceptance checklist

- [ ] Sidebar dua menu berfungsi.
- [ ] Flow lama tidak berubah perilakunya.
- [ ] `/api/sprints` mengembalikan `startDate` dan `endDate`.
- [ ] Monthly memakai 5 sprint terbaru.
- [ ] Filter bulan dan checkbox berfungsi.
- [ ] Generate menampilkan modal loading.
- [ ] Preview 10 kolom bisa diedit.
- [ ] NO otomatis dan tidak bisa diedit.
- [ ] Tombol berubah dari Generate menjadi Tulis ke spreadsheet.
- [ ] Tabel pengecualian dan rekap hanya di web.
- [ ] Commit menulis dua tab ke spreadsheet Monthly.
- [ ] Tab utama tepat 10 kolom dan PEMOHON kosong.
- [ ] Tab Follow-up berisi Reporter, ID, judul, kegiatan, baris laporan, status, pemohon, link.
- [ ] Jawaban Follow-up dipertahankan saat commit ulang.
- [ ] Tidak ada penulisan ke spreadsheet change log dari Monthly.
- [ ] `npx tsc --noEmit` exit 0.
- [ ] Error penting ditangani dengan pesan jelas.

---

## 16. Urutan implementasi yang disarankan

### Fase 1 — Shell dan sidebar

- Buat `AppShell` dan `Sidebar`.
- Bungkus `app/layout.tsx`.
- Tambah halaman `/monthly` kosong.
- Pastikan flow lama masih berjalan.
- `npx tsc --noEmit`.

### Fase 2 — Data sprint

- Tambah `startDate`/`endDate` ke `getRecentSprints` dan `/api/sprints`.
- Buat `SprintPicker` dengan filter bulan dan checkbox.
- Tampilkan daftar sprint di `/monthly`.
- Belum ada AI.
- `npx tsc --noEmit`.

### Fase 3 — Generate satu sprint

- Buat `fetchMonthlyTasks`.
- Buat prefilter assignee.
- Buat Tahap 1 AI.
- Tampilkan preview tabel utama sederhana.
- Uji dengan satu sprint.
- `npx tsc --noEmit`.

### Fase 4 — Grouping dan rekonsiliasi

- Buat Tahap 2 AI.
- Validasi keanggotaan grup.
- Buat tabel pengecualian dan rekap.
- Tambah tab preview.
- `npx tsc --noEmit`.

### Fase 5 — Commit dua tab

- Buat helper `sheets.ts`.
- Buat endpoint commit Monthly.
- Tulis tab utama dan follow-up.
- Implementasikan preservation.
- Tambah formatting dasar.
- `npx tsc --noEmit`.

### Fase 6 — Polish

- Loading modal dan state tombol.
- Konfirmasi generate ulang.
- Pesan error.
- Uji regresi flow lama.
- Uji end-to-end.

Jangan menggabungkan semua fase dalam satu perubahan besar. Setiap fase harus bisa diuji sendiri.

---

## 17. Yang harus dilaporkan setelah selesai

Setelah implementasi, laporkan:

1. Ringkasan apa yang ditambahkan.
2. Daftar file baru dan file yang diubah.
3. Hasil `npx tsc --noEmit`.
4. Skenario yang sudah diuji dan hasilnya.
5. Hal yang belum diuji atau masih perlu keputusan user.
6. Perubahan environment yang harus dilakukan user.
7. Batasan yang masih ada.

Jangan mengklaim berhasil jika commit ke spreadsheet belum benar-benar diuji. Bedakan antara "kode selesai" dan "sudah diverifikasi end-to-end".
