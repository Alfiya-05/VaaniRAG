import { NextResponse } from 'next/server';
import { metricsTracker } from '@/lib/analytics/tracker';

export async function GET() {
  const snapshot = metricsTracker.getSnapshot();
  const textLatency = metricsTracker.getTextLatencySnapshot();
  const voiceLatency = metricsTracker.getVoiceLatencySnapshot();
  const recentMetrics = metricsTracker.getRecentMetrics(50);

  return NextResponse.json({
    ...snapshot,
    textLatency,
    voiceLatency,
    recentQueries: recentMetrics.map(m => ({
      requestId: m.requestId,
      timestamp: m.timestamp,
      query: m.query,
      type: m.type,
      totalLatency: m.latency.total,
      grounded: m.guardrail.grounded,
      success: m.success,
      tokens: m.tokens,
    })),
  });
}
