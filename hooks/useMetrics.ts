'use client';

import { useState, useEffect, useCallback } from 'react';
import { MetricsSnapshot } from '@/lib/types';
import { MetricsTracker, readSessionMetrics } from '@/lib/analytics/tracker';

export function useMetrics(pollIntervalMs: number = 5000) {
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [recentQueries, setRecentQueries] = useState<any[]>([]);
  const [textLatency, setTextLatency] = useState<any>(null);
  const [voiceLatency, setVoiceLatency] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/metrics');
      const data = await res.json();
      const sessionMetrics = readSessionMetrics();
      if (sessionMetrics.length > 0) {
        const sessionTracker = new MetricsTracker();
        sessionMetrics.forEach(metric => sessionTracker.record(metric));
        setMetrics(sessionTracker.getSnapshot());
        setRecentQueries(sessionTracker.getRecentMetrics(50).map(metric => ({
          requestId: metric.requestId,
          timestamp: metric.timestamp,
          query: metric.query,
          type: metric.type,
          totalLatency: metric.latency.total,
          grounded: metric.guardrail.grounded,
          success: metric.success,
          tokens: metric.tokens,
        })));
        setTextLatency(sessionTracker.getTextLatencySnapshot());
        setVoiceLatency(sessionTracker.getVoiceLatencySnapshot());
      } else {
        setMetrics(data);
        setRecentQueries(data.recentQueries || []);
        setTextLatency(data.textLatency);
        setVoiceLatency(data.voiceLatency);
      }
    } catch {
      // Silently fail — dashboard stays with stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchMetrics, pollIntervalMs]);

  return { metrics, recentQueries, textLatency, voiceLatency, loading, refresh: fetchMetrics };
}
