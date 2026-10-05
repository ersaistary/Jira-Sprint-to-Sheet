<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Sprint → Sheet — panduan agent

Next.js 16 (Turbopack) app yang mengubah task Jira jadi baris Change Log di Google Sheets lewat Gemini. Detail setup user-facing ada di `README.md` — bagian ini hanya untuk agent yang mengedit kode.

## Arsitektur & alur data

- `app/page.tsx` — satu-satunya UI (client component). State utama: `mode`, `rows` (preview teknis), `taskLain` (non-teknis), `reIncludeKeys`, `committedSheet`.
- `app/api/generate/route.ts` — ekstraksi teks → Gemini → **kembalikan preview JSON**. Route ini TIDAK pernah menulis ke Sheets.
- `app/api/commit/route.ts` — satu-satunya yang menulis ke Sheets. Commit pertama bikin tab baru; commit berikutnya overwrite `committedSheet` kalau tab-nya masih ada.
- `app/api/sprints/route.ts` + `app/lib/jira.ts` — Jira Cloud REST API read-only (Agile + search/jql). Board ID di-hardcode `15` di `jira.ts`.

Tiga mode sumber di `generate`: `reInclude` (early-return, diproses paling awal), lalu `source === 'jira'`, lalu `file`, lalu `rawText`. Urutan if/else ini penting — jangan rusak saat refactor.

## Aturan yang sering bikin bug (JANGAN dilanggar)

- **Re-include = override manual.** Kalau user mencentang task non-teknis, itu keputusan eksplisit: `generateWithBatching(text, { forceTechnical: true })` memakai blok prompt `FORCE_TECHNICAL_OVERRIDE`, bukan `CLASSIFICATION_RULES`. Task re-include juga difilter keluar dari `task_lain` hasil merge. Jangan biarkan AI membuang ulang task yang sudah dipilih user.
- **Retry Gemini hanya untuk 503/500.** 429 (kuota harian free tier) sengaja TIDAK di-retry — reset-nya tengah malam Pasifik, retry jangka pendek percuma. Jangan masukkan 429 ke daftar retriable.
- **Batching ~90rb karakter** (`MAX_CHUNK_CHARS`) disengaja: 1 sprint penuh ≈ 1 request AI untuk hemat kuota, tapi output tetap di bawah `maxOutputTokens: 32768`. Kalau dinaikkan lagi, risiko JSON kepotong naik.
- **Prompt bisnis** (daftar kode PS-03-00-XXX, aturan lokasi 8 sistem, klasifikasi teknis/non-teknis) hidup di `route.ts`. Ini sumber kebenaran perilaku AI — ubah hati-hati, jangan diringkas.
- Jangan commit `.env.local`. Butuh 7 var: `GEMINI_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `SPREADSHEET_ID`, `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`.

## Verifikasi

- `npx tsc --noEmit` — gerbang utama; harus exit 0.
- `npm run build` — bisa gagal `memory allocation ... failed` (OOM Turbopack) di mesin minim RAM; itu masalah lingkungan, bukan kode. Untuk uji fungsional pakai `npm run dev`.
- ESLint menandai banyak `any`/`require()`/setState-in-effect — itu pola lama project, build tidak gate ke lint. Jangan "bersihkan" massal di luar scope task.
