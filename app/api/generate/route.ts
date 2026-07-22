import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { google } from 'googleapis';

// --- Gemini client (new unified SDK) ---
// @google/generative-ai is deprecated (google-gemini/deprecated-generative-ai-js).
// We now use @google/genai. Run: npm uninstall @google/generative-ai && npm install @google/genai
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// gemini-1.5-flash and gemini-2.0-flash are fully shut down.
// gemini-2.5-flash is no longer available to NEW API keys/projects (existing keys still
// work until it's fully retired ~Oct 2026), so new setups get a 404 on it.
// gemini-3.5-flash is the current GA, stable Flash model — use this going forward.
const MODEL_NAME = 'gemini-3.5-flash';

// ------------------------------------------------------------------------------------
// ATURAN BISNIS — sekali ditulis di sini, tidak perlu dipaste ulang setiap generate.
// ------------------------------------------------------------------------------------
const DAFTAR_KODE_PERUBAHAN = `
PS-03-00-001 | Penambahan atau penonaktifan akun pengguna aplikasi | Menambah atau menonaktifkan user berdasarkan permintaan, dilakukan oleh BE admin atau agent aplikasi level 1.
PS-03-00-002 | Penambahan atau penghapusan akun pengguna aplikasi | Menambah atau menghapus user dari database aplikasi oleh tim developer.
PS-03-00-003 | Reset password pengguna aplikasi | Mengatur ulang kata sandi user atas permintaan pengguna, dilakukan oleh BE admin atau agent aplikasi level 1.
PS-03-00-004 | Pengelolaan hak akses atau peran pengguna | Mengubah role user aplikasi berdasarkan permintaan, dilakukan oleh BE admin atau agent aplikasi level 1.
PS-03-00-005 | Update konten dinamis dalam aplikasi | Mengubah teks, gambar, atau dokumen (banner, artikel, konten lain), dilakukan oleh BE admin atau agent aplikasi level 1.
PS-03-00-006 | Perbaikan isu/bug minor pada fitur aplikasi | Isu yang menyebabkan ketidaknyamanan/gangguan kecil tapi tidak mengganggu fungsi utama dan tidak menyebabkan crash/gagal akses (UI tidak rapi, typo, loading lama tapi selesai, fitur sekunder tidak sempurna).
PS-03-00-007 | Penambahan fitur minor pada aplikasi | Fitur baru yang meningkatkan kenyamanan/efisiensi/estetika tapi tidak berdampak ke fungsi utama (UI, share/simpan data, notifikasi, navigasi, dll).
PS-03-00-008 | Update sistem dan keamanan bersifat minor | Patch minor tanpa reboot/downtime, update sertifikat SSL sebelum expired (tanpa ubah konfigurasi), update library pihak ketiga yang sudah diuji di staging dan tidak berdampak ke core logic.
PS-03-00-009 | Migrasi data | Proses migrasi berulang dengan risiko rendah yang sudah diketahui, dilakukan di lingkungan dev/test dan tidak menyentuh data sensitif/layanan utama langsung.
`.trim();

// Baris-baris boilerplate ini selalu muncul di SETIAP task pada export Jira, tapi
// isinya nyaris selalu sama ("None" / "Not Specified" / "0") dan tidak dipakai oleh
// aturan pengisian field manapun. Membuang baris-baris ini sebelum dikirim ke AI
// memangkas jumlah token secara signifikan -> proses jauh lebih cepat & lebih murah,
// tanpa mengubah hasil sama sekali.
const NOISE_LINE_PATTERNS: RegExp[] = [
  /^Components:\s*None\s*$/i,
  /^Affects versions:\s*None\s*$/i,
  /^Fix versions:\s*None\s*$/i,
  /^Labels:\s*None\s*$/i,
  /^Votes:\s*0\s*$/i,
  /^Remaining Estimate:\s*Not Specified\s*$/i,
  /^Time Spent:\s*Not Specified\s*$/i,
  /^Original estimate:\s*Not Specified\s*$/i,
  /^Priority:\s*Medium\s*$/i,
  /^Generated at .* by .* using Jira.*$/i,
];

function compactJiraText(raw: string): string {
  const compacted = raw
    .split('\n')
    .filter((line) => !NOISE_LINE_PATTERNS.some((re) => re.test(line.trim())))
    .join('\n')
    // rapikan baris kosong berlebih supaya tidak buang-buang token
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return compacted;
}

