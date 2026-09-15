import { NextResponse } from 'next/server';
import { google } from 'googleapis';

const HEADER_ROW = [
  'Kode Perubahan', 'Kegiatan Perubahan', 'Deskripsi Singkat',
  'Tanggal Mulai', 'Tahun/Bulan Mulai', 'Tanggal Selesai', 'Tahun/Bulan Selesai',
  'Nama Tim/Pokja', 'Nama Tim Fokus', 'Pelaksana', 'Lokasi/Sistem/CI/Layanan Terkait',
  'Status Perubahan', 'Inisiasi Perubahan', 'Detail Perubahan', 'Hasil/Output',
  'Dampak Realisasi', 'Dokumentasi', 'Keterangan', 'Status',
];

// Beberapa task Jira nampilin username mentah sebagai Assignee. Petakan di sini.
const NAME_MAP: Record<string, string> = {
  tinoimammp: 'Tino Imam Maulana',
};

function normalizeName(name: string): string {
  const trimmed = (name || '').trim();
  const key = trimmed.toLowerCase();
  return NAME_MAP[key] || trimmed;
}

function makeSheetTitle(): string {
  const now = new Date();
  const d = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const t = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const raw = 'Sprint ' + d + ' ' + t;
  // Karakter : / \ ? * [ ] tidak boleh dipakai di nama tab Google Sheets
  return raw.replace(/[:/\\?*[\]]/g, '.');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rowsData = body?.rows;
    if (!Array.isArray(rowsData) || rowsData.length === 0) {
      return NextResponse.json({ error: 'Tidak ada baris untuk ditulis.' }, { status: 400 });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SPREADSHEET_ID!;

    const rows = rowsData.map((item: any) => [
      item.kode_perubahan || '', '', '', item.tanggal_mulai || '', '', item.tanggal_selesai || '', '', '', '',
      item.pelaksana ? normalizeName(item.pelaksana) : '', item.lokasi || '', item.status_perubahan || '', item.inisiasi || '', item.detail || '',
      item.hasil || '', item.dampak || '', '', item.keterangan || '', item.status || ''
    ]);

    // Kalau existingSheetTitle dikirim & tab-nya masih ada -> overwrite tab itu.
    // Kalau tidak -> bikin tab baru.
    let sheetTitle: string | null = (body.existingSheetTitle as string) || null;
    let sheetId: number | undefined;

    if (sheetTitle) {
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      const found = meta.data.sheets?.find((s) => s.properties?.title === sheetTitle);
      if (found) {
        sheetId = found.properties?.sheetId ?? undefined;

      } else {
        sheetTitle = null; // tab sudah terhapus -> buat baru
      }
    }

    if (!sheetTitle || sheetId === undefined) {
      sheetTitle = makeSheetTitle();
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const res = await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
          });
          sheetId = res.data.replies?.[0]?.addSheet?.properties?.sheetId ?? undefined;
          break;
        } catch (err: any) {
          console.error('[Commit] addSheet gagal (attempt ' + (attempt + 1) + '):', JSON.stringify(err?.errors || err?.message || err, null, 2));
          if ((err?.errors?.[0]?.message || err?.message || '').toLowerCase().includes('already exists')) {
            sheetTitle = sheetTitle + ' (' + (attempt + 2) + ')';
            continue;
          }
          throw err;
        }
      }
      if (sheetId === undefined) throw new Error('Gagal membuat tab sheet baru.');
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetTitle}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [HEADER_ROW, ...rows] },
    });

    return NextResponse.json({
      success: true,
      link: 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit#gid=' + sheetId,
      sheetTitle,
      count: rows.length,
    });
  } catch (error: any) {
    console.error('Detail Error di Terminal:', error);
    return NextResponse.json(
      { error: `Gagal: ${error.message || 'Terjadi kesalahan internal'}` },
      { status: 500 }
    );
  }
}
