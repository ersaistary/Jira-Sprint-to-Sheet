import { NextResponse } from 'next/server';
import { getRecentSprints } from '../../lib/jira';

export async function GET() {
  try {
    const sprints = await getRecentSprints();
    return NextResponse.json({ sprints });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Gagal mengambil daftar sprint: ' + (error.message || 'unknown') },
      { status: 500 }
    );
  }
}
