// app/lib/sheets.ts
// Helper integrasi Google Sheets API untuk laporan Monthly (Yanlik)
// Menulis 2 tab: Tab Utama (10 kolom) dan Tab Follow-up Pemohon (8 kolom)
// Disertai preservasi data pemohon/follow-up saat commit ulang

import { google, sheets_v4 } from 'googleapis';
import { MonthlyRow } from '../types/monthly';

export const MAIN_HEADER = [
  'NO',
  'KEGIATAN',
  'SASARAN DAN KEY PERFORMANCE INDICATOR',
  'CAPAIAN',
  'RENCANA TINDAK LANJUT / PENDING MATTERS',
  'TANGGAL PERMOHONAN',
  'TANGGAL SELESAI',
  'STATUS',
  'PEMOHON',
  'DATA PENDUKUNG',
];

export const FOLLOW_UP_HEADER = [
  'Reporter',
  'Jira ID',
  'Judul Task',
  'Kegiatan',
  'Baris Laporan',
  'Status Follow-up',
  'Pemohon',
  'Link Jira',
];

// Kolom lebar untuk Tab Utama
const MAIN_COLUMN_WIDTHS = [
  45,  // NO
  150, // KEGIATAN
  280, // SASARAN KPI
  300, // CAPAIAN
  220, // RENCANA TINDAK LANJUT
  105, // TANGGAL PERMOHONAN
  105, // TANGGAL SELESAI
  90,  // STATUS
  110, // PEMOHON
  340, // DATA PENDUKUNG
];

// Kolom lebar untuk Tab Follow-up
const FOLLOW_UP_COLUMN_WIDTHS = [
  160, // Reporter
  110, // Jira ID
  280, // Judul Task
  150, // Kegiatan
  90,  // Baris Laporan
  130, // Status Follow-up
  130, // Pemohon
  260, // Link Jira
];

export function getSpreadsheetIdMonthly(): string {
  const id = process.env.SPREADSHEET_ID_MONTHLY;
  if (!id || !id.trim()) {
    throw new Error(
      'Env SPREADSHEET_ID_MONTHLY belum diset di .env.local. Masukkan Spreadsheet ID Monthly terlebih dahulu.'
    );
  }
  return id.trim();
}

export function getSheetsClient(): sheets_v4.Sheets {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    throw new Error(
      'Env GOOGLE_SERVICE_ACCOUNT_JSON belum diset di .env.local.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(saJson),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// Cari tab berdasarkan judul
export async function findSheetByTitle(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  title: string
): Promise<{ sheetId: number; title: string } | null> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === title);
  if (typeof sheet?.properties?.sheetId === 'number' && sheet.properties.title) {
    return {
      sheetId: sheet.properties.sheetId,
      title: sheet.properties.title,
    };
  }
  return null;
}

// Pastikan tab ada: jika sudah ada kembalikan sheetId, jika belum buat baru
export async function ensureSheetExists(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  title: string
): Promise<{ sheetId: number; isNew: boolean }> {
  const existing = await findSheetByTitle(sheets, spreadsheetId, title);
  if (existing) {
    return { sheetId: existing.sheetId, isNew: false };
  }

  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title,
            },
          },
        },
      ],
    },
  });

  const createdId = res.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (createdId === undefined || createdId === null) {
    throw new Error(`Gagal membuat tab baru "${title}" di Google Sheets.`);
  }

  return { sheetId: createdId, isNew: true };
}

// Baca data follow-up lama untuk preservasi (Bagian 12.3)
export async function readExistingFollowUpData(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  followUpTitle: string
): Promise<Map<string, { statusFollowUp: string; pemohon: string }>> {
  const map = new Map<string, { statusFollowUp: string; pemohon: string }>();

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${followUpTitle}'!A1:H`,
    });

    const rows = res.data.values;
    if (Array.isArray(rows) && rows.length > 1) {
      // Baris 0 adalah header, data mulai baris 1
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const jiraId = (row[1] || '').trim();
        const statusFollowUp = (row[5] || '').trim();
        const pemohon = (row[6] || '').trim();

        if (jiraId) {
          map.set(jiraId, {
            statusFollowUp: statusFollowUp || 'Belum ditanya',
            pemohon: pemohon || '',
          });
        }
      }
    }
  } catch (err: unknown) {
    console.warn(`[Monthly Sheets] Tab follow-up "${followUpTitle}" belum ada atau kosong:`, err);
  }

  return map;
}

