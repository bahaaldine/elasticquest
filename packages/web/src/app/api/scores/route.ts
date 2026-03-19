import { NextRequest, NextResponse } from 'next/server';
import { addScore } from '@/lib/store';
import type { ScoreSubmission } from '@/lib/store';

const ADMIN_KEY = process.env.ELASTIC_QUEST_ADMIN_KEY ?? '';

export async function POST(request: NextRequest) {
  try {
    // Require admin key for all submissions
    const authKey = request.headers.get('x-admin-key') ?? '';
    if (!ADMIN_KEY || authKey !== ADMIN_KEY) {
      return NextResponse.json(
        {
          error: 'Unauthorized. Public submissions are disabled. ' +
            'Only the ElasticQuest maintainer can submit to the public leaderboard.',
        },
        { status: 403 },
      );
    }

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
