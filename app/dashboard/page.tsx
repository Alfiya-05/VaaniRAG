'use client';

import Link from 'next/link';
import { useMetrics } from '@/hooks/useMetrics';

function MetricCard({ label, value, unit, target, pass }: {
  label: string; value: number | string; unit?: string; target?: string; pass?: boolean | null;
}) {
  const color = pass === true ? 'var(--success)' : pass === false ? 'var(--danger)' : 'var(--text-primary)';
  return (
    <div className="metric-card glass-card">
      <div className="metric-value" style={{ color }}>{value}{unit}</div>
      <div className="metric-label">{label}</div>
      {target && (
        <div className="metric-target" style={{ color: pass ? 'var(--success)' : 'var(--danger)' }}>
          {pass ? '✓' : '✗'} Target: {target}
        </div>
      )}
    </div>
  );
}

function StatBlock({ title, stats }: { title: string; stats: { label: string; value: string | number }[] }) {
  return (
    <div className="glass-card" style={{ padding: '20px' }}>
      <div className="section-title">{title}</div>
      {stats.map((s, i) => (
        <div className="stat-row" key={i}>
          <span className="stat-label">{s.label}</span>
          <span className="stat-value">{s.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { metrics, recentQueries, textLatency, voiceLatency, loading, refresh } = useMetrics(3000);

  if (loading || !metrics) {
    return (
      <>
        <header className="header">
          <div className="header-logo">
            <h1>VAANI RAG</h1>
            <span className="badge badge-accent">DASHBOARD</span>
          </div>
          <Link href="/" className="nav-link">← Back to App</Link>
        </header>
        <div className="dashboard-container" style={{ textAlign: 'center', paddingTop: '100px' }}>
          <div className="loading-spinner" style={{ margin: '0 auto' }} />
          <p style={{ color: 'var(--text-muted)', marginTop: '16px' }}>Loading metrics...</p>
        </div>
      </>
    );
  }

  const target200 = 200;

  return (
    <>
      <header className="header">
        <div className="header-logo">
          <h1>VAANI RAG</h1>
          <span className="badge badge-accent">DASHBOARD</span>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={refresh}
            className="nav-link"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            🔄 Refresh
          </button>
          <Link href="/" className="nav-link">← Back to App</Link>
        </div>
      </header>

      <div className="dashboard-container">
        <h2 className="dashboard-title">RAG Performance Analytics</h2>

        {/* Query count */}
        <div style={{ marginBottom: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <span className="badge badge-accent" style={{ fontSize: '12px', padding: '6px 14px' }}>
            {metrics.queryCount} Total Queries
          </span>
          <span className="badge badge-success" style={{ fontSize: '12px', padding: '6px 14px' }}>
            {metrics.textQueries} Text
          </span>
          <span className="badge badge-warning" style={{ fontSize: '12px', padding: '6px 14px' }}>
            {metrics.voiceQueries} Voice
          </span>
        </div>

        {/* ===== LATENCY CARDS ===== */}
        <div className="section-title">📊 Pipeline Latency</div>
        <div className="metrics-grid">
          <MetricCard label="P50" value={metrics.latency.p50} unit="ms" target={`<${target200}ms`} pass={metrics.latency.p50 < target200} />
          <MetricCard label="P70" value={metrics.latency.p70} unit="ms" target={`<${target200 * 1.5}ms`} pass={metrics.latency.p70 < target200 * 1.5} />
          <MetricCard label="P100" value={metrics.latency.p100} unit="ms" target={`<${target200 * 2.5}ms`} pass={metrics.latency.p100 < target200 * 2.5} />
          <MetricCard label="Average" value={metrics.latency.avg} unit="ms" />
          <MetricCard label="Minimum" value={metrics.latency.min} unit="ms" />
          <MetricCard label="Maximum" value={metrics.latency.max} unit="ms" />
        </div>

        {/* ===== TEXT VS VOICE ===== */}
        {(textLatency || voiceLatency) && (
          <>
            <div className="section-title" style={{ marginTop: '16px' }}>🔤 Text vs 🎙️ Voice Latency</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
              {textLatency && (
                <StatBlock title={`Text Pipeline (${textLatency.count} queries)`} stats={[
                  { label: 'P50', value: `${textLatency.p50}ms` },
                  { label: 'P70', value: `${textLatency.p70}ms` },
                  { label: 'P100', value: `${textLatency.p100}ms` },
                  { label: 'Average', value: `${textLatency.avg}ms` },
                ]} />
              )}
              {voiceLatency && (
                <StatBlock title={`Voice Pipeline (${voiceLatency.count} queries)`} stats={[
                  { label: 'P50', value: `${voiceLatency.p50}ms` },
                  { label: 'P70', value: `${voiceLatency.p70}ms` },
                  { label: 'P100', value: `${voiceLatency.p100}ms` },
                  { label: 'Average', value: `${voiceLatency.avg}ms` },
                ]} />
              )}
            </div>
          </>
        )}

        {/* ===== PIPELINE BREAKDOWN ===== */}
        <div className="stats-grid">
          <StatBlock title="⚡ Pipeline Breakdown (avg ms)" stats={[
            { label: 'STT', value: `${metrics.pipelineBreakdown.stt_avg}ms` },
            { label: 'Embedding', value: `${metrics.pipelineBreakdown.embedding_avg}ms` },
            { label: 'Retrieval', value: `${metrics.pipelineBreakdown.retrieval_avg}ms` },
            { label: 'Reranking', value: `${metrics.pipelineBreakdown.reranking_avg}ms` },
            { label: 'Generation', value: `${metrics.pipelineBreakdown.generation_avg}ms` },
            { label: 'Grounding', value: `${metrics.pipelineBreakdown.grounding_avg}ms` },
          ]} />

          <StatBlock title="🔤 Token Usage (avg)" stats={[
            { label: 'Input Tokens', value: metrics.tokens.avg_input },
            { label: 'Output Tokens', value: metrics.tokens.avg_output },
            { label: 'Total Tokens', value: metrics.tokens.avg_total },
          ]} />

          <StatBlock title="🛡️ Guardrails" stats={[
            { label: 'Grounded', value: metrics.guardrails.grounded },
            { label: 'Rejected', value: metrics.guardrails.rejected },
            { label: 'Insufficient', value: metrics.guardrails.insufficient },
            { label: 'Unsafe', value: metrics.guardrails.unsafe },
            { label: 'Off-topic', value: metrics.guardrails.off_topic },
          ]} />
        </div>

        {/* ===== RECENT QUERIES TABLE ===== */}
        <div className="section-title" style={{ marginTop: '16px' }}>📋 Recent Queries</div>
        <div className="glass-card" style={{ padding: '16px' }}>
          {recentQueries.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>
              No queries yet. Ask a question to see metrics here.
            </p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Type</th>
                    <th>Query</th>
                    <th>Latency</th>
                    <th>Grounded</th>
                    <th>Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {recentQueries.slice().reverse().map((q: any) => (
                    <tr key={q.requestId}>
                      <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{q.requestId}</td>
                      <td>
                        <span className={`badge ${q.type === 'voice' ? 'badge-warning' : 'badge-accent'}`}>
                          {q.type}
                        </span>
                      </td>
                      <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {q.query}
                      </td>
                      <td>
                        <span className={`latency-badge ${q.totalLatency < 200 ? 'latency-fast' : q.totalLatency < 500 ? 'latency-medium' : 'latency-slow'}`}>
                          {q.totalLatency}ms
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${q.grounded ? 'badge-success' : 'badge-danger'}`}>
                          {q.grounded ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {q.tokens?.total_tokens || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
