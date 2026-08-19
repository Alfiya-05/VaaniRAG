'use client';

import { useState, useEffect, useCallback } from 'react';
import { MetricsSnapshot } from '@/lib/types';

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
      setMetrics(data);
      setRecentQueries(data.recentQueries || []);
      setTextLatency(data.textLatency);
      setVoiceLatency(data.voiceLatency);
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
