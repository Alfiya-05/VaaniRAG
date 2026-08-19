export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getCollectionInfo } from '@/lib/vectordb/qdrant';

export async function GET() {
  const qdrantInfo = await getCollectionInfo();
  const sttReady = !!process.env.SARVAM_API_KEY;
  const llmReady = !!process.env.GROQ_API_KEY;

  const allHealthy = qdrantInfo.status === 'connected' && sttReady && llmReady;

  return NextResponse.json({
    status: allHealthy ? 'online' : 'degraded',
    vectordb: qdrantInfo,
    stt: sttReady ? 'ready' : 'not_configured',
    llm: llmReady ? 'ready' : 'not_configured',
    timestamp: new Date().toISOString(),
  });
}
