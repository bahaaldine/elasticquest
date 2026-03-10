import { NextRequest, NextResponse } from 'next/server';
import { addScore } from '@/lib/store';
import type { ScoreSubmission } from '@/lib/store';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ScoreSubmission;

    // Basic validation
    if (!body.modelId || !body.totalScore === undefined || !body.maxPossibleScore) {
      return NextResponse.json(
        { error: 'Missing required fields: modelId, totalScore, maxPossibleScore' },
        { status: 400 },
      );
    }

    await addScore(body);

    return NextResponse.json({ success: true, modelId: body.modelId });
  } catch (error) {
    return NextResponse.json(
      { error: `Invalid request: ${error instanceof Error ? error.message : String(error)}` },
      { status: 400 },
    );
  }
}