// Format dasar untuk sheet (Freeze header, styling header, text wrap, lebar kolom)
export async function applySheetFormatting(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number,
  columnWidths: number[],
  totalRows: number,
  headerBgColor = { red: 0.20, green: 0.21, blue: 0.24 }
): Promise<void> {
  const requests: sheets_v4.Schema$Request[] = [
    // Freeze header baris 1
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    // Format Header Baris 1: Background gelap, text putih bold, center
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: headerBgColor,
            textFormat: {
              bold: true,
              foregroundColor: { red: 1, green: 1, blue: 1 },
              fontSize: 10,
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP',
          },
        },
        fields:
          'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
      },
    },
    // Format Sel Data: Text wrap & vertical alignment top
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: Math.max(2, totalRows),
        },
        cell: {
          userEnteredFormat: {
            verticalAlignment: 'TOP',
            wrapStrategy: 'WRAP',
            textFormat: {
              fontSize: 10,
            },
          },
        },
        fields: 'userEnteredFormat(verticalAlignment,wrapStrategy,textFormat)',
      },
    },
  ];

  // Atur lebar tiap kolom
  for (let c = 0; c < columnWidths.length; c++) {
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: c,
          endIndex: c + 1,
        },
        properties: {
          pixelSize: columnWidths[c],
        },
        fields: 'pixelSize',
      },
    });
  }

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  } catch (err: unknown) {
    console.warn(`[Monthly Sheets] Formatting sheetId ${sheetId} gagal atau parsial:`, err);
  }
}

export type CommitMonthlyParams = {
  rows: MonthlyRow[];
  monthLabel: string;
  overwrite?: boolean;
};

export type CommitMonthlyResult = {
  success: boolean;
  link?: string;
  mainSheetTitle?: string;
  followUpSheetTitle?: string;
  count?: number;
  followUpCount?: number;
  requireConfirmation?: boolean;
  error?: string;
};

