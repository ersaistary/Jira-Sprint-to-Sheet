// app/lib/monthly.ts
// Logika bisnis, prefilter, evaluasi AI Tahap 1 & Tahap 2 (Grouping), serta rekonsiliasi laporan Monthly (Yanlik)

import { GoogleGenAI } from '@google/genai';
import {
  MonthlySourceTask,
  MonthlyTaskExtraction,
  MonthlyGroupRow,
  MonthlyRow,
  MonthlyExcluded,
  MonthlyRekap,
} from '../types/monthly';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const MODEL_NAME = 'gemini-3.5-flash';

// Daftar 7 kategori / aplikasi yang diizinkan sesuai master prompt Bagian 7 & 21
export const ALLOWED_CATEGORIES = [
  'Web Komdigi',
  'ShortURL',
  'Seleksi',
  'Portal Layanan Publik',
  'OSS Hub',
  'JDIH Komdigi',
  'Gateway Simponi',
] as const;

// Helper urutan kategori sesuai Bagian 21 master prompt
export function getCategoryOrder(categoryName: string): number {
  const normalized = categoryName.trim().toLowerCase();
  for (let i = 0; i < ALLOWED_CATEGORIES.length; i++) {
    if (ALLOWED_CATEGORIES[i].toLowerCase() === normalized) {
      return i;
    }
  }
  return 999;
}

// Format tanggal ke DD-MM-YYYY
export function formatIndoDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

// Tanggal permohonan paling awal dari kumpulan tanggal
export function earliestDate(dates: (string | undefined | null)[]): string {
  const validDates: Date[] = [];
  for (const d of dates) {
    if (d) {
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime())) {
        validDates.push(parsed);
      }
    }
  }
  if (validDates.length === 0) return '';
  validDates.sort((a, b) => a.getTime() - b.getTime());
  return formatIndoDate(validDates[0].toISOString());
}

// Tanggal selesai: HANYA jika seluruh task memiliki tanggal resolved (Bagian 8.4)
export function latestDateIfAllResolved(tasks: MonthlySourceTask[]): string {
  if (tasks.length === 0) return '';
  const resolvedDates: Date[] = [];
  for (const t of tasks) {
    if (!t.resolved) return ''; // Ada anggota yang belum selesai -> kosongkan
    const parsed = new Date(t.resolved);
    if (isNaN(parsed.getTime())) return '';
    resolvedDates.push(parsed);
  }
  resolvedDates.sort((a, b) => b.getTime() - a.getTime());
  return formatIndoDate(resolvedDates[0].toISOString());
}

// Normalisasi status ke Todo, In Progress, Testing, atau Done (Bagian 15)
export function normalizeStatus(jiraStatus?: string): string {
  const s = (jiraStatus || '').toLowerCase().trim();
  if (s === 'done' || s === 'closed' || s === 'resolved' || s === 'complete' || s === 'selesai') {
    return 'Done';
  }
  if (s === 'in progress' || s === 'in dev' || s === 'development' || s === 'sedang dikerjakan') {
    return 'In Progress';
  }
  if (s === 'testing' || s === 'qa' || s === 'in testing' || s === 'in review' || s === 'review') {
    return 'Testing';
  }
  if (s === 'to do' || s === 'todo' || s === 'open' || s === 'backlog' || s === 'reopened') {
    return 'Todo';
  }
  return jiraStatus || 'Todo';
}

// Status kelompok konservatif: Todo < In Progress < Testing < Done (Bagian 8.4 & 13)
export function conservativeStatus(statuses: (string | undefined)[]): string {
  const normalized = statuses.map((s) => normalizeStatus(s));
  if (normalized.includes('Todo')) return 'Todo';
  if (normalized.includes('In Progress')) return 'In Progress';
  if (normalized.includes('Testing')) return 'Testing';
  if (normalized.every((s) => s === 'Done')) return 'Done';
  return normalized[0] || 'Todo';
}

// Prefilter deterministik: Exclude Assignee Rafli Aran & Eryan (Bagian 3)
export function isExcludedAssignee(assignee?: string): boolean {
  if (!assignee) return false;
  const a = assignee.toLowerCase().trim();
  return a.includes('rafli') || a.includes('aran') || a.includes('eryan');
}

