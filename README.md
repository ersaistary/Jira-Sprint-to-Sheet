# Sprint → Sheet 🐾

Aplikasi otomatisasi untuk mengubah task Jira (sprint report) menjadi dokumen pelaporan rapi di Google Sheets menggunakan Next.js dan Gemini AI.

Tersedia 2 modul utama yang dapat diakses melalui Sidebar di sisi kiri:
1. **TI Standar (`/`)**: Mengubah sprint Jira / file export menjadi baris **Change Log** (format kode `PS-03-YY-ZZZ`) di Google Sheets.
2. **Monthly (`/monthly`)**: Menyusun **Laporan Capaian Layanan Publik 10 Kolom (Yanlik)** dari sprint Jira bulanan ke Google Sheets, lengkap dengan grouping AI multi-tahap dan pelacakan tiket follow-up pemohon.

---

## ✨ Fitur Utama

### 1. Modul TI Standar (Change Log Sprint)
- **Sumber Data Fleksibel:** Integrasi langsung Jira Cloud API, upload dokumen export Jira (`.docx`, `.txt`), atau paste teks manual.
- **Klasifikasi AI Gemini:**
  - Memilah task **teknis** (masuk sheet) vs **non-teknis** (dokumentasi, QA/testing mandiri, helpdesk).
  - Merakit kode perubahan otomatis (`PS-03-YY-ZZZ` di mana `YY=02` untuk aplikasi Yanlik dan `YY=00` untuk aplikasi non-yanlik).
  - Mengisi tanggal, status, sistem/lokasi, inisiasi, detail, hasil, dan dampak.
- **Re-include Manual:** Pengguna dapat mencentang task non-teknis agar dipaksa masuk ke tabel teknis jika diinginkan.
- **Tulis ke Sheets:** Membuat tab baru otomatis di spreadsheet Change Log.

### 2. Modul Monthly (Laporan Capaian Yanlik 10 Kolom)
- **Sprint Picker Cerdas:** Filter sprint berdasarkan bulan dan pemilihan sprint (hingga 5 sprint sekaligus) dengan deteksi carry-over duplikat tiket.
- **Prefilter Deterministik:** Otomatis memisahkan tiket atas nama assignee tertentu (Rafli Aran & Eryan) sebelum pemrosesan AI untuk menghemat kuota token.
- **Pipeline Gemini AI 2-Tahap:**
  - **Tahap 1 (Evaluasi):** Memfilter 7 aplikasi Yanlik (*Web Komdigi, ShortURL, Seleksi, Portal Layanan Publik, OSS Hub, JDIH Komdigi, Gateway Simponi*) dan mengecualikan pekerjaan desain mockup murni / testing QA / administrasi.
  - **Tahap 2 (Grouping):** Mengelompokkan tiket-tiket sejenis/semodul menjadi satu baris kegiatan capaian yang koheren tanpa ada tiket yang tercecer.
- **Preview Interaktif 3-Tab:**
  - **Tab 1 (Tabel Utama):** 10 kolom laporan capaian. Sel dapat diedit langsung, serta mendukung tambah dan hapus baris.
  - **Tab 2 (Tidak Masuk Laporan):** Daftar tiket yang dikecualikan beserta alasan penolakannya (tampilan kontras tinggi).
  - **Tab 3 (Rekapitulasi & Validasi):** Rekap kuantitatif tiket masuk, baris gabungan, duplikat, dan tiket yang membutuhkan verifikasi manusia.
- **Tulis 2 Tab ke Google Sheets:**
  - **Tab 1 (`Monthly [Bulan]`):** Format 10 kolom standar (kolom `PEMOHON` sengaja dikosongkan untuk diisi manual).
  - **Tab 2 (`Follow-up Pemohon [Bulan]`):** 8 kolom data pendukung (Reporter, Jira ID, Summary, Kegiatan, Baris Ke, Status Follow-up, Pemohon, Link Jira).
- **Preservasi Data Follow-up:** Jika tab ditimpa (*re-commit*), isian manual user pada kolom `Status Follow-up` dan `Pemohon` di Google Sheets **tidak akan terhapus / tetap tersimpan**.
- **Dialog Keamanan:** Peringatan sebelum menimpa tab yang sudah ada dan peringatan jika melakukan *Generate Ulang* saat tabel preview telah diedit manual.

---

## 🧰 Prasyarat

- **Node.js 18+** dan **npm**
- **Google Gemini API Key** (Google AI Studio)
- **Google Cloud Service Account** (dengan API Google Sheets aktif)
- **2 Google Spreadsheet kosong** (atau 1 spreadsheet dengan tab berbeda):
  1. Spreadsheet untuk Change Log TI Standar
  2. Spreadsheet untuk Laporan Monthly Yanlik
- **Akun Jira Cloud** (Email + API Token)