// Fungsi utama penulisan dua tab ke Google Sheets
export async function writeMonthlyToSheets({
  rows,
  monthLabel,
  overwrite = false,
}: CommitMonthlyParams): Promise<CommitMonthlyResult> {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Tidak ada baris laporan untuk ditulis ke spreadsheet.');
  }

  const cleanMonth = (monthLabel || 'Laporan').trim();
  const mainSheetTitle = `Monthly ${cleanMonth}`;
  const followUpSheetTitle = `Follow-up Pemohon ${cleanMonth}`;

  const spreadsheetId = getSpreadsheetIdMonthly();
  const sheets = getSheetsClient();

  // Periksa apakah tab utama sudah ada sebelumnya
  const existingMain = await findSheetByTitle(sheets, spreadsheetId, mainSheetTitle);
  if (existingMain && !overwrite) {
    // Meminta konfirmasi timpa kepada user
    return {
      success: false,
      requireConfirmation: true,
      mainSheetTitle,
      followUpSheetTitle,
      error: `Tab "${mainSheetTitle}" sudah ada di Google Sheets. Apakah Anda ingin menimpa (overwrite) tab tersebut?`,
    };
  }

  // 1. Siapkan Tab Utama
  const { sheetId: mainSheetId } = await ensureSheetExists(
    sheets,
    spreadsheetId,
    mainSheetTitle
  );

  // 2. Siapkan Tab Follow-up
  const { sheetId: followUpSheetId, isNew: isFollowUpNew } = await ensureSheetExists(
    sheets,
    spreadsheetId,
    followUpSheetTitle
  );

  // 3. Baca data follow-up lama jika tab sudah ada sebelumnya (Preservation)
  let existingFollowUpMap = new Map<string, { statusFollowUp: string; pemohon: string }>();
  if (!isFollowUpNew) {
    existingFollowUpMap = await readExistingFollowUpData(
      sheets,
      spreadsheetId,
      followUpSheetTitle
    );
  }

  // 4. Susun baris untuk Tab Utama (10 Kolom)
  const mainValues = [
    MAIN_HEADER,
    ...rows.map((r, idx) => [
      idx + 1,
      r.kegiatan || '',
      r.sasaran_kpi || '',
      r.capaian || '',
      r.rencana_tindak_lanjut || '',
      r.tanggal_permohonan || '',
      r.tanggal_selesai || '',
      r.status || '',
      '', // PEMOHON selalu kosong di tabel utama
      r.data_pendukung || '',
    ]),
  ];

  // 5. Susun baris untuk Tab Follow-up (1 baris per tiket sumber, diurutkan Reporter -> Jira ID)
  type FollowUpEntry = {
    reporter: string;
    jiraId: string;
    summary: string;
    kegiatan: string;
    barisLaporan: number;
    url: string;
  };

  const followUpEntries: FollowUpEntry[] = [];

  for (const row of rows) {
    if (row.source_tasks && row.source_tasks.length > 0) {
      for (const t of row.source_tasks) {
        followUpEntries.push({
          reporter: t.reporter || 'Unassigned',
          jiraId: t.key,
          summary: t.summary || '',
          kegiatan: row.kegiatan || '',
          barisLaporan: row.no,
          url: t.url || `https://komdigi.atlassian.net/browse/${t.key}`,
        });
      }
    } else if (row.source_keys && row.source_keys.length > 0) {
      for (const key of row.source_keys) {
        followUpEntries.push({
          reporter: 'Unassigned',
          jiraId: key,
          summary: row.kegiatan || '',
          kegiatan: row.kegiatan || '',
          barisLaporan: row.no,
          url: `https://komdigi.atlassian.net/browse/${key}`,
        });
      }
    }
  }

  // Urutkan berdasarkan Reporter, lalu Jira ID
  followUpEntries.sort((a, b) => {
    const repComp = a.reporter.localeCompare(b.reporter);
    if (repComp !== 0) return repComp;
    return a.jiraId.localeCompare(b.jiraId);
  });

  const followUpValues = [
    FOLLOW_UP_HEADER,
    ...followUpEntries.map((item) => {
      // Preservasi jawaban status follow-up dan pemohon jika sudah pernah diisi
      const preserved = existingFollowUpMap.get(item.jiraId);
      const statusFollowUp = preserved?.statusFollowUp || 'Belum ditanya';
      const pemohon = preserved?.pemohon || '';

      return [
        item.reporter,
        item.jiraId,
        item.summary,
        item.kegiatan,
        item.barisLaporan,
        statusFollowUp,
        pemohon,
        item.url,
      ];
    }),
  ];

  // 6. Kosongkan rentang lama lalu tulis data baru ke Tab Utama
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${mainSheetTitle}'!A1:Z`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${mainSheetTitle}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: mainValues },
  });

  // 7. Kosongkan rentang lama lalu tulis data baru ke Tab Follow-up
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${followUpSheetTitle}'!A1:Z`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${followUpSheetTitle}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: followUpValues },
  });

  // 8. Terapkan pemformatan visual (freeze header, wrap text, column widths)
  await applySheetFormatting(
    sheets,
    spreadsheetId,
    mainSheetId,
    MAIN_COLUMN_WIDTHS,
    mainValues.length,
    { red: 0.20, green: 0.21, blue: 0.24 } // header slate gelap
  );

  await applySheetFormatting(
    sheets,
    spreadsheetId,
    followUpSheetId,
    FOLLOW_UP_COLUMN_WIDTHS,
    followUpValues.length,
    { red: 0.12, green: 0.16, blue: 0.23 } // header navy gelap
  );

  const mainSheetLink = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${mainSheetId}`;

  return {
    success: true,
    link: mainSheetLink,
    mainSheetTitle,
    followUpSheetTitle,
    count: rows.length,
    followUpCount: followUpEntries.length,
  };
}