export function prefilterMonthlyTasks(tasks: MonthlySourceTask[]): {
  eligibleTasks: MonthlySourceTask[];
  excludedByAssignee: MonthlyExcluded[];
} {
  const eligibleTasks: MonthlySourceTask[] = [];
  const excludedByAssignee: MonthlyExcluded[] = [];

  let exclIndex = 1;
  for (const t of tasks) {
    if (isExcludedAssignee(t.assignee)) {
      excludedByAssignee.push({
        no: exclIndex++,
        key: t.key,
        summary: t.summary,
        assignee: t.assignee,
        status: t.status,
        reason: 'Assignee termasuk daftar pengecualian',
        needs_verification: false,
      });
    } else {
      eligibleTasks.push(t);
    }
  }

  return { eligibleTasks, excludedByAssignee };
}

// Render daftar task menjadi teks untuk prompt AI Tahap 1
export function renderTasksToText(tasks: MonthlySourceTask[]): string {
  const blocks: string[] = [];
  for (const t of tasks) {
    let block = `Task: [${t.key}] ${t.summary}\n`;
    block += `Status: ${t.status}\n`;
    block += `Created: ${t.created}\n`;
    if (t.resolved) block += `Resolved: ${t.resolved}\n`;
    block += `Assignee: ${t.assignee}\n`;
    block += `Reporter: ${t.reporter}\n`;
    if (t.description) block += `Description:\n${t.description}\n`;
    if (t.comments) block += `Comments:\n${t.comments}\n`;
    blocks.push(block.trim());
  }
  return blocks.join('\n\n---\n\n');
}

// Master prompt aturan Tahap 1 (Ekstraksi & Evaluasi Kelayakan per Tiket)
const TAHAP_1_SYSTEM_PROMPT = `
Bertindaklah sebagai analis tiket Jira untuk menyusun Laporan Capaian Layanan Publik (Yanlik).
Tugasmu adalah membaca tiket Jira yang diberikan dan mengevaluasi KELAYAKAN setiap tiket satu per satu.

ATURAN PENGECUALIAN (WAJIB DIPATUHI):
1. Pengecualian Desain UI/UX:
   Keluarkan tiket yang pekerjaan utamanya berupa desain visual mandiri (mockup Figma, wireframe, rancangan grafis, prototype desain, Design System).
   JANGAN keluarkan pekerjaan teknis implementasi frontend, perbaikan bug tampilan/CSS, perbaikan komponen web, atau integrasi UI yang dikerjakan oleh developer.
2. Pengecualian Testing & QA:
   Keluarkan tiket yang pekerjaan utamanya adalah aktivitas pengujian, testing, atau QA (misal ada tag [Testing], [Testing][Seleksi], "testing fitur...").
   JANGAN keluarkan tiket teknis (bugfix, implementasi fitur, pembaruan keamanan, update API) HANYA KARENA status Jira-nya bernilai "Testing". Status "Testing" pada pekerjaan teknis tetap MASUK laporan!
3. Pengecualian Dokumentasi & Administrasi:
   Keluarkan tiket yang pekerjaan utamanya berupa dokumentasi atau administrasi ([Dokumentasi], user guide, manual book, nodin, monthly report, pendampingan, pencatatan perubahan).
4. Kategori yang Diperbolehkan:
   HANYA 7 aplikasi ini yang boleh masuk laporan:
   - Web Komdigi
   - ShortURL
   - Seleksi
   - Portal Layanan Publik
   - OSS Hub
   - JDIH Komdigi
   - Gateway Simponi
   Keluarkan tiket dengan kategori "Design System", "Lain-lain", atau aplikasi di luar 7 aplikasi di atas.

ATURAN PERUMUSAN KOLOM (UNTUK TIKET YANG LOLOS):
- KEGIATAN: Tentukan nama aplikasi/layanan yang ringkas dan baku (misal "Web Komdigi", "OSS Hub", "ShortURL", "Seleksi", dll) berdasarkan keseluruhan judul dan konteks tiket. JANGAN gunakan seluruh judul tiket. JANGAN ambil teks dalam kurung siku secara membabi buta jika isinya bukan nama aplikasi/layanan.
- SASARAN DAN KEY PERFORMANCE INDICATOR: Rumuskan tujuan kapabilitas/pekerjaan dengan bahasa formal dan ringkas. Gunakan pola: "Menampilkan...", "Menyediakan data backend untuk...", "Memperbaiki...", "Mengamankan...", "Mengintegrasikan...", "Mengoptimalkan...". Hindari uraian teknis berlebihan.
- CAPAIAN: Keluaran konkret atau perubahan yang dikerjakan dalam bentuk frasa nomina (misal "Grafik monitoring pengadaan...", "Perbaikan validasi redirect..."). Jangan gunakan frasa naratif klise seperti "Berhasil dilakukan...". Jika tiket belum selesai dan masih tahap testing, sertakan "(Dalam Tahap Testing)". Jika belum dimulai, awali dengan "Rencana...".
- RENCANA TINDAK LANJUT / PENDING MATTERS: Untuk tiket berstatus Done, KOSONGKAN kolom ini (""), kecuali tiket secara eksplisit mencatat ada hal yang masih pending. Untuk tiket yang belum Done (Todo, In Progress, Testing), jelaskan langkah lanjutan yang konkret.

KONTRAK OUTPUT JSON (WAJIB VALID JSON):
Kembalikan JSON dengan format:
{
  "tasks": [
    {
      "key": "YANLIK-123",
      "kategori": "Web Komdigi",
      "masuk_laporan": true,
      "alasan_pengecualian": "",
      "kegiatan": "Web Komdigi",
      "sasaran_kpi": "Memperbaiki mekanisme validasi form...",
      "capaian": "Perbaikan validasi form pendaftaran",
      "rencana_tindak_lanjut": "",
      "perlu_verifikasi": false,
      "catatan_verifikasi": ""
    }
  ]
}
Catatan:
- Jika "masuk_laporan" false, isi "alasan_pengecualian" dengan jelas (contoh: "Pekerjaan utama berupa testing/QA", "Pekerjaan utama berupa desain mockup UI/UX", "Kategori di luar 7 aplikasi Yanlik").
- Jika kategori atau data tidak dapat dipastikan secara meyakinkan dari konteks yang ada, set "perlu_verifikasi": true dan jelaskan di "catatan_verifikasi". Jangan mengarang!
`.trim();

