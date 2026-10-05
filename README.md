# Sprint → Sheet 🐾

Otomatisasi untuk mengubah task Jira (sprint report) menjadi baris-baris Change Log/Sprint Report yang rapi di Google Sheets — lengkap dengan klasifikasi task teknis vs non-teknis, pemetaan kode perubahan, preview editable sebelum ditulis, dan tab baru otomatis setiap commit.

## ✨ Fitur

- **3 sumber data:**
  - 📁 Upload file export Jira (`.pdf`, `.docx`, `.txt`).
  - 📝 Paste teks Jira manual.
  - ⚡ **Langsung dari Jira API** — ambil task dari project `YANLIK` (board ID 15), pilih maks. 2 sprint dari dropdown 5 sprint terbaru (kosongkan = otomatis 2 sprint terakhir).
- **AI (Gemini)** otomatis:
  - Memilah task **teknis** (masuk sheet) vs **non-teknis** — testing/QA, dokumentasi, Helpdesk, Metabase, dsb. (ditampilkan terpisah, tidak masuk sheet).
  - Mengisi kode perubahan (PS-03-00-XXX), tanggal, pelaksana, status, lokasi/sistem, inisiasi, detail, hasil, dan dampak sesuai aturan yang ditanam di prompt.
- **Preview tabel editable** — hasil AI tampil sebagai tabel yang bisa diedit per-sel dan dihapus per-baris **sebelum** ditulis ke Sheets. Tidak ada penulisan otomatis.
- **Re-include (regenerate parsial)** — task non-teknis yang seharusnya masuk bisa di-centang; sistem memproses **hanya task terpilih** (hemat kuota & cepat), memaksa AI memasukkannya sebagai teknis, lalu merge dengan baris yang sudah ada.
- **Commit ke Sheets** — commit pertama membuat **tab baru**; commit berikutnya **menimpa (overwrite) tab yang sama** selama tab-nya masih ada.
- Teks panjang otomatis dipecah per-batch (~90rb karakter ≈ 1 sprint penuh = 1 request AI) supaya hemat kuota.
- Loading screen dengan progress bar + karakter kucing pixel-art.

## 🧰 Prasyarat

- Node.js 20.9+ dan npm (Next.js 16 butuh Node 20+)
- Akun Google (untuk Gemini API key & Google Sheets API)
- Satu Google Spreadsheet kosong sebagai tujuan
- (Opsional, untuk mode ⚡ Jira) akses ke board Jira Cloud + API token

## 🚀 Instalasi

```bash
git clone <url-repo-ini>
cd <folder-repo>
npm install
```

Dependency utama sudah terdaftar di `package.json`: `@google/genai`, `googleapis`, `mammoth`, `pdf-parse-fork`.

Taruh 3 file gambar kucing (`cat-loading-base.png`, `cat-pupil-left.png`, `cat-pupil-right.png`) ke folder `public/` di root project (sejajar dengan folder `app/`).

## 🔑 Setup Environment Variables

Buat file `.env.local` di root project (sejajar `package.json`). File ini sudah di-ignore oleh `.gitignore` — **jangan commit**.

```env
# AI + Google Sheets (wajib)
GEMINI_API_KEY=
GOOGLE_SERVICE_ACCOUNT_JSON=
SPREADSHEET_ID=

# Jira API (wajib HANYA kalau pakai mode ⚡ Dari Jira)
JIRA_BASE_URL=https://xxxxx.atlassian.net
JIRA_EMAIL=
JIRA_API_TOKEN=
JIRA_PROJECT_KEY=YANLIK
```

### 1. `GEMINI_API_KEY`

