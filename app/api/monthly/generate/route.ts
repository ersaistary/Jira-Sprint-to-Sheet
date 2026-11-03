// app/api/monthly/generate/route.ts
// Endpoint backend pemrosesan laporan Monthly (Yanlik)
// Mengambil task Jira -> Prefilter -> Gemini AI Tahap 1 -> Gemini AI Tahap 2 (Grouping) -> Preview JSON (TIDAK menulis ke Sheets)

import { NextResponse } from 'next/server';
import { fetchMonthlyTasks } from '../../../lib/jira';
import {
  prefilterMonthlyTasks,
  extractMonthlyTasksWithAI,
  groupMonthlyTasksWithAI,
  assemblePhase4Results,
} from '../../../lib/monthly';
import { MonthlyGenerateResponse } from '../../../types/monthly';

export const maxDuration = 300; // Local execution budget hingga 5 menit

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sprintIds = body?.sprintIds;

    // Validasi input
    if (!Array.isArray(sprintIds) || sprintIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Pilih minimal 1 sprint untuk diproses.' },
        { status: 400 }
      );
    }

    if (sprintIds.length > 5) {
      return NextResponse.json(
        { success: false, error: 'Maksimal 5 sprint yang dapat diproses sekaligus.' },
        { status: 400 }
      );
    }

    // 1. Ambil task dari sprint terpilih via Jira API
    const fetchResult = await fetchMonthlyTasks(sprintIds);
    if (fetchResult.tasks.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tidak ada task yang ditemukan pada sprint terpilih.' },
        { status: 400 }
      );
    }

    // 2. Prefilter deterministik (Assignee Rafli Aran & Eryan dikeluarkan sebelum AI)
    const { eligibleTasks, excludedByAssignee } = prefilterMonthlyTasks(fetchResult.tasks);

    // 3. Evaluasi kelayakan & perumusan kolom via Gemini AI Tahap 1
    const extractions = await extractMonthlyTasksWithAI(eligibleTasks);

    // 4. Pengelompokan baris laporan via Gemini AI Tahap 2 (Fase 4 Grouping)
    const includedTasks = eligibleTasks.filter((t) => {
      const ext = extractions.find((e) => e.key === t.key);
      return ext?.masuk_laporan === true;
    });

    const { groups, warnings } = await groupMonthlyTasksWithAI(includedTasks, extractions);

    // 5. Rakit baris laporan, tabel pengecualian, dan rekapitulasi (Fase 4)
    const { rows, excluded, rekap } = assemblePhase4Results(
      eligibleTasks,
      excludedByAssignee,
      extractions,
      groups,
      fetchResult.totalEntries,
      fetchResult.duplicateEntries,
      fetchResult.duplicateKeys
    );

    const responseData: MonthlyGenerateResponse = {
      success: true,
      rows,
      excluded,
      rekap,
      meta: {
        sprints: fetchResult.sprints,
        warnings,
      },
    };

    return NextResponse.json(responseData);
  } catch (error: unknown) {
    console.error('[Monthly Generate Error]:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Terjadi kesalahan saat memproses laporan Monthly.';
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