// Master prompt aturan Tahap 2 (Grouping / Pengelompokan baris laporan)
const TAHAP_2_SYSTEM_PROMPT = `
Bertindaklah sebagai analis tiket Jira untuk menyusun Laporan Capaian Layanan Publik (Yanlik).
Tugasmu adalah melakukan PENGELOMPOKAN (GROUPING) tiket-tiket yang telah lolos evaluasi menjadi baris laporan gabungan.

KRITERIA PENGELOMPOKAN (Bagian 13 Master Prompt):
Gabungkan beberapa tiket menjadi satu baris laporan HANYA JIKA SELURUH kriteria berikut terpenuhi:
1. Berada pada aplikasi/layanan atau ruang lingkup sistem yang SAMA (kategori sama).
2. Memiliki tujuan, fitur, modul, proses, atau deliverable yang sama atau saling melengkapi secara langsung (misal: beberapa tiket frontend & backend yang bersama-sama membangun modul yang sama).
3. Dapat diwakili oleh satu rumusan KPI yang sama tanpa mengaburkan tujuan pekerjaan.
4. Capaian masing-masing tiket dapat disajikan sebagai satu daftar keluaran yang koheren.
5. JANGAN MENGGABUNGKAN tiket dari aplikasi/kategori yang berbeda!
6. JANGAN MENGGABUNGKAN tiket yang tujuannya berbeda hanya karena tanggal atau sprint-nya sama.
7. JIKA RAGU, JANGAN GABUNG — pertahankan sebagai baris terpisah (member_keys hanya berisi 1 tiket).

ATURAN WAJIB KEANGGOTAAN (MEMBER_KEYS):
- Setiap tiket unik dari daftar input HARUS MUNCUL TEPAT SATU KALI di salah satu "member_keys".
- Tidak boleh ada tiket yang hilang.
- Tidak boleh ada tiket yang muncul di lebih dari satu baris.
- Jangan mengisi tanggal, status, Reporter, tautan, atau PEMOHON; kode sistem yang akan menghitungnya.

FORMAT OUTPUT (WAJIB VALID JSON):
{
  "rows": [
    {
      "member_keys": ["YANLIK-101", "YANLIK-102"],
      "kegiatan": "Web Komdigi",
      "sasaran_kpi": "Menampilkan grafik monitoring pengadaan UKPBJ pada antarmuka Web Komdigi.",
      "capaian": "Grafik monitoring pengadaan UKPBJ, meliputi Grafik Pelaksanaan PDN dan Grafik Paket Pengadaan.",
      "rencana_tindak_lanjut": "",
      "perlu_verifikasi": false,
      "catatan_verifikasi": ""
    }
  ]
}
`.trim();