1. Buka [Google AI Studio](https://aistudio.google.com/apikey).
2. Login pakai akun Google kamu.
3. Klik **Create API key** (atau **Get API key** → **Create API key in new project**).
4. Copy API key yang muncul, paste ke `GEMINI_API_KEY`.

> ⚠️ Free tier Gemini punya kuota harian yang tipis (reset tengah malam waktu Pasifik). Kalau tool dipakai rutin tiap sprint, pertimbangkan pasang billing.

### 2. `GOOGLE_SERVICE_ACCOUNT_JSON`

Dipakai supaya server bisa menulis ke Google Sheets atas nama "robot" (service account), bukan akun pribadi.

1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Buat/pilih project lewat dropdown di kiri atas.
3. Cari **"Google Sheets API"** → buka → klik **Enable**.
4. Menu kiri: **IAM & Admin** → **Service Accounts** → **Create Service Account**.
5. Isi nama bebas (mis. `sprint-sheet-bot`) → **Create and Continue** → role di-skip → **Done**.
6. Buka service account-nya → tab **Keys** → **Add Key** → **Create new key** → **JSON** → **Create**.
7. File JSON ke-download. Copy **seluruh isinya dalam satu baris** (minify), paste sebagai value `GOOGLE_SERVICE_ACCOUNT_JSON`:
   ```env
   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",...}
   ```
8. **Penting:** buka Spreadsheet tujuan → **Share/Bagikan** → tambahkan email service account (field `client_email` di JSON, bentuknya `sprint-sheet-bot@nama-project.iam.gserviceaccount.com`) → akses **Editor**. Tanpa ini, commit gagal dengan permission denied.

### 3. `SPREADSHEET_ID`

1. Buka Spreadsheet tujuan di browser.
2. URL-nya berformat:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_ADA_DI_SINI/edit
   ```
3. Copy bagian di antara `/d/` dan `/edit`, paste ke `SPREADSHEET_ID`.

### 4. Kredensial Jira (mode ⚡ saja)

- `JIRA_BASE_URL` — domain instance Jira kamu (mis. `https://xxxxxx.atlassian.net`).
- `JIRA_EMAIL` — email akun Atlassian.
- `JIRA_API_TOKEN` — buat di [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
- `JIRA_PROJECT_KEY` — key project (default `YANLIK`).

> Board ID di-hardcode (`15`) di `app/lib/jira.ts` — sesuaikan kalau board kamu berbeda.

## ▶️ Menjalankan

```bash
npm run dev
```

Buka `http://localhost:3000`.

Build produksi:

```bash
npm run build && npm start
```

## 📖 Alur Pakai

1. Pilih **sumber data** (File / Paste Teks / Dari Jira).
2. Klik **GENERATE KE SHEETS** → AI memproses dan menampilkan:
   - **Preview tabel** (task teknis, siap edit), dan
   - daftar **task non-teknis** yang dikeluarkan.
3. Kalau ada task non-teknis yang seharusnya masuk: **centang** task-nya → klik **GENERATE ULANG**. Hanya task terpilih yang diproses ulang dan dipaksa masuk, sisanya tetap utuh.
4. Edit/hapus baris di preview kalau perlu.
5. Klik **TULIS KE SHEETS** → commit ke tab. Link spreadsheet muncul setelah sukses.

<details>
<summary>📋 Cara export manual dari Jira (untuk mode File)</summary>

1. Buka board/project Jira → menu **List**.
2. Klik ikon **titik tiga (⋯)** di pojok kanan atas.
3. Pilih **Export** → format **Docs** (Word/HTML).
4. Upload file hasil export langsung ke app ini tanpa diedit.

</details>

## 📁 Struktur Project (relevan)

```
app/
  page.tsx           # UI utama: sumber data, generate, preview editable, commit
  page.module.css    # Semua styling (CSS Module)
  api/
    generate/route.ts  # Ekstraksi teks -> Gemini (batching + retry) -> kembalikan preview (TIDAK nulis sheet)
    commit/route.ts    # Tulis baris ke Google Sheets (buat tab baru / overwrite tab lama)
    sprints/route.ts   # Daftar 5 sprint terbaru untuk dropdown (Jira Agile API)
  lib/
    jira.ts            # Helper Jira Cloud REST API (read-only): ambil issue per sprint / per key
public/
  cat-loading-base.png
  cat-pupil-left.png
  cat-pupil-right.png
.env.local           # Kredensial (JANGAN di-commit)
```

## 🛠️ Troubleshooting Singkat

- **Error 404 model Gemini** → Google sering retire model lama. Cek [dokumentasi model Gemini](https://ai.google.dev/gemini-api/docs/models) dan ganti `MODEL_NAME` di `app/api/generate/route.ts` (sekarang `gemini-3.5-flash`).
- **Error 429 (kuota)** → kuota harian free tier habis. Tunggu reset (~14:00 WIB) atau pasang billing. 429 sengaja **tidak** di-retry otomatis karena percuma dalam jangka pendek.
- **Error 503/500 dari Gemini** → ditangani otomatis dengan retry (3x, jeda naik 4s/8s/12s) + `maxDuration = 60`.
- **Permission denied saat commit** → pastikan email service account (`client_email`) sudah di-share sebagai **Editor** di spreadsheet tujuan.
- **Mode Jira error / daftar sprint kosong** → cek `JIRA_*` di `.env.local` dan pastikan board ID di `app/lib/jira.ts` benar.
- **AI mengembalikan JSON tidak valid / kepotong** → ada fallback perbaikan JSON otomatis; kalau masih gagal, sumber data terlalu panjang — kurangi jumlah sprint atau perkecil batch.
- **Build gagal `memory allocation ... failed`** → memori mesin kurang saat Turbopack build. Tutup aplikasi lain / tambah RAM, atau pakai `npm run dev` untuk testing.

## 📄 Lisensi

Internal use — sesuaikan dengan kebutuhan tim kamu.
