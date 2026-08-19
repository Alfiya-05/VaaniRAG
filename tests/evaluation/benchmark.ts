/**
 * Benchmark runner â€” executes all 105 test queries and produces
 * benchmark-results.json with actual measured P50/P70/P100 latencies,
 * token usage, and per-category statistics.
 *
 * Usage: npm run benchmark
 *
 * WARNING: Requires Qdrant collection to be populated (run ingestion first).
 * WARNING: Requires GROQ_API_KEY to be set.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import testQueries from './test-queries.json';
import { RAGOrchestrator } from '../../lib/orchestrator';
import * as fs from 'fs';
import * as path from 'path';
import { loadDataset } from '../../ingestion/loader';
import { preprocessRecords } from '../../ingestion/preprocess';
import { semanticChunk } from '../../ingestion/chunkers/semantic';
import { sentenceChunk } from '../../ingestion/chunkers/sentence';
import { fixedWindowChunk } from '../../ingestion/chunkers/fixed-window';
import { metadataAwareChunk } from '../../ingestion/chunkers/metadata-aware';
import { getBM25Index } from '../../lib/retrieval/bm25';

interface BenchmarkResult {
  id: number;
  query: string;
  category: string;
  answer: string;
  grounded: boolean;
  guardrail_passed: boolean;
  guardrail_reason?: string;
  latency_total: number;
  latency_breakdown: Record<string, number | undefined>;
  tokens?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  retrieval_score: number;
  chunks_used: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function main() {
  console.log('=== VaaniRAG Benchmark ===');
  console.log(`Test queries: ${testQueries.length}`);
  console.log('');

  const benchmarkSampleSize = Number(process.env.BENCHMARK_SAMPLE_SIZE || process.env.INGEST_SAMPLE_SIZE || 1000);
  console.log(`[Benchmark] Building genuine BM25 index from ${benchmarkSampleSize} cached records in this process...`);
  const benchmarkRecords = await loadDataset(benchmarkSampleSize);
  const benchmarkPassages = preprocessRecords(benchmarkRecords);
  const benchmarkChunks = [
    ...semanticChunk(benchmarkPassages),
    ...sentenceChunk(benchmarkPassages),
    ...fixedWindowChunk(benchmarkPassages),
    ...metadataAwareChunk(benchmarkPassages),
  ];
  getBM25Index().build(benchmarkChunks);
  console.log(`[Benchmark] BM25 ready: ${getBM25Index().documentCount} documents.`);

  const orchestrator = new RAGOrchestrator();
  const results: BenchmarkResult[] = [];

  for (let i = 0; i < testQueries.length; i++) {
    const tq = testQueries[i];
    console.log(`[${i + 1}/${testQueries.length}] "${tq.query.slice(0, 60)}..." (${tq.category})`);

    try {
      const response = await orchestrator.processQuery({
        type: 'text',
        query: tq.query,
      });

      results.push({
        id: tq.id,
        query: tq.query,
        category: tq.category,
        answer: response.answer.slice(0, 500),
        grounded: response.grounded,
        guardrail_passed: response.guardrail.passed,
        guardrail_reason: !response.guardrail.passed
          ? (response.guardrail.unsafe ? 'unsafe' : response.guardrail.off_topic ? 'off-topic' : !response.guardrail.sufficient ? 'insufficient' : 'grounding-failure')
          : undefined,
        latency_total: response.latency.total,
        latency_breakdown: response.latency as unknown as Record<string, number>,
        tokens: response.tokens,
        retrieval_score: response.retrievalInfo.best_score,
        chunks_used: response.retrievalInfo.chunks_used,
      });

      console.log(`  â†’ ${response.latency.total}ms | grounded=${response.grounded} | tokens=${response.tokens?.total_tokens || 0}`);
    } catch (err) {
      console.error(`  â†’ ERROR: ${(err as Error).message}`);
      results.push({
        id: tq.id,
        query: tq.query,
        category: tq.category,
        answer: `ERROR: ${(err as Error).message}`,
        grounded: false,
        guardrail_passed: false,
        guardrail_reason: 'error',
        latency_total: 0,
        latency_breakdown: {},
        retrieval_score: 0,
        chunks_used: 0,
      });
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  // Compute statistics
  const successful = results.filter(r => r.latency_total > 0);
  const latencies = successful.map(r => r.latency_total).sort((a, b) => a - b);

  const byCategory = new Map<string, BenchmarkResult[]>();
  for (const r of results) {
    const cat = byCategory.get(r.category) || [];
    cat.push(r);
    byCategory.set(r.category, cat);
  }

  const tokenResults = results.filter(r => r.tokens);

  const report = {
    timestamp: new Date().toISOString(),
    total_queries: testQueries.length,
    successful_queries: successful.length,

    text_pipeline: {
      p50: percentile(latencies, 0.5),
      p70: percentile(latencies, 0.7),
      p100: percentile(latencies, 1.0),
      avg: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      min: latencies[0] || 0,
      max: latencies[latencies.length - 1] || 0,
    },

    token_usage: {
      avg_input: tokenResults.length > 0 ? Math.round(tokenResults.reduce((a, r) => a + (r.tokens?.input_tokens || 0), 0) / tokenResults.length) : 0,
      avg_output: tokenResults.length > 0 ? Math.round(tokenResults.reduce((a, r) => a + (r.tokens?.output_tokens || 0), 0) / tokenResults.length) : 0,
      avg_total: tokenResults.length > 0 ? Math.round(tokenResults.reduce((a, r) => a + (r.tokens?.total_tokens || 0), 0) / tokenResults.length) : 0,
    },

    guardrails: {
      grounded: results.filter(r => r.grounded).length,
      rejected: results.filter(r => !r.guardrail_passed).length,
      off_topic: results.filter(r => r.guardrail_reason === 'off-topic').length,
      unsafe: results.filter(r => r.guardrail_reason === 'unsafe').length,
      insufficient: results.filter(r => r.guardrail_reason === 'insufficient').length,
    },

    per_category: Object.fromEntries(
      Array.from(byCategory.entries()).map(([cat, res]) => {
        const catLatencies = res.filter(r => r.latency_total > 0).map(r => r.latency_total).sort((a, b) => a - b);
        return [cat, {
          count: res.length,
          grounded: res.filter(r => r.grounded).length,
          rejected: res.filter(r => !r.guardrail_passed).length,
          avg_latency: catLatencies.length > 0 ? Math.round(catLatencies.reduce((a, b) => a + b, 0) / catLatencies.length) : 0,
        }];
      })
    ),

    results: results.map(r => ({
      id: r.id,
      query: r.query,
      category: r.category,
      answer: r.answer,
      grounded: r.grounded,
      guardrail_passed: r.guardrail_passed,
      guardrail_reason: r.guardrail_reason,
      latency_total: r.latency_total,
      tokens: r.tokens,
      retrieval_score: r.retrieval_score,
      chunks_used: r.chunks_used,
    })),
  };

  // Write results
  const outputPath = path.resolve(process.cwd(), 'benchmark-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  // Print summary
  console.log('\n=== BENCHMARK RESULTS ===');
  console.log(`Queries: ${report.total_queries}`);
  console.log(`Successful: ${report.successful_queries}`);
  console.log('');
  console.log('TEXT PIPELINE LATENCY');
  console.log(`  P50:  ${report.text_pipeline.p50}ms`);
  console.log(`  P70:  ${report.text_pipeline.p70}ms`);
  console.log(`  P100: ${report.text_pipeline.p100}ms`);
  console.log(`  Avg:  ${report.text_pipeline.avg}ms`);
  console.log(`  Min:  ${report.text_pipeline.min}ms`);
  console.log(`  Max:  ${report.text_pipeline.max}ms`);
  console.log('');
  console.log('TOKEN USAGE');
  console.log(`  Avg Input:  ${report.token_usage.avg_input}`);
  console.log(`  Avg Output: ${report.token_usage.avg_output}`);
  console.log(`  Avg Total:  ${report.token_usage.avg_total}`);
  console.log('');
  console.log('GUARDRAILS');
  console.log(`  Grounded:     ${report.guardrails.grounded}`);
  console.log(`  Off-topic:    ${report.guardrails.off_topic}`);
  console.log(`  Unsafe:       ${report.guardrails.unsafe}`);
  console.log(`  Insufficient: ${report.guardrails.insufficient}`);
  console.log('');
  console.log(`Results saved to: ${outputPath}`);
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});

