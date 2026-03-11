import { NextRequest, NextResponse } from 'next/server';
import { getBestModelScore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> },
) {
  const { modelId } = await params;
  const decoded = decodeURIComponent(modelId);
  const score = await getBestModelScore(decoded);

  if (!score) {
    return NextResponse.json({ error: 'Model not found' }, { status: 404 });
  }

  return NextResponse.json(score);
}
