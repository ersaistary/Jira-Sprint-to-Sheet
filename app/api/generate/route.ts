import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { fetchRecentSprintIssues, fetchIssuesBySprintIds, fetchIssuesByKeys } from '../../lib/jira';

export const maxDuration = 60;

async function generateWithRetry(params: any, maxRetries = 3): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err: any) {
      const status = err?.status || err?.code;
      // 429 sengaja TIDAK di-retry: di free tier itu kuota harian, baru reset
      // tengah malam Pasifik — retry beberapa detik hanya buang waktu. Hanya
      // error transien server (503/500) yang layak dicoba ulang.
      const retriable = status === 503 || status === 500;
      if (!retriable || attempt === maxRetries) throw err;
      const delay = attempt * 4000; // 4s, 8s, 12s
      console.warn(
        `[Generate] Gemini status ${status}, retry ${attempt}/${maxRetries} dalam ${delay}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}


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


// Blok klasifikasi normal: AI memilah task teknis vs non-teknis (dipakai generate penuh).
const CLASSIFICATION_RULES = `# ATURAN KLASIFIKASI TASK (sangat penting)
Task yang MASUK ke "perubahan_teknis" HANYA task yang sifatnya perubahan/update teknis pada sistem/aplikasi: perbaikan bug, penambahan/pengubahan fitur, perubahan akses/akun, migrasi data, update konfigurasi/keamanan, dsb.

Task yang TIDAK masuk ke "perubahan_teknis" (masukkan ke "task_lain" saja, cukup kode dan judul):
- Task testing / QA / pengujian dalam bentuk apapun: QA regression, load testing, stress testing, performance testing, penetration testing, security testing, uji petik, smoke testing, UAT, maupun pendampingan eksekusi test — di mana pun kata kuncinya berada di judul (awal/tengah/akhir). Contoh: "Testing JDIH task 2858 & 2861", "[Seleksi] Load Testing". Task testing TIDAK PERNAH masuk perubahan_teknis walaupun deskripsinya menyebut sistem/aplikasi spesifik.
- SEMUA task yang judulnya diawali tag "[Helpdesk]" — task Helpdesk TIDAK PERNAH masuk ke perubahan_teknis, walaupun isi deskripsinya terdengar teknis (misalnya "perubahan alamat", "update data", dll). Cek tag di awal judul, bukan isi kontennya.
- Task dokumentasi/administratif yang bukan perubahan sistem: pembuatan undangan, laporan rapat/koordinasi, nota dinas, surat, monthly report, cover, dokumen regulasi/kepatuhan, matriks UAM/ITSR, formulir administrasi rilis, dsb.
- Task pendampingan/koordinasi non-teknis.
- Task desain NON-SISTEM: desain konten publikasi/campaign (cover, infografis sosialisasi, banner publikasi, logo event) yang targetnya bukan aplikasi/sistem dari daftar lokasi.
- Task yang dikerjakan DI DALAM tool BI Metabase: pembuatan/edit dashboard, chart, visualisasi, query, atau koleksi Metabase. Metabase adalah tool analitik di luar 8 sistem aplikasi, jadi perubahan di dalamnya bukan perubahan aplikasi. Pembeda pentingnya: kalau kerjanya pada DATABASE/server/aplikasi (mis. membuat user DB agar bisa diakses Metabase, mempartisi tabel database), itu TETAP masuk "perubahan_teknis" — yang keluar ke "task_lain" HANYA kalau kerjanya dilakukan di dalam Metabase itu sendiri (dashboard/query/chart).

ATURAN KHUSUS TASK DESAIN UI/UX DAN TAMPILAN APLIKASI (SANGAT PENTING, JANGAN SALAH KLASIFIKASI):
Task desain yang targetnya adalah aplikasi/sistem (Web Komdigi, Backoffice, OSS Hub, Portal Layanan Publik, Kosmo, Portal Komdigi, dll) ADALAH PERUBAHAN TEKNIS dan WAJIB masuk ke "perubahan_teknis". Contoh yang MASUK (bukan task_lain):
- "Desain UI/UX Tampilan Data Monev Pengadaan (...)" -> pembangunan tampilan baru di aplikasi -> perubahan_teknis (PS-03-00-007)
- "Onboarding screen", "Offline screen", "Error state on Login screen" -> pembangunan/perbaikan tampilan aplikasi -> perubahan_teknis
- "Tampilan Check in & Check out Pada Dashboard Portal" -> perubahan tampilan dashboard aplikasi -> perubahan_teknis
- "Revisi Logo <nama aplikasi/sistem>" -> perubahan aset visual di dalam aplikasi -> perubahan_teknis (PS-03-00-005)
Cara membedakannya: kalau output desain tersebut akan DIIMPLEMENTASIKAN/di-render di dalam salah satu sistem di daftar lokasi, itu teknis. Kalau outputnya hanya file gambar/dokumen untuk publikasi, laporan, atau keperluan administratif di luar aplikasi, itu non-teknis. Kehadiran tag sistem di judul (mis. [Web Komdigi], [Kosmo], [Portal Komdigi]) adalah petanda kuat task tersebut teknis.

Sebelum memutuskan sebuah task masuk "perubahan_teknis", cek DUA hal secara berurutan:
1. Apakah judulnya diawali tag [Helpdesk], [Dokumentasi], atau sejenisnya yang menandakan non-teknis? Kalau ya -> langsung ke "task_lain", JANGAN dipertimbangkan lagi meskipun isinya terdengar teknis.
2. Kalau tidak ada tag non-teknis, baru nilai dari isi deskripsi: apakah ini benar-benar perubahan/perbaikan/penambahan sistem?`;

// Blok override untuk mode re-include: task sudah dipilih manual oleh user, jadi AI
// DILARANG menyaring/membuang task dan wajib menghasilkan satu baris untuk tiap task.
const FORCE_TECHNICAL_OVERRIDE = `# MODE OVERRIDE — TASK DIPILIH MANUAL OLEH USER (ATURAN PALING UTAMA)
Semua task pada teks di bagian bawah SUDAH DIPILIH SECARA MANUAL oleh user untuk DIMASUKKAN ke dokumen change log. User sudah memutuskan task-task ini layak dicatat, sehingga aturan klasifikasi/penyaringan task TIDAK berlaku di mode ini:
- Perlakukan SETIAP task sebagai perubahan_teknis. JANGAN memasukkan satu pun ke "task_lain".
- Hasilkan TEPAT SATU objek di "perubahan_teknis" untuk SETIAP task yang muncul di teks, tanpa kecuali — termasuk task yang biasanya kamu keluarkan (testing/QA, [Helpdesk], dokumentasi, desain non-sistem, Metabase, dsb).
- Array "task_lain" HARUS kosong: [].
- Tetap isi semua field (kode_perubahan, tanggal, pelaksana, lokasi, hasil, dampak, status, dll) sesuai "# ATURAN PENGISIAN FIELD" di atas, sebaik mungkin dari isi task.
Jangan membuang, menggabungkan, atau melewatkan task apa pun.`;


function buildPrompt(rawText: string, opts: { forceTechnical?: boolean } = {}): string {
  // forceTechnical = mode re-include: user sudah memilih task secara manual, jadi
  // AI dilarang membuang task ke task_lain dan wajib menghasilkan baris untuk semuanya.
  const classificationBlock = opts.forceTechnical ? FORCE_TECHNICAL_OVERRIDE : CLASSIFICATION_RULES;
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
  Catatan khusus task infrastruktur/database/server: kalau kerja fisiknya pada infrastruktur yang mendukung salah satu dari 8 sistem (mis. pembuatan user database JDIH, partisi tabel database aplikasi, instalasi monitoring di server aplikasi), task itu TETAP masuk "perubahan_teknis" dan lokasi diisi sistem aplikasi yang didukungnya. Contoh: "Pembuatan User Read-Only Database JDIH Production untuk akses Metabase" -> lokasi "JDIH", karena perubahannya dilakukan pada database JDIH, bukan di dalam Metabase.
  PENTING: Metabase, Grafana, dan Prometheus adalah tool terpisah di LUAR 8 sistem — task yang kerja fisiknya di dalam tool-tool itu tidak punya lokasi yang valid dan masuk "task_lain".


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

${classificationBlock}

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

// Pecah teks sprint menjadi chunk per-task (pemisah antar task = "\n\nTask: ")
function splitIntoChunks(text: string, maxChunkChars: number): string[] {
  const blocks = text.split('\n\n');
  const chunks: string[] = [];
  let current = '';

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    // Kalau current + block masih muat, gabung
    if (current.length + block.length + 2 <= maxChunkChars) {
      current = current ? current + '\n\n' + block : block;
    } else {
      if (current) chunks.push(current);
      // kalau satu blok sendirian sudah lebih panjang dari limit, tetap masukkan sendiri
      current = block;
    }
  }
  if (current) chunks.push(current);

  // Pastikan setiap chunk dimulai dari "Task:" biar formatnya utuh
  return chunks;
}

// Gabungkan beberapa hasil JSON dari AI jadi satu
function mergeParsedResults(results: { perubahan_teknis?: any[]; task_lain?: any[] }[]) {
  const perubahan: any[] = [];
  const lain: any[] = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].perubahan_teknis) perubahan.push(...results[i].perubahan_teknis!);
    if (results[i].task_lain) lain.push(...results[i].task_lain!);
  }
  return { perubahan_teknis: perubahan, task_lain: lain };
}

// Proses teks panjang dengan membagi ke beberapa panggilan AI, lalu merge hasilnya
async function generateWithBatching(compactText: string, opts: { forceTechnical?: boolean } = {}) {
  // ~90 ribu karakter per chunk: cukup besar supaya SATU sprint penuh (~72k karakter)
  // muat dalam 1 request AI (hemat kuota free tier), tapi 2 sprint tetap terpecah
  // jadi 2 request supaya output JSON tidak kena batas MAX_TOKENS (32768).
  const MAX_CHUNK_CHARS = 90000;

  const chunks = splitIntoChunks(compactText, MAX_CHUNK_CHARS);
  console.log('[Server] Teks dibagi menjadi ' + chunks.length + ' batch untuk diproses AI');

  const results: { perubahan_teknis?: any[]; task_lain?: any[] }[] = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log('[Server] Memproses batch ' + (i + 1) + '/' + chunks.length + ' (' + chunks[i].length + ' karakter)...');

    const prompt = buildPrompt(chunks[i], opts);
    const result = await generateWithRetry({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 32768,
      },
    });

    const finishReason = result.candidates?.[0]?.finishReason;
    let textResult = (result.text ?? '').trim();

    if (textResult.startsWith('```json')) {
      textResult = textResult.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (textResult.startsWith('```')) {
      textResult = textResult.replace(/^```/, '').replace(/```$/, '').trim();
    }

    let parsed: { perubahan_teknis?: any[]; task_lain?: any[] } | null = null;
    try {
      parsed = JSON.parse(textResult);
    } catch {
      parsed = tryRepairTruncatedJson(textResult);
    }

    if (!parsed) {
      throw new Error('Batch ' + (i + 1) + '/' + chunks.length + ' mengembalikan JSON tidak valid (finishReason: ' + finishReason + '). Coba lagi.');
    }

    console.log('[Server] Batch ' + (i + 1) + ' selesai: ' + (parsed.perubahan_teknis?.length || 0) + ' teknis, ' + (parsed.task_lain?.length || 0) + ' lain');
    results.push(parsed);
  }

  return mergeParsedResults(results);
}


