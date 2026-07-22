# Sprint → Sheet 🐾

Otomatisasi untuk mengubah export task Jira (sprint report) menjadi baris-baris Change Log/Sprint Report yang rapi di Google Sheets — lengkap dengan klasifikasi task teknis vs non-teknis, pemetaan kode perubahan, dan tab baru otomatis setiap kali generate.

## ✨ Fitur

- Upload file export Jira (`.pdf`, `.docx`, `.txt`) atau paste teks manual.
- AI (Gemini) otomatis:
  - Memilah task **teknis** (masuk sheet) vs **non-teknis** — testing, dokumentasi, Helpdesk (ditampilkan terpisah, tidak masuk sheet).
  - Mengisi kode perubahan (PS-03-00-XXX), tanggal, status, lokasi/sistem, inisiasi, detail, hasil, dan dampak sesuai aturan yang sudah ditanam di prompt.
- Setiap generate membuat **tab baru** di Google Sheets (tidak menimpa data lama), lengkap dengan header.
- Loading screen dengan progress bar + karakter kucing pixel-art.

## 🧰 Prasyarat

- Node.js 18+ dan npm
- Akun Google (untuk Gemini API key & Google Sheets API)
- Satu Google Spreadsheet kosong yang akan dipakai sebagai tujuan

## 🚀 Instalasi

```bash
git clone <url-repo-ini>
cd <folder-repo>
npm install
```

Pastikan juga sudah install dependency AI-nya (kalau belum ada di `package.json`):

```bash
npm install @google/genai googleapis mammoth pdf-parse-fork
```

Taruh 3 file gambar kucing (`cat-loading-base.png`, `cat-pupil-left.png`, `cat-pupil-right.png`) ke folder `public/` di root project (sejajar dengan folder `app/`).

## 🔑 Setup Environment Variables

Buat file `.env.local` di root project (sejajar `package.json`), isi 3 variabel berikut:

```env
GEMINI_API_KEY=
GOOGLE_SERVICE_ACCOUNT_JSON=
SPREADSHEET_ID=
```

### 1. `GEMINI_API_KEY`

1. Buka [Google AI Studio](https://aistudio.google.com/apikey).
2. Login pakai akun Google kamu.
3. Klik **Create API key** (atau **Get API key** → **Create API key in new project**).
4. Copy API key yang muncul, paste ke `GEMINI_API_KEY` di `.env.local`.

> ⚠️ Jangan commit API key ini ke GitHub. File `.env.local` sudah otomatis di-ignore lewat `.gitignore` (lihat di bawah).

### 2. `GOOGLE_SERVICE_ACCOUNT_JSON`

Ini dipakai supaya server bisa menulis ke Google Sheets kamu atas nama "robot" (service account), bukan akun pribadi.

1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Buat project baru (atau pakai project yang sudah ada) lewat dropdown project di kiri atas.
3. Di search bar atas, cari **"Google Sheets API"** → buka halamannya → klik **Enable**.
4. Di menu kiri, buka **IAM & Admin** → **Service Accounts** → klik **Create Service Account**.
5. Isi nama bebas (mis. `sprint-sheet-bot`) → **Create and Continue** → role bisa di-skip (klik **Continue**) → **Done**.
6. Klik service account yang baru dibuat → tab **Keys** → **Add Key** → **Create new key** → pilih **JSON** → **Create**.
7. File JSON otomatis ke-download. Buka file itu, copy **seluruh isinya** (satu baris penuh, minify), lalu paste sebagai value `GOOGLE_SERVICE_ACCOUNT_JSON` di `.env.local`.
   - Karena ini JSON di dalam file `.env`, pastikan tetap dalam **satu baris** tanpa line break. Contoh:
     ```env
     GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",...}
     ```
8. **Penting:** buka Google Spreadsheet tujuan kamu → klik **Share/Bagikan** → tambahkan email service account (bentuknya seperti `sprint-sheet-bot@nama-project.iam.gserviceaccount.com`, ada di file JSON field `client_email`) → beri akses **Editor**. Tanpa langkah ini, server akan gagal menulis ke sheet (error permission denied).

### 3. `SPREADSHEET_ID`

1. Buka Google Spreadsheet tujuan kamu di browser.
2. Lihat URL-nya, formatnya:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_ADA_DI_SINI/edit
   ```
3. Copy bagian `SPREADSHEET_ID_ADA_DI_SINI` (antara `/d/` dan `/edit`), paste ke `.env.local`.

## ▶️ Menjalankan

```bash
npm run dev
```

Buka `http://localhost:3000`.

## 📋 Cara Export Data dari Jira

1. Buka board/project Jira kamu → masuk ke menu **List**.
2. Klik ikon **titik tiga (⋯)** di pojok kanan atas.
3. Pilih **Export**.
4. Pilih format **Docs** (Word/HTML).
5. File akan ke-download — tinggal upload file itu langsung ke web app ini (drag & drop / pilih file), tanpa perlu diedit dulu.

## 📁 Struktur Project (relevan)

```
app/
  page.tsx           # UI utama (upload, loading screen, hasil)
  page.module.css    # Semua styling (CSS Module)
  api/
    generate/
      route.ts       # Ekstraksi teks -> panggil Gemini -> tulis ke Google Sheets
public/
  cat-loading-base.png
  cat-pupil-left.png
  cat-pupil-right.png
.env.local           # Kredensial (JANGAN di-commit)
```

## 🛠️ Troubleshooting Singkat

- **Error 404 model Gemini** → Google cukup sering retire model lama. Cek [dokumentasi model Gemini terbaru](https://ai.google.dev/gemini-api/docs/models) dan ganti nilai `MODEL_NAME` di `app/api/generate/route.ts`.
- **Error permission saat nulis ke Sheets** → pastikan email service account (`client_email` di JSON) sudah di-share sebagai Editor di spreadsheet tujuan.
- **AI mengembalikan format tidak valid / kepotong** → dokumen terlalu panjang, coba split jadi beberapa bagian lebih kecil.

## 📄 Lisensi

Internal use — sesuaikan dengan kebutuhan tim kamu.