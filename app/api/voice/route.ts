import { NextRequest, NextResponse } from 'next/server';
import { orchestrator } from '@/lib/orchestrator';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Audio file is required' },
        { status: 400 }
      );
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const mimeType = audioFile.type || 'audio/webm';

    const response = await orchestrator.processQuery({
      type: 'voice',
      audio: audioBuffer,
      audioMimeType: mimeType,
    });

    return NextResponse.json(response, { status: response.errorStatusCode && response.errorStatusCode >= 400 ? response.errorStatusCode : 200 });
  } catch (err) {
    console.error('[API /voice] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