function tryRepairTruncatedJson(text: string): { perubahan_teknis?: any[]; task_lain?: any[] } | null {
  // Coba potong di object terakhir yang lengkap (sebelum koma terakhir di dalam array),
  // lalu tutup array & object secara manual. Ini best-effort, bukan garansi.
  let candidate = text.trim();

  for (let cut = candidate.length; cut > 0; cut--) {
    if (candidate[cut - 1] !== '}') continue;
    const attempt = candidate.slice(0, cut);
    // tutup array & object yang mungkin masih terbuka
    const opens = (attempt.match(/\{/g) || []).length + (attempt.match(/\[/g) || []).length;
    const closes = (attempt.match(/\}/g) || []).length + (attempt.match(/\]/g) || []).length;
    if (opens <= closes) continue;

    for (const suffix of [']}', ']}]}', ']}}', ']}]}}']) {
      try {
        const parsed = JSON.parse(attempt + suffix);
        if (parsed && (Array.isArray(parsed.perubahan_teknis) || Array.isArray(parsed.task_lain))) {
          return parsed;
        }
      } catch {
        // coba suffix berikutnya
      }
    }
  }
  return null;
}

// Beberapa task Jira nampilin username mentah (bukan nama tampilan) sebagai
// Reporter/Assignee. Petakan di sini biar hasil di sheet selalu pakai nama lengkap.
// Tinggal tambah baris baru kalau ketemu username lain yang belum ke-cover.
const NAME_MAP: Record<string, string> = {
  tinoimammp: 'Tino Imam Maulana',
};

function normalizeName(name: string): string {
  const trimmed = (name || '').trim();
  const key = trimmed.toLowerCase();
  return NAME_MAP[key] || trimmed;
}

const HEADER_ROW = [
  'Kode Perubahan', 'Kegiatan Perubahan', 'Deskripsi Singkat',
  'Tanggal Mulai', 'Tahun/Bulan Mulai', 'Tanggal Selesai', 'Tahun/Bulan Selesai',
  'Nama Tim/Pokja', 'Nama Tim Fokus', 'Pelaksana', 'Lokasi/Sistem/CI/Layanan Terkait',
  'Status Perubahan', 'Inisiasi Perubahan', 'Detail Perubahan', 'Hasil/Output',
  'Dampak Realisasi', 'Dokumentasi', 'Keterangan', 'Status',
];

function makeSheetTitle(): string {
  const now = new Date();
  const d = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const t = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  // Karakter : / \ ? * [ ] tidak boleh dipakai di nama tab Google Sheets
  return `Sprint ${d} ${t}`.replace(/[:/\\?*[\]]/g, '.');
}

async function createNewSheetTab(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string
): Promise<{ sheetTitle: string; sheetId: number }> {
  let title = makeSheetTitle();
  let attempt = 0;

  // Kalau nama tab kebetulan sudah ada (generate 2x dalam detik yang sama), retry
  // dengan suffix, maksimal beberapa kali.
  while (attempt < 5) {
    try {
      const res = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title } } }],
        },
      });
      const sheetId = res.data.replies?.[0]?.addSheet?.properties?.sheetId;
      if (sheetId === undefined || sheetId === null) {
        throw new Error('Gagal mendapatkan sheetId dari tab baru.');
      }
      return { sheetTitle: title, sheetId };
    } catch (err: any) {
      const message = err?.errors?.[0]?.message || err?.message || '';
      if (message.toLowerCase().includes('already exists')) {
        attempt += 1;
        title = `${makeSheetTitle()} (${attempt + 1})`;
        continue;
      }
      throw err;
    }
  }
  throw new Error('Gagal membuat tab sheet baru setelah beberapa percobaan.');
}

