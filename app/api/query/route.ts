import { NextRequest, NextResponse } from 'next/server';
import { orchestrator } from '@/lib/orchestrator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = body.query;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    const response = await orchestrator.processQuery({
      type: 'text',
      query: query.trim(),
    });

    return NextResponse.json(response);
  } catch (err) {
    console.error('[API /query] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