export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const source = formData.get('source') as string | null; // "jira" | null
    const file = formData.get('file') as File | null;
    const rawTextParam = formData.get('rawText') as string | null;

    let textToProcess = '';

    // ── MODE RE-INCLUDE (regenerate parsial) ────────────────────────────────
    // Hanya diproses kalau user meng-centang task di daftar task_lain lalu
    // generate ulang. AI HANYA memproses task terpilih (bukan seluruh sprint),
    // hasilnya di-merge dengan rows/taskLain lama. Early-return supaya tidak
    // menyentuh alur mode lain di bawah.
    const reIncludeRaw = formData.get('reInclude') as string | null;

    if (reIncludeRaw) {
      const keys = JSON.parse(reIncludeRaw) as string[];
      if (Array.isArray(keys) && keys.length > 0) {
        console.log('[Server] Mode re-include, task: ' + keys.join(', '));

        const existingRows = JSON.parse(formData.get('existingRows') as string || '[]');
        const existingTaskLain = JSON.parse(formData.get('existingTaskLain') as string || '[]');

        // 1. Ambil detail HANYA task terpilih dari Jira (menghasilkan teks)
        const reIncludeText = await fetchIssuesByKeys(keys);

        // 2. Proses dengan pipeline AI, tapi paksa mode teknis: user sudah memilih
        //    task ini manual, jadi AI tidak boleh membuangnya lagi ke task_lain.
        const compactReInclude = compactJiraText(reIncludeText);
        const parsed = await generateWithBatching(compactReInclude, { forceTechnical: true });

        const newRows = parsed.perubahan_teknis ?? [];
        const newTaskLain = parsed.task_lain ?? [];

        // 3. Merge: sisa task_lain lama (yang tidak di-re-include) + task_lain baru.
        //    Jaring pengaman: buang task yang di-re-include dari task_lain supaya
        //    tidak muncul lagi di daftar non-teknis walau AI sempat membangkang.
        const sisaTaskLain = existingTaskLain.filter(
          (t: { kode: string }) => !keys.includes(t.kode)
        );
        const mergedTaskLain = [...sisaTaskLain, ...newTaskLain].filter(
          (t: { kode: string }) => !keys.includes(t.kode)
        );

        return Response.json({
          success: true,
          rows: [...existingRows, ...newRows],
          task_lain: mergedTaskLain,
        });
      }
    }

    // ── Ekstraksi teks berdasarkan sumber: Jira (sprint penuh) / File / Teks ──
    if (source === 'jira') {
      // Sprint dipilih manual (array ID); kalau kosong, fallback ke N terakhir.
      const sprintIdsRaw = formData.get('sprintIds') as string | null;
      if (sprintIdsRaw) {
        const sprintIds = JSON.parse(sprintIdsRaw) as number[];
        console.log('[Server] Mengambil task dari sprint terpilih: ' + sprintIds.join(', '));
        textToProcess = await fetchIssuesBySprintIds(sprintIds);
      } else {
        const sprintCount = parseInt(formData.get('sprintCount') as string || '2', 10);
        console.log('[Server] Mengambil task dari Jira API (' + sprintCount + ' sprint terakhir)...');
        textToProcess = await fetchRecentSprintIssues(sprintCount);
      }
      console.log('[Server] Preview teks dari Jira:', textToProcess.slice(0, 500));
    } else if (file) {
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
        error: 'Tidak ada teks yang dapat diproses. Pastikan sumber data (file / teks / Jira) berisi konten yang valid!'
      }, { status: 400 });
    }

    // 2. Panggil AI (model & SDK terbaru + JSON mode + rules sudah tertanam)
    const compactText = compactJiraText(textToProcess);
    console.log('[Server] Panjang teks setelah dipangkas:', compactText.length, '(dari', textToProcess.trim().length, ')');

    // 3. Panggil AI — otomatis dipecah per batch kalau teks kepanjangan
    const parsed = await generateWithBatching(compactText);

    const rowsData = parsed.perubahan_teknis ?? [];
    const taskLain = parsed.task_lain ?? [];

    if (rowsData.length === 0) {
      return NextResponse.json({
        error: 'Tidak ditemukan task teknis (perubahan/fitur/bug fix) pada sumber data ini untuk dimasukkan ke sheet.',
        task_lain: taskLain,
      }, { status: 400 });
    }

    // TIDAK langsung tulis ke Sheets — kembalikan data ke UI untuk preview & edit.
    // Penulisan dilakukan /api/commit setelah user review.
    return NextResponse.json({
      success: true,
      rows: rowsData,
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