function buildPrompt(rawText: string): string {
  return `Kamu adalah asisten yang mengubah export task Jira (sprint report) menjadi data terstruktur untuk dokumen Change Log / Sprint Report perusahaan.

# SUMBER KODE PERUBAHAN (pilih SATU kode yang paling sesuai dengan jenis perubahan tiap task teknis)
${DAFTAR_KODE_PERUBAHAN}

# ATURAN PENGISIAN FIELD (untuk setiap task yang TEKNIS)
- kode_perubahan: WAJIB diisi salah satu kode PS-03-00-XXX di atas berdasarkan kecocokan jenis perubahan/deskripsi task.
- tanggal_mulai: tanggal "Created" pada task, format dd-mmm-yyyy (contoh: 14-Jul-2026).
- tanggal_selesai: tanggal task tersebut selesai (pakai tanggal "Resolved" jika ada; jika task belum selesai, kosongkan), format dd-mmm-yyyy.
- pelaksana: nama Assignee task.
- lokasi: WAJIB salah satu dari DAFTAR BAKU berikut (tulis PERSIS sesuai ejaan di daftar ini, jangan bikin variasi/singkatan sendiri):
  1. Web Komdigi
  2. Backoffice Web Komdigi
  3. OSS Hub
  4. Portal Layanan Publik
  5. ShortURL
  6. Seleksi
  7. JDIH
  8. Simponi Gateway
  Cara menentukan: lihat tag di awal judul task (mis. "[Seleksi] Pendampingan...", "[OSSHUB] Upgrade...", "[JDIH] Perbaikan...", "[ShortUrl] Isu edit..."), lalu petakan ke daftar baku di atas (case-insensitive, abaikan variasi ejaan/spasi) — contoh: "OSS", "Oss", "OSSHUB", "Oss Hub" semua -> "OSS Hub"; "shorturl", "ShortUrl" -> "ShortURL"; "seleksi" -> "Seleksi". Kalau tidak ada tag di judul, simpulkan dari konteks/isi Description mana dari 8 sistem di atas yang paling relevan. Kalau benar-benar tidak bisa disimpulkan sama sekali dari salah satu 8 sistem itu, baru kosongkan.
- status_perubahan: dropdown, HANYA salah satu dari "Planned" | "In Progress" | "Closed".
  - Planned = jika status Jira "To Do"
  - In Progress = jika status Jira sedang dikerjakan (In Progress, Review, dsb, belum selesai)
  - Closed = jika status Jira "Testing", "Testing by QA", atau "Done"/selesai
- inisiasi: SELALU format persis "Mendapatkan Task Melalui Jira https://komdigi.atlassian.net/browse/YANLIK-XXXX" dengan XXXX diganti nomor task (ambil dari kode task di judul, misal [YANLIK-2780] -> XXXX = 2780).
- detail: ringkasan singkat isi/scope perubahan (1-2 kalimat, dari Description).
- hasil: ringkasan singkat HASIL/OUTPUT dari task ini — apa yang dihasilkan/dikerjakan, BUKAN progress atau status pengerjaannya. WAJIB selalu diisi, TIDAK BOLEH dikosongkan:
  * Kalau ada comments/resolution yang menyebutkan hasil akhirnya secara eksplisit, pakai itu.
  * Kalau tidak ada, simpulkan sendiri hasilnya dari judul & description task tersebut — apa output yang dikerjakan/dibuat/diperbaiki. Contoh: judul "Perbaikan Rendering Flowchart pada Fitur Chat" -> hasil: "Flowchart pada fitur chat dapat dirender dengan baik". Judul "Pembuatan User Read-Only Database JDIH Production" -> hasil: "User read-only database JDIH Production untuk akses Metabase berhasil dibuat".
  Field ini tidak pernah kosong — selalu ada isinya, minimal disimpulkan dari judul task.
- dampak: dampak/manfaat POSITIF yang dihasilkan SETELAH perubahan ini direalisasikan/diterapkan — bukan cerita masalah/kondisi SEBELUM dikerjakan. Field ini WAJIB selalu diisi, TIDAK BOLEH "Tidak ada" atau kosong. Fokus jawab pertanyaan: "dengan adanya perubahan ini, apa yang jadi bisa dilakukan / jadi lebih baik bagi user/sistem/tim?". Simpulkan dari judul, Description, Acceptance Criteria, atau Definition of Done-nya — JANGAN cuma cari kalimat literal "dampak" di teksnya karena memang jarang ditulis eksplisit, dan JANGAN pernah menyerah ke "Tidak ada". Bahkan untuk perubahan kecil (reset password, pembuatan akun read-only, dsb) tetap ada manfaatnya bagi pihak yang meminta — jelaskan itu. Contoh cara menyimpulkan:
  * Bug "admin tidak bisa membuat akun" (setelah diperbaiki) -> dampak: "Admin dapat membuat akun baru untuk pansel tanpa error"
  * Fitur baru carousel gambar infografis -> dampak: "Tampilan detail infografis dengan multi gambar lebih informatif bagi pengguna"
  * Migrasi/partisi database -> dampak: "Query pada tabel besar menjadi lebih cepat dan mudah dikelola"
  * Instalasi Node Exporter untuk monitoring server -> dampak: "Tim DevOps dapat memantau penggunaan resource database server secara real-time melalui Prometheus dan Grafana"
  * Pembuatan user read-only database untuk akses Metabase -> dampak: "Tim terkait dapat mengakses data database secara read-only melalui Metabase untuk keperluan monitoring/analisis"
  * Reset password rutin -> dampak: "Pengguna dapat login kembali ke sistem setelah password direset"
- keterangan: isi "Sedang tahap testing" HANYA jika status Jira task tersebut "Testing" / "Testing by QA". Selain itu, KOSONGKAN (jangan diisi apapun, jangan pakai tanda "-").
- status: dropdown, pilih SATU status Jira asli yang paling sesuai dari daftar ini saja: "Carry Over", "To Do", "Testing", "Review PIC", "Done", "In Progress". Sesuaikan dengan status asli di Jira (mis. status Jira "Testing by QA" -> "Testing"; "Review" -> "Review PIC"; dst).

PENTING soal field kosong: jika suatu field memang tidak perlu/tidak ada datanya, kembalikan STRING KOSONG "" — JANGAN PERNAH mengisi dengan tanda strip "-" atau placeholder apapun.

# ATURAN KLASIFIKASI TASK (sangat penting)
Task yang MASUK ke "perubahan_teknis" HANYA task yang sifatnya perubahan/update teknis pada sistem/aplikasi: perbaikan bug, penambahan/pengubahan fitur, perubahan akses/akun, migrasi data, update konfigurasi/keamanan, dsb.

Task yang TIDAK masuk ke "perubahan_teknis" (masukkan ke "task_lain" saja, cukup kode dan judul):
- Task testing / QA regression (mis. judul mengandung "Testing", atau deskripsinya berisi daftar link testing task lain)
- SEMUA task yang judulnya diawali tag "[Helpdesk]" — task Helpdesk TIDAK PERNAH masuk ke perubahan_teknis, walaupun isi deskripsinya terdengar teknis (misalnya "perubahan alamat", "update data", dll). Cek tag di awal judul, bukan isi kontennya.
- Task dokumentasi/administratif yang bukan perubahan sistem: pembuatan undangan, laporan rapat/koordinasi, nota dinas, surat, dsb.
- Task pendampingan/koordinasi non-teknis.

Sebelum memutuskan sebuah task masuk "perubahan_teknis", cek DUA hal secara berurutan:
1. Apakah judulnya diawali tag [Helpdesk], [Dokumentasi], atau sejenisnya yang menandakan non-teknis? Kalau ya -> langsung ke "task_lain", JANGAN dipertimbangkan lagi meskipun isinya terdengar teknis.
2. Kalau tidak ada tag non-teknis, baru nilai dari isi deskripsi: apakah ini benar-benar perubahan/perbaikan/penambahan sistem?

# FORMAT OUTPUT
Kembalikan HANYA JSON (tanpa markdown, tanpa teks lain) dengan struktur persis:
{
  "perubahan_teknis": [
    {
      "kode_perubahan": "",
      "tanggal_mulai": "",
      "tanggal_selesai": "",
      "pelaksana": "",
      "lokasi": "",
      "status_perubahan": "",
      "inisiasi": "",
      "detail": "",
      "hasil": "",
      "dampak": "",
      "keterangan": "",
      "status": ""
    }
  ],
  "task_lain": [
    { "kode": "YANLIK-XXXX", "judul": "Judul task" }
  ]
}

# TEXT SPRINT REPORT YANG HARUS DIPROSES
${rawText}`;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const rawTextParam = formData.get('rawText') as string | null;

    let textToProcess = '';

    // 1. Ekstraksi teks berdasarkan input (File atau Textarea)
    if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const fileNameLower = file.name.toLowerCase();

      if (fileNameLower.endsWith('.doc')) {
        return NextResponse.json({
          error: 'Format dokumen .doc (Word jadul) tidak didukung secara langsung. Silakan "Save As" file kamu menjadi format .docx di Word terlebih dahulu sebelum diunggah!'
        }, { status: 400 });
      }

      if (fileNameLower.endsWith('.docx')) {
        console.log(`[Server] Memproses file dokumen Word: ${file.name}`);
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer: buffer });
        textToProcess = result.value;
      } else if (fileNameLower.endsWith('.pdf')) {
        console.log(`[Server] Memproses file PDF: ${file.name}`);
        const pdfParse = require('pdf-parse-fork');
        const pdfData = await pdfParse(buffer);
        textToProcess = pdfData.text;
      } else {
        console.log(`[Server] Memproses file TXT: ${file.name}`);
        textToProcess = buffer.toString('utf-8');
      }
    } else if (rawTextParam) {
      textToProcess = rawTextParam;
    }

    console.log('[Server] Panjang teks yang diekstraksi:', textToProcess.trim().length);

    if (!textToProcess.trim()) {
      return NextResponse.json({
        error: 'Tidak ada teks yang dapat diproses. Pastikan dokumen kamu berisi teks yang valid!'
      }, { status: 400 });
    }

    // 2. Panggil AI (model & SDK terbaru + JSON mode + rules sudah tertanam)
    const compactText = compactJiraText(textToProcess);
    console.log('[Server] Panjang teks setelah dipangkas:', compactText.length, '(dari', textToProcess.trim().length, ')');

    const prompt = buildPrompt(compactText);

    const result = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        // Token thinking (reasoning internal model) juga dipotong dari budget ini,
        // jadi harus jauh lebih besar dari perkiraan panjang JSON output supaya
        // hasil akhirnya tidak terpotong di tengah jalan.
        maxOutputTokens: 32768,
      },
    });

    const finishReason = result.candidates?.[0]?.finishReason;
    if (finishReason === 'MAX_TOKENS') {
      console.error('[Server] Respons AI terpotong (MAX_TOKENS). Panjang teks:', compactText.length);
      return NextResponse.json({
        error: 'Dokumen terlalu panjang untuk diproses sekali jalan (respons AI terpotong). Coba split dokumen jadi beberapa bagian lebih kecil, lalu generate satu-satu.',
      }, { status: 502 });
    }

    let textResult = (result.text ?? '').trim();

    // Fallback pembersihan kalau model tetap membungkus dengan ```json
    if (textResult.startsWith('```json')) {
      textResult = textResult.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (textResult.startsWith('```')) {
      textResult = textResult.replace(/^```/, '').replace(/```$/, '').trim();
    }

    if (!textResult) {
      return NextResponse.json({
        error: 'AI tidak mengembalikan hasil apapun. Coba lagi, atau periksa apakah GEMINI_API_KEY masih valid.'
      }, { status: 502 });
    }

    let parsed: { perubahan_teknis?: any[]; task_lain?: any[] };
    try {
      parsed = JSON.parse(textResult);
    } catch (e) {
      console.error('[Server] Gagal parse JSON dari AI. finishReason:', finishReason);
      console.error('[Server] 500 karakter akhir respons:', textResult.slice(-500));

      // Percobaan terakhir: kalau JSON terpotong tepat di tengah array task_lain/
      // perubahan_teknis, coba tutup paksa supaya task yang sudah lengkap tetap
      // bisa dipakai, daripada semuanya gagal total.
      const repaired = tryRepairTruncatedJson(textResult);
      if (repaired) {
        console.warn('[Server] JSON berhasil diperbaiki otomatis (sebagian data mungkin hilang di ujung).');
        parsed = repaired;
      } else {
        return NextResponse.json({
          error: 'AI mengembalikan format yang tidak valid. Coba generate ulang; kalau berulang terjadi, coba dengan dokumen yang lebih pendek.',
        }, { status: 502 });
      }
    }

    const rowsData = parsed.perubahan_teknis ?? [];
    const taskLain = parsed.task_lain ?? [];

    if (rowsData.length === 0) {
      return NextResponse.json({
        error: 'Tidak ditemukan task teknis (perubahan/fitur/bug fix) pada dokumen ini untuk dimasukkan ke sheet.',
        task_lain: taskLain,
      }, { status: 400 });
    }

    // 3. Hubungkan ke Google Sheets API
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SPREADSHEET_ID;

    const rows = rowsData.map((item: any) => [
      item.kode_perubahan || '', '', '', item.tanggal_mulai || '', '', item.tanggal_selesai || '', '', '', '',
      item.pelaksana ? normalizeName(item.pelaksana) : '', item.lokasi || '', item.status_perubahan || '', item.inisiasi || '', item.detail || '',
      item.hasil || '', item.dampak || '', '', item.keterangan || '', item.status || ''
    ]);

    // Setiap generate = tab (sheet) baru, jadi data lama tidak pernah ketimpa.
    const { sheetTitle, sheetId } = await createNewSheetTab(sheets, spreadsheetId!);

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetTitle}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [HEADER_ROW, ...rows] }, // header di baris 1, data mulai baris 2
    });


    return NextResponse.json({
      success: true,
      link: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`,
      sheetTitle,
      count: rowsData.length,
      task_lain: taskLain,
    });

  } catch (error: any) {
    console.error('Detail Error di Terminal:', error);
    return NextResponse.json({
      error: `Gagal: ${error.message || 'Terjadi kesalahan internal'}`,
      detail: error.stack
    }, { status: 500 });
  }
}