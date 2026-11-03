// app/api/monthly/commit/route.ts
// Endpoint penulisan laporan Monthly ke Google Sheets
// Menulis 2 tab: Tab Utama (10 kolom) dan Tab Follow-up Pemohon (8 kolom)
// Menggunakan SPREADSHEET_ID_MONTHLY (tidak pernah fallback ke spreadsheet change log)

import { NextResponse } from 'next/server';
import { writeMonthlyToSheets } from '../../../lib/sheets';
import { MonthlyCommitResponse } from '../../../types/monthly';

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows = body?.rows;
    const monthLabel = body?.monthLabel;
    const overwrite = Boolean(body?.overwrite);

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tidak ada baris laporan untuk ditulis ke spreadsheet.' },
        { status: 400 }
      );
    }

    const result = await writeMonthlyToSheets({
      rows,
      monthLabel: monthLabel || 'Laporan',
      overwrite,
    });

    if (result.requireConfirmation) {
      return NextResponse.json(
        {
          success: false,
          requireConfirmation: true,
          mainSheetTitle: result.mainSheetTitle,
          followUpSheetTitle: result.followUpSheetTitle,
          error: result.error,
        },
        { status: 409 } // 409 Conflict: butuh konfirmasi timpa tab
      );
    }

    const responseData: MonthlyCommitResponse = {
      success: true,
      link: result.link,
      mainSheetTitle: result.mainSheetTitle,
      followUpSheetTitle: result.followUpSheetTitle,
      count: result.count,
      followUpCount: result.followUpCount,
    };

    return NextResponse.json(responseData);
  } catch (error: unknown) {
    console.error('[Monthly Commit Error]:', error);
    const rawMessage = error instanceof Error ? error.message : '';
    let message = rawMessage || 'Terjadi kesalahan saat menulis laporan ke spreadsheet.';

    if (
      rawMessage.includes('The caller does not have permission') ||
      rawMessage.includes('403') ||
      rawMessage.toLowerCase().includes('permission')
    ) {
      message =
        'Izin Akses Ditolak (Google Sheets 403): Pastikan akun Google Service Account (email di GOOGLE_SERVICE_ACCOUNT_JSON) sudah di-invite sebagai "Editor" di spreadsheet tujuan.';
    } else if (
      rawMessage.includes('Requested entity was not found') ||
      rawMessage.includes('404')
    ) {
      message =
        'Spreadsheet Tidak Ditemukan (Google Sheets 404): Periksa SPREADSHEET_ID_MONTHLY di .env.local, pastikan ID valid dan spreadsheet belum dihapus.';
    }

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