---

## 🚀 Instalasi

1. Clone repositori dan masuk ke direktori:
   ```bash
   git clone <url-repo-ini>
   cd auto-sprint-doc
   ```

2. Install dependensi:
   ```bash
   npm install
   ```

3. Pastikan aset pixel loader tersedia di folder `public/`:
   - `cat-loading-base.png`
   - `cat-pupil-left.png`
   - `cat-pupil-right.png`

---

## 🔑 Setup Environment Variables

Buat atau perbarui file `.env.local` di root project:

```env
# Google Gemini AI
GEMINI_API_KEY=AIzaSy...

# Google Cloud Service Account (satu baris penuh JSON)
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"..."}

# Spreadsheet Change Log (Menu: TI Standar)
SPREADSHEET_ID=1abc...

# Spreadsheet Laporan Bulanan (Menu: Monthly)
SPREADSHEET_ID_MONTHLY=1xyz...

# Jira Cloud API
JIRA_BASE_URL=https://namaorganisasi.atlassian.net
JIRA_EMAIL=email_kamu@domain.com
JIRA_API_TOKEN=token_jira_kamu
JIRA_PROJECT_KEY=YANLIK
```

### Panduan Singkat Variabel:

1. **`GEMINI_API_KEY`**: Didapatkan dari [Google AI Studio](https://aistudio.google.com/apikey).
2. **`GOOGLE_SERVICE_ACCOUNT_JSON`**: Service Account dari Google Cloud Console dengan Google Sheets API aktif. Unduh key JSON, lalu masukkan seluruh isi file JSON tersebut dalam satu baris.
3. **`SPREADSHEET_ID` & `SPREADSHEET_ID_MONTHLY`**:
   - Diambil dari URL Google Sheets: `https://docs.google.com/spreadsheets/d/`**`<ID_SPREADSHEET>`**`/edit`.
   - **PENTING:** Buka masing-masing Google Spreadsheet di browser, klik **Share (Bagikan)**, lalu tambahkan email `client_email` dari Service Account sebagai **Editor**.
4. **`JIRA_API_TOKEN`**: Dibuat dari [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens).

---

## ▶️ Menjalankan Aplikasi

Jalankan server development:

```bash
npm run dev
```

Buka browser di [http://localhost:3000](http://localhost:3000):
- Buka `/` untuk menu **TI Standar** (Sprint Change Log).
- Buka `/monthly` untuk menu **Monthly** (Laporan Capaian Layanan Publik).

---

## 📁 Struktur Project

```
├── app/
│   ├── layout.tsx                     # Root layout & inisialisasi AppShell
│   ├── page.tsx                       # UI Menu TI Standar (Sprint -> Change Log)
│   ├── page.module.css                # Styling menu TI Standar
│   ├── monthly/
│   │   ├── page.tsx                   # UI Menu Monthly (Sprint Picker, Preview 3-Tab, Commit)
│   │   └── monthly.module.css         # Styling menu Monthly & tabel preview
│   ├── components/
│   │   ├── AppShell.tsx               # Wrapper layout + Sidebar
│   │   ├── Sidebar.tsx                # Navigasi kiri (TI Standar & Monthly)
│   │   ├── SprintPicker.tsx           # Komponen pemilih sprint bulanan
│   │   └── LoadingOverlay.tsx         # Modal loading pixel art dengan progress bar
│   ├── types/
│   │   └── monthly.ts                 # Definisi tipe data modul Monthly
│   ├── lib/
│   │   ├── jira.ts                    # Klien Jira REST API (Agile & JQL)
│   │   ├── monthly.ts                 # Logika bisnis Monthly (Prefilter, AI Tahap 1 & 2)
│   │   └── sheets.ts                  # Integrasi Google Sheets API (Styling & Preservasi)
│   └── api/
│       ├── sprints/route.ts           # Endpoint daftar sprint aktif/terbaru
│       ├── generate/route.ts          # Endpoint generate Change Log TI Standar
│       ├── commit/route.ts            # Endpoint commit Change Log TI Standar
│       └── monthly/
│           ├── generate/route.ts      # Pipeline AI Laporan Monthly
│           └── commit/route.ts        # Penulisan 2 Tab ke SPREADSHEET_ID_MONTHLY
├── public/                            # Aset ikon dan pixel art kucing
├── .env.local                         # Kredensial lokal (jangan di-commit ke Git)
└── README.md                          # Panduan dokumentasi proyek
```

---

## 🛠️ Verifikasi & Kode Kualitas

Untuk memeriksa keabsahan type checking TypeScript:
```bash
npx tsc --noEmit
```

Untuk menjalankan linter ESLint:
```bash
npm run lint
```

---

## 📄 Lisensi

Internal use — sesuaikan dengan kebutuhan tim dan organisasi Anda.