// Fungsi pemanggil Gemini dengan penanganan retry 500/503 dan larangan retry 429
async function callGeminiWithRetry(prompt: string, maxRetries = 3): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: 32768,
        },
      });
      return (response.text ?? '').trim();
    } catch (err: unknown) {
      lastErr = err;
      const status =
        (err as { status?: number; code?: number })?.status ||
        (err as { status?: number; code?: number })?.code;
      // JANGAN RETRY 429 (kuota harian habis)
      if (status === 429) {
        throw new Error(
          'Gemini API mencapai batas kuota (429 RESOURCE_EXHAUSTED). ' +
          'Batas kuota harian akun Gemini telah tercapai.'
        );
      }
      // Hanya retry 500 dan 503
      if (status !== 500 && status !== 503) {
        throw err;
      }
      if (attempt === maxRetries) break;
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      console.warn(
        `[Monthly Gemini] Error ${status}, percobaan ulang ${attempt}/${maxRetries} dalam ${Math.round(
          delay
        )}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// Ekstraksi Tahap 1 menggunakan Gemini
export async function extractMonthlyTasksWithAI(
  tasks: MonthlySourceTask[]
): Promise<MonthlyTaskExtraction[]> {
  if (tasks.length === 0) return [];

  const CHUNK_SIZE = 35; // Maks 35 task per panggilan AI agar respons tidak terpotong
  const taskChunks: MonthlySourceTask[][] = [];
  for (let i = 0; i < tasks.length; i += CHUNK_SIZE) {
    taskChunks.push(tasks.slice(i, i + CHUNK_SIZE));
  }

  const allExtractions: MonthlyTaskExtraction[] = [];

  for (let chunkIdx = 0; chunkIdx < taskChunks.length; chunkIdx++) {
    const chunk = taskChunks[chunkIdx];
    const taskText = renderTasksToText(chunk);
    const fullPrompt = `${TAHAP_1_SYSTEM_PROMPT}\n\nDAFTAR TIKET JIRA YANG HARUS DIPROSES:\n\n${taskText}`;

    const rawJson = await callGeminiWithRetry(fullPrompt);

    let parsed: { tasks?: MonthlyTaskExtraction[] } = {};
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      const match = rawJson.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          parsed = { tasks: [] };
        }
      }
    }

    const returnedTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    const returnedMap = new Map<string, MonthlyTaskExtraction>();
    for (const t of returnedTasks) {
      if (t.key) returnedMap.set(t.key, t);
    }

    // Validasi kelengkapan tiket: setiap tiket di input chunk harus memiliki hasil
    for (const sourceTask of chunk) {
      const extracted = returnedMap.get(sourceTask.key);
      if (extracted) {
        allExtractions.push(extracted);
      } else {
        allExtractions.push({
          key: sourceTask.key,
          kategori: 'Web Komdigi',
          masuk_laporan: true,
          alasan_pengecualian: '',
          kegiatan: 'Web Komdigi',
          sasaran_kpi: sourceTask.summary,
          capaian: sourceTask.summary,
          rencana_tindak_lanjut: '',
          perlu_verifikasi: true,
          catatan_verifikasi: 'Task tidak berhasil dievaluasi oleh AI',
        });
      }
    }
  }

  return allExtractions;
}

// Helper parsing JSON untuk output Tahap 2
function parseGroupingJson(rawJson: string): MonthlyGroupRow[] {
  try {
    const parsed = JSON.parse(rawJson);
    if (Array.isArray(parsed.rows)) {
      return parsed.rows;
    }
  } catch {
    const match = rawJson.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed.rows)) {
          return parsed.rows;
        }
      } catch {
        // ignore
      }
    }
  }
  return [];
}

// Helper validasi keanggotaan grup Tahap 2
function validateGroupMembership(
  groups: MonthlyGroupRow[],
  expectedKeys: Set<string>
): {
  isValid: boolean;
  missingKeys: string[];
  duplicateKeys: string[];
} {
  const seenKeys = new Set<string>();
  const duplicateKeys: string[] = [];

  for (const g of groups) {
    if (!Array.isArray(g.member_keys)) continue;
    for (const key of g.member_keys) {
      if (seenKeys.has(key)) {
        if (!duplicateKeys.includes(key)) duplicateKeys.push(key);
      } else {
        seenKeys.add(key);
      }
    }
  }

  const missingKeys: string[] = [];
  for (const k of expectedKeys) {
    if (!seenKeys.has(k)) {
      missingKeys.push(k);
    }
  }

  const isValid = missingKeys.length === 0 && duplicateKeys.length === 0 && groups.length > 0;
  return { isValid, missingKeys, duplicateKeys };
}

// Pengelompokan Tahap 2 menggunakan Gemini AI (Section 8.3)
export async function groupMonthlyTasksWithAI(
  includedTasks: MonthlySourceTask[],
  extractions: MonthlyTaskExtraction[]
): Promise<{ groups: MonthlyGroupRow[]; warnings: string[] }> {
  const warnings: string[] = [];
  if (includedTasks.length === 0) return { groups: [], warnings };

  const extractionMap = new Map<string, MonthlyTaskExtraction>();
  for (const ext of extractions) {
    extractionMap.set(ext.key, ext);
  }

  // Jika hanya ada 1 task, langsung jadikan 1 grup tanpa panggil AI
  if (includedTasks.length === 1) {
    const t = includedTasks[0];
    const ext = extractionMap.get(t.key);
    return {
      groups: [
        {
          member_keys: [t.key],
          kegiatan: ext?.kegiatan || ext?.kategori || 'Web Komdigi',
          sasaran_kpi: ext?.sasaran_kpi || t.summary,
          capaian: ext?.capaian || t.summary,
          rencana_tindak_lanjut: ext?.rencana_tindak_lanjut || '',
          perlu_verifikasi: ext?.perlu_verifikasi || false,
          catatan_verifikasi: ext?.catatan_verifikasi || '',
        },
      ],
      warnings,
    };
  }

  // Siapkan data ringkas untuk Tahap 2
  const tasksForGrouping = includedTasks.map((t) => {
    const ext = extractionMap.get(t.key);
    return {
      key: t.key,
      kategori: ext?.kategori || 'Web Komdigi',
      judul: t.summary,
      status: t.status,
      assignee: t.assignee,
      reporter: t.reporter,
      kegiatan: ext?.kegiatan || ext?.kategori || 'Web Komdigi',
      sasaran_kpi: ext?.sasaran_kpi || t.summary,
      capaian: ext?.capaian || t.summary,
      rencana_tindak_lanjut: ext?.rencana_tindak_lanjut || '',
    };
  });

  const expectedKeys = new Set(includedTasks.map((t) => t.key));
  const fullPrompt = `${TAHAP_2_SYSTEM_PROMPT}\n\nDAFTAR TIKET YANG AKAN DIKELOMPOKKAN:\n\n${JSON.stringify(
    tasksForGrouping,
    null,
    2
  )}`;

  let rawJson = await callGeminiWithRetry(fullPrompt);
  let parsedGroups = parseGroupingJson(rawJson);
  let validation = validateGroupMembership(parsedGroups, expectedKeys);

  // Jika validasi awal gagal, coba perbaikan satu kali (Section 8.3)
  if (!validation.isValid) {
    console.warn('[Monthly Grouping] Validasi awal belum lengkap, meminta perbaikan ke AI...');
    const repairPrompt = `${fullPrompt}\n\nPERINGATAN PERBAIKAN:\nHasil pengelompokan sebelumnya belum memenuhi kriteria:\n` +
      `- Tiket yang hilang (belum masuk kelompok): ${validation.missingKeys.join(', ') || 'tidak ada'}\n` +
      `- Tiket duplikat: ${validation.duplicateKeys.join(', ') || 'tidak ada'}\n` +
      `Silakan perbaiki JSON output agar SEMUA tiket berikut muncul di member_keys tepat satu kali:\n` +
      `[${Array.from(expectedKeys).join(', ')}]`;

    try {
      rawJson = await callGeminiWithRetry(repairPrompt);
      parsedGroups = parseGroupingJson(rawJson);
      validation = validateGroupMembership(parsedGroups, expectedKeys);
    } catch (e: unknown) {
      console.warn('[Monthly Grouping] Percobaan perbaikan gagal:', e);
    }
  }

  // Terapkan penanganan fallback aman jika masih ada key yang hilang/dobel
  const finalGroups: MonthlyGroupRow[] = [];
  const assignedKeys = new Set<string>();

  for (const group of parsedGroups) {
    if (!Array.isArray(group.member_keys)) continue;
    const validMembers: string[] = [];
    for (const k of group.member_keys) {
      if (expectedKeys.has(k) && !assignedKeys.has(k)) {
        validMembers.push(k);
        assignedKeys.add(k);
      }
    }
    if (validMembers.length > 0) {
      finalGroups.push({
        ...group,
        member_keys: validMembers,
      });
    }
  }

  // Jika ada tiket yang belum masuk kelompok, buatkan baris mandiri (Section 8.3)
  for (const key of expectedKeys) {
    if (!assignedKeys.has(key)) {
      const sourceTask = includedTasks.find((t) => t.key === key);
      const ext = extractionMap.get(key);
      warnings.push(`Tiket ${key} dipisah sebagai baris mandiri karena tidak masuk ke kelompok AI.`);
      finalGroups.push({
        member_keys: [key],
        kegiatan: ext?.kegiatan || ext?.kategori || 'Web Komdigi',
        sasaran_kpi: ext?.sasaran_kpi || sourceTask?.summary || key,
        capaian: ext?.capaian || sourceTask?.summary || key,
        rencana_tindak_lanjut: ext?.rencana_tindak_lanjut || '',
        perlu_verifikasi: true,
        catatan_verifikasi: 'Pengelompokan otomatis tidak lengkap, dipisah menjadi baris mandiri.',
      });
    }
  }

  return { groups: finalGroups, warnings };
}

// Merakit baris laporan hasil pengelompokan Fase 4 (Grouping & Rekonsiliasi Lengkap)
export function assemblePhase4Results(
  tasks: MonthlySourceTask[],
  excludedByAssignee: MonthlyExcluded[],
  extractions: MonthlyTaskExtraction[],
  groups: MonthlyGroupRow[],
  totalEntries: number,
  duplicateEntries: number,
  duplicateKeys: string[]
): {
  rows: MonthlyRow[];
  excluded: MonthlyExcluded[];
  rekap: MonthlyRekap;
} {
  const taskMap = new Map<string, MonthlySourceTask>();
  for (const t of tasks) {
    taskMap.set(t.key, t);
  }

  const extractionMap = new Map<string, MonthlyTaskExtraction>();
  for (const e of extractions) {
    extractionMap.set(e.key, e);
  }

  // 1. Kumpulkan seluruh tiket yang dikecualikan (prefilter + Tahap 1)
  const excluded: MonthlyExcluded[] = [...excludedByAssignee];
  let excludedNumber = excluded.length + 1;

  for (const ext of extractions) {
    if (!ext.masuk_laporan) {
      const source = taskMap.get(ext.key);
      if (source) {
        excluded.push({
          no: excludedNumber++,
          key: source.key,
          summary: source.summary,
          assignee: source.assignee,
          status: source.status,
          reason: ext.alasan_pengecualian || 'Dikecualikan sesuai aturan kriteria',
          needs_verification: ext.perlu_verifikasi || false,
        });
      }
    }
  }

  // 2. Rakit baris laporan utama dari hasil pengelompokan
  const rows: MonthlyRow[] = [];
  let rowNumber = 1;
  let needsVerificationCount = 0;

  for (const group of groups) {
    const memberTasks: MonthlySourceTask[] = [];
    const memberExtractions: MonthlyTaskExtraction[] = [];

    for (const key of group.member_keys) {
      const t = taskMap.get(key);
      if (t) memberTasks.push(t);
      const e = extractionMap.get(key);
      if (e) memberExtractions.push(e);
    }

    if (memberTasks.length === 0) continue;

    const tglMulai = earliestDate(memberTasks.map((m) => m.created));
    const tglSelesai = latestDateIfAllResolved(memberTasks);
    const statusKonservatif = conservativeStatus(memberTasks.map((m) => m.status));

    // Data pendukung: satu baris per anggota: [KEY] - [Reporter] (url)
    const dataPendukungLines = memberTasks.map(
      (m) => `${m.key} - ${m.reporter} (${m.url})`
    );
    const dataPendukung = dataPendukungLines.join('\n');

    const isNeedsVerification =
      Boolean(group.perlu_verifikasi) ||
      memberExtractions.some((e) => e.perlu_verifikasi);

    if (isNeedsVerification) {
      needsVerificationCount++;
    }

    const verificationNote =
      group.catatan_verifikasi ||
      memberExtractions.find((e) => e.catatan_verifikasi)?.catatan_verifikasi ||
      '';

    const sourceTasksMeta = memberTasks.map((m) => ({
      key: m.key,
      summary: m.summary,
      reporter: m.reporter,
      url: m.url,
      status: m.status,
      assignee: m.assignee,
    }));

    rows.push({
      no: rowNumber++,
      kegiatan: group.kegiatan || 'Web Komdigi',
      sasaran_kpi: group.sasaran_kpi,
      capaian: group.capaian,
      rencana_tindak_lanjut: group.rencana_tindak_lanjut || '',
      tanggal_permohonan: tglMulai,
      tanggal_selesai: tglSelesai,
      status: statusKonservatif,
      pemohon: '', // PEMOHON selalu kosong
      data_pendukung: dataPendukung,
      source_keys: group.member_keys,
      needs_verification: isNeedsVerification,
      verification_note: verificationNote,
      source_tasks: sourceTasksMeta,
    });
  }

  // 3. Urutkan baris laporan: Kategori baku (Bagian 21) -> Tanggal permohonan -> ID pertama
  rows.sort((a, b) => {
    const orderA = getCategoryOrder(a.kegiatan);
    const orderB = getCategoryOrder(b.kegiatan);
    if (orderA !== orderB) return orderA - orderB;
    if (a.tanggal_permohonan !== b.tanggal_permohonan) {
      return a.tanggal_permohonan.localeCompare(b.tanggal_permohonan);
    }
    return (a.source_keys[0] || '').localeCompare(b.source_keys[0] || '');
  });

  // Perbaiki penomoran urut
  rows.forEach((r, idx) => {
    r.no = idx + 1;
  });

  // 4. Hitung rekapitulasi & rekonsiliasi
  const uniqueTasks = tasks.length + excludedByAssignee.length;
  const uniqueIncludedKeySet = new Set<string>();
  for (const r of rows) {
    for (const k of r.source_keys) {
      uniqueIncludedKeySet.add(k);
    }
  }
  const includedTasks = uniqueIncludedKeySet.size;
  const excludedTasks = excluded.length;

  const reconciliationValid = uniqueTasks === includedTasks + excludedTasks;

  const rekap: MonthlyRekap = {
    totalEntries,
    uniqueTasks,
    duplicateEntries,
    duplicateKeys,
    includedTasks,
    includedRows: rows.length,
    excludedTasks,
    needsVerification: needsVerificationCount,
    reconciliationValid,
  };

  return { rows, excluded, rekap };
}
