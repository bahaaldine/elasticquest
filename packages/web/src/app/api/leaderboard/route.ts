import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const leaderboard = await getLeaderboard();

  const format = request.nextUrl.searchParams.get('format');

  if (format === 'csv') {
    const header = 'rank,model_id,model_name,provider,score,max_score,percentage,correct,total,avg_latency_ms,cost_usd,score_per_dollar';
    const rows = leaderboard.map((e) =>
      `${e.rank},"${e.modelId}","${e.modelName}","${e.provider}",${e.totalScore},${e.maxScore},${e.percentage},${e.correct},${e.total},${e.avgLatencyMs},${e.costUsd ?? ''},${e.scorePerDollar ?? ''}`,
    );
    const csv = [header, ...rows].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="elasticquest-leaderboard.csv"',
      },
    });
  }

  return NextResponse.json(leaderboard);
}
