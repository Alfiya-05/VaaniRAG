'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import BackgroundNetwork from '@/components/BackgroundNetwork';
import { useMetrics } from '@/hooks/useMetrics';

type HealthSnapshot = {
  status?: string;
  vectordb?: { status?: string; collection?: string; points_count?: number; vectors_count?: number };
  stt?: string;
  llm?: string;
};

type IconName = 'chart' | 'arrow' | 'refresh' | 'mic' | 'check' | 'database' | 'spark' | 'pulse';

function Icon({ name, size = 17 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (name === 'chart') return <svg {...common}><path d="M4 19.5V4.5M4 19.5h16" /><path d="m7 15 3-4 3 2 5-6" /></svg>;
  if (name === 'arrow') return <svg {...common}><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
  if (name === 'refresh') return <svg {...common}><path d="M20 11a8 8 0 0 0-14.5-3L4 10" /><path d="M4 5v5h5M4 13a8 8 0 0 0 14.5 3L20 14" /><path d="M20 19v-5h-5" /></svg>;
  if (name === 'mic') return <svg {...common}><rect x="9" y="2.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7" /></svg>;
  if (name === 'check') return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
  if (name === 'database') return <svg {...common}><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7" /></svg>;
  if (name === 'spark') return <svg {...common}><path d="m12 3 1.5 6.5L20 11l-6.5 1.5L12 19l-1.5-6.5L4 11l6.5-1.5L12 3Z" /><path d="m19 3 .5 2 1.5.5-1.5.5-.5 2-.5-2L17 5.5l1.5-.5.5-2Z" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2.5" /></svg>;
}

function formatValue(value: number | string | undefined, suffix = '') {
  if (value === undefined || value === null || value === '') return '—';
  return `${typeof value === 'number' ? value.toLocaleString() : value}${suffix}`;
}

function MetricCard({ label, value, target, pass }: { label: string; value: number | string; target?: string; pass?: boolean | null }) {
  return <article className="dash-metric-card">
    <div className="dash-metric-top"><span>{label}</span>{pass !== undefined && pass !== null && <span className={`dash-status-mark ${pass ? 'pass' : 'watch'}`}>{pass ? <Icon name="check" size={11} /> : <span />}</span>}</div>
    <strong>{formatValue(value, typeof value === 'number' ? ' ms' : '')}</strong>
    {target && <small className={pass === false ? 'watch-copy' : ''}>Target {target}</small>}
  </article>;
}

function SectionHeading({ eyebrow, title, copy }: { eyebrow?: string; title: string; copy?: string }) {
  return <div className="dash-section-heading">
    {eyebrow && <span className="dash-eyebrow"><i />{eyebrow}</span>}
    <h2>{title}</h2>
    {copy && <p>{copy}</p>}
  </div>;
}

function Panel({ title, icon, children, className = '' }: { title: string; icon?: IconName; children: React.ReactNode; className?: string }) {
  return <section className={`dash-panel ${className}`}><div className="dash-panel-heading"><h3>{title}</h3>{icon && <span className="dash-panel-icon"><Icon name={icon} size={16} /></span>}</div>{children}</section>;
}

function PipelineBreakdown({ metrics }: { metrics: any }) {
  const items = [
    ['STT', metrics.pipelineBreakdown.stt_avg],
    ['Embedding', metrics.pipelineBreakdown.embedding_avg],
    ['Retrieval', metrics.pipelineBreakdown.retrieval_avg],
    ['Reranking', metrics.pipelineBreakdown.reranking_avg],
    ['Generation', metrics.pipelineBreakdown.generation_avg],
    ['Grounding', metrics.pipelineBreakdown.grounding_avg],
  ] as [string, number][];
  const max = Math.max(...items.map(([, value]) => Number(value) || 0), 1);
  return <Panel title="Pipeline breakdown" icon="pulse" className="dash-pipeline-panel">
    <div className="dash-pipeline" aria-label="Pipeline stage average latencies">
      {items.map(([label, value], index) => <div className="dash-pipeline-stage" key={label}>
        <div className="dash-pipeline-stage-top"><span className="dash-pipeline-node">{index + 1}</span><strong>{label}</strong><b>{formatValue(value, ' ms')}</b></div>
        <div className="dash-pipeline-track"><span style={{ width: `${Math.max(5, ((Number(value) || 0) / max) * 100)}%` }} /></div>
      </div>)}
    </div>
  </Panel>;
}

function ComparisonCard({ title, icon, latency }: { title: string; icon: IconName; latency: any }) {
  return <article className="dash-comparison-card"><div className="dash-comparison-title"><span><Icon name={icon} size={15} />{title}</span><small>{latency ? `${latency.count} queries` : title === 'Voice' ? 'No voice samples yet' : 'No text samples yet'}</small></div>{latency ? <div className="dash-comparison-grid">{[['P50', latency.p50], ['P70', latency.p70], ['P100', latency.p100], ['Average', latency.avg]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{formatValue(value, ' ms')}</strong></div>)}</div> : <div className="dash-empty-comparison"><Icon name={icon} size={17} />No {title.toLowerCase()} samples yet</div>}</article>;
}

function StatusValue({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: string }) {
  return <div className="dash-health-row"><span><i className={`dash-health-dot ${tone}`} />{label}</span><strong>{value}</strong></div>;
}

export default function DashboardPage() {
  const { metrics, recentQueries, textLatency, voiceLatency, loading, refresh } = useMetrics(3000);
  const [health, setHealth] = useState<HealthSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    const loadHealth = async () => {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' });
        const data = await response.json();
        if (active) setHealth(data);
      } catch {
        if (active) setHealth(null);
      }
    };
    loadHealth();
    return () => { active = false; };
  }, []);

  const systemLabel = health?.status === 'online' ? 'System online' : health?.status === 'degraded' ? 'System degraded' : 'System status';
  const systemTone = health?.status === 'online' ? 'online' : health?.status === 'degraded' ? 'warning' : 'neutral';
  const guardrailTotal = useMemo(() => metrics ? metrics.guardrails.grounded + metrics.guardrails.insufficient + metrics.guardrails.off_topic + metrics.guardrails.unsafe : 0, [metrics]);

  if (loading || !metrics) {
    return <div className="vaani-dashboard"><BackgroundNetwork subdued /><DashboardHeader systemLabel={systemLabel} systemTone={systemTone} loading /><div className="dash-loading"><span className="dash-loading-mark"><i /><i /><i /></span><p>Loading system performance…</p></div></div>;
  }

  return <div className="vaani-dashboard">
    <BackgroundNetwork subdued />
    <DashboardHeader systemLabel={systemLabel} systemTone={systemTone} />
    <main className="dash-main">
      <SectionHeading eyebrow="AI knowledge engine" title="System performance" copy="Monitor how VaaniRAG retrieves, processes, and grounds answers." />

      <section className="dash-summary-grid" aria-label="Query summary">
        <MetricCard label="Total queries" value={metrics.queryCount} />
        <MetricCard label="Text" value={metrics.textQueries} />
        <MetricCard label="Voice" value={metrics.voiceQueries} />
      </section>

      <SectionHeading title="Response performance" copy="Latency across the complete response path." />
      <section className="dash-metrics-grid" aria-label="Response performance metrics">
        <MetricCard label="P50" value={metrics.latency.p50} target="<200 ms" pass={metrics.latency.p50 < 200} />
        <MetricCard label="P70" value={metrics.latency.p70} target="<300 ms" pass={metrics.latency.p70 < 300} />
        <MetricCard label="P100" value={metrics.latency.p100} target="<500 ms" pass={metrics.latency.p100 < 500} />
        <MetricCard label="Average" value={metrics.latency.avg} />
        <MetricCard label="Minimum" value={metrics.latency.min} />
        <MetricCard label="Maximum" value={metrics.latency.max} />
      </section>

      <div className="dash-two-column"><Panel title="Text vs voice" icon="chart"><div className="dash-comparison-stack"><ComparisonCard title="Text" icon="chart" latency={textLatency} /><ComparisonCard title="Voice" icon="mic" latency={voiceLatency} /></div></Panel><Panel title="Token usage" icon="spark"><div className="dash-token-list"><div><span>Input</span><strong>{formatValue(metrics.tokens.avg_input)}</strong></div><div><span>Output</span><strong>{formatValue(metrics.tokens.avg_output)}</strong></div><div><span>Total</span><strong>{formatValue(metrics.tokens.avg_total)}</strong></div></div></Panel></div>

      <PipelineBreakdown metrics={metrics} />

      <div className="dash-three-column"><Panel title="Answer quality" icon="check"><div className="dash-quality-list"><StatusValue label="Grounded" value={formatValue(metrics.guardrails.grounded)} tone="grounded" /><StatusValue label="Insufficient" value={formatValue(metrics.guardrails.insufficient)} tone="insufficient" /><StatusValue label="Off-topic" value={formatValue(metrics.guardrails.off_topic)} tone="offtopic" /><StatusValue label="Unsafe" value={formatValue(metrics.guardrails.unsafe)} tone="unsafe" /></div><div className="dash-quality-bar" aria-label={`Answer quality distribution across ${guardrailTotal} results`}>{guardrailTotal > 0 && <><span className="grounded" style={{ width: `${(metrics.guardrails.grounded / guardrailTotal) * 100}%` }} /><span className="insufficient" style={{ width: `${(metrics.guardrails.insufficient / guardrailTotal) * 100}%` }} /><span className="offtopic" style={{ width: `${(metrics.guardrails.off_topic / guardrailTotal) * 100}%` }} /><span className="unsafe" style={{ width: `${(metrics.guardrails.unsafe / guardrailTotal) * 100}%` }} /></>}</div></Panel><Panel title="System status" icon="database"><div className="dash-health-list">{health ? <><StatusValue label="Vector database" value={health.vectordb?.status === 'connected' ? 'Connected' : health.vectordb?.status || 'Unknown'} tone={health.vectordb?.status === 'connected' ? 'grounded' : 'warning'} /><StatusValue label="LLM" value={health.llm === 'ready' ? 'Ready' : health.llm || 'Unknown'} tone={health.llm === 'ready' ? 'grounded' : 'warning'} /><StatusValue label="Voice / STT" value={health.stt === 'ready' ? 'Ready' : health.stt || 'Unknown'} tone={health.stt === 'ready' ? 'grounded' : 'warning'} /><StatusValue label="Collection" value={health.vectordb?.collection || '—'} /><StatusValue label="Points" value={formatValue(health.vectordb?.points_count)} /></> : <div className="dash-health-unavailable">Health data unavailable</div>}</div></Panel><Panel title="Recent activity" icon="chart"><div className="dash-mini-activity">{recentQueries.length === 0 ? <p>No queries yet.</p> : recentQueries.slice().reverse().slice(0, 4).map((query: any) => <div key={query.requestId}><span className={`dash-activity-dot ${query.grounded ? 'grounded' : 'insufficient'}`} /><div><strong>{query.query}</strong><small>{query.type} · {formatValue(query.totalLatency, ' ms')}</small></div></div>)}</div></Panel></div>

      <section className="dash-recent-section"><div className="dash-section-inline"><SectionHeading title="Recent queries" copy="Latest requests recorded by the system." /><button className="dash-refresh-button" onClick={refresh}><Icon name="refresh" size={15} /> Refresh</button></div><div className="dash-table-wrap">{recentQueries.length === 0 ? <p className="dash-empty-table">No queries yet. Ask a question to see metrics here.</p> : <table className="dash-table"><thead><tr><th>Request</th><th>Type</th><th>Query</th><th>Latency</th><th>Grounded</th><th>Tokens</th></tr></thead><tbody>{recentQueries.slice().reverse().map((query: any) => <tr key={query.requestId}><td className="dash-request-id">{query.requestId}</td><td><span className="dash-type-badge">{query.type}</span></td><td className="dash-query-cell">{query.query}</td><td>{formatValue(query.totalLatency, ' ms')}</td><td><span className={`dash-grounded-badge ${query.grounded ? 'yes' : 'no'}`}>{query.grounded ? 'Yes' : 'No'}</span></td><td>{formatValue(query.tokens?.total_tokens)}</td></tr>)}</tbody></table>}</div></section>
    </main>
  </div>;
}

function DashboardHeader({ systemLabel, systemTone }: { systemLabel: string; systemTone: string; loading?: boolean }) {
  return <header className="dash-header"><div className="dash-brand-group"><Link href="/" className="dash-brand">VAANI <span>RAG</span></Link><span className="dash-event-badge">HH GOA 2026</span><span className="dash-view-badge">SYSTEM PERFORMANCE</span></div><nav className="dash-nav" aria-label="Dashboard navigation"><span className={`dash-system-status ${systemTone}`}><i />{systemLabel}</span><Link href="/" className="dash-back-link">Back to App <Icon name="arrow" size={14} /></Link></nav></header>;
}
