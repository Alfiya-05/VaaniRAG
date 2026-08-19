/**
 * Retrieval method benchmark — compares Dense, BM25, and Qdrant FullText.
 * Measures per-method retrieval latency and result quality.
 *
 * Usage: npx tsx tests/evaluation/retrieval-benchmark.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { denseSearch } from '../../lib/retrieval/dense';
import { bm25Search } from '../../lib/retrieval/bm25';
import { fulltextSearch } from '../../lib/retrieval/fulltext';
import { reciprocalRankFusion } from '../../lib/retrieval/fusion';
import * as fs from 'fs';
import * as path from 'path';

// Sample queries for benchmarking retrieval quality
const RETRIEVAL_QUERIES = [
  'What is photosynthesis?',
  'How does the human immune system work?',
  'What causes earthquakes?',
  'How do vaccines prevent disease?',
  'What is the water cycle?',
  'What is gravity and how does it work?',
  'What is the difference between DNA and RNA?',
  'How does electricity flow through a circuit?',
  'What is inflation in economics?',
  'How do computers process information?',
  'What is climate change and its effects?',
  'How does the digestive system work?',
  'What causes volcanic eruptions?',
  'What is artificial intelligence?',
  'How does solar energy work?',
  'What is the greenhouse effect?',
  'How do antibiotics work?',
  'What is evolution by natural selection?',
  'What is a black hole?',
  'How does the internet work?',
];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function main() {
  console.log('=== Retrieval Method Benchmark ===');
  console.log(`Queries: ${RETRIEVAL_QUERIES.length}`);
  console.log('');

  const denseLatencies: number[] = [];
  const bm25Latencies: number[] = [];
  const fulltextLatencies: number[] = [];
  const hybridBM25Latencies: number[] = [];
  const hybridFTLatencies: number[] = [];

  const queryResults: any[] = [];

  for (let i = 0; i < RETRIEVAL_QUERIES.length; i++) {
    const query = RETRIEVAL_QUERIES[i];
    console.log(`[${i + 1}/${RETRIEVAL_QUERIES.length}] "${query}"`);

    // Dense
    const denseStart = performance.now();
    const denseResult = await denseSearch(query);
    const denseMs = Math.round(performance.now() - denseStart);
    denseLatencies.push(denseMs);

    // BM25
    const bm25Start = performance.now();
    const bm25Result = await bm25Search(query);
    const bm25Ms = Math.round(performance.now() - bm25Start);
    bm25Latencies.push(bm25Ms);

    // FullText
    const ftStart = performance.now();
    const ftResult = await fulltextSearch(query);
    const ftMs = Math.round(performance.now() - ftStart);
    fulltextLatencies.push(ftMs);

    // Hybrid: Dense + BM25
    const hybridBM25Start = performance.now();
    const fusedBM25 = reciprocalRankFusion(denseResult.results, bm25Result);
    const hybridBM25Ms = denseMs + bm25Ms + Math.round(performance.now() - hybridBM25Start);
    hybridBM25Latencies.push(hybridBM25Ms);

    // Hybrid: Dense + FullText
    const hybridFTStart = performance.now();
    const fusedFT = reciprocalRankFusion(denseResult.results, ftResult);
    const hybridFTMs = denseMs + ftMs + Math.round(performance.now() - hybridFTStart);
    hybridFTLatencies.push(hybridFTMs);

    // Compute overlap between methods
    const denseIds = new Set(denseResult.results.map(r => r.chunk_id));
    const bm25Ids = new Set(bm25Result.map(r => r.chunk_id));
    const ftIds = new Set(ftResult.map(r => r.chunk_id));

    const denseBM25Overlap = [...denseIds].filter(id => bm25Ids.has(id)).length;
    const denseFTOverlap = [...denseIds].filter(id => ftIds.has(id)).length;

    queryResults.push({
      query,
      dense: { count: denseResult.results.length, latency_ms: denseMs, top_score: denseResult.results[0]?.score || 0 },
      bm25: { count: bm25Result.length, latency_ms: bm25Ms, top_score: bm25Result[0]?.score || 0 },
      fulltext: { count: ftResult.length, latency_ms: ftMs, top_score: ftResult[0]?.score || 0 },
      hybrid_bm25: { count: fusedBM25.length, latency_ms: hybridBM25Ms },
      hybrid_fulltext: { count: fusedFT.length, latency_ms: hybridFTMs },
      overlap: { dense_bm25: denseBM25Overlap, dense_fulltext: denseFTOverlap },
    });

    console.log(`  Dense: ${denseMs}ms (${denseResult.results.length} results) | BM25: ${bm25Ms}ms (${bm25Result.length}) | FT: ${ftMs}ms (${ftResult.length})`);
    console.log(`  Overlap: Dense∩BM25=${denseBM25Overlap}, Dense∩FT=${denseFTOverlap}`);
  }

  // Statistics
  const sortedDense = [...denseLatencies].sort((a, b) => a - b);
  const sortedBM25 = [...bm25Latencies].sort((a, b) => a - b);
  const sortedFT = [...fulltextLatencies].sort((a, b) => a - b);

  const report = {
    timestamp: new Date().toISOString(),
    query_count: RETRIEVAL_QUERIES.length,
    methods: {
      dense: {
        avg_ms: Math.round(denseLatencies.reduce((a, b) => a + b, 0) / denseLatencies.length),
        p50_ms: percentile(sortedDense, 0.5),
        p100_ms: percentile(sortedDense, 1.0),
      },
      bm25: {
        avg_ms: Math.round(bm25Latencies.reduce((a, b) => a + b, 0) / bm25Latencies.length),
        p50_ms: percentile(sortedBM25, 0.5),
        p100_ms: percentile(sortedBM25, 1.0),
      },
      fulltext: {
        avg_ms: Math.round(fulltextLatencies.reduce((a, b) => a + b, 0) / fulltextLatencies.length),
        p50_ms: percentile(sortedFT, 0.5),
        p100_ms: percentile(sortedFT, 1.0),
      },
      hybrid_dense_bm25: {
        avg_ms: Math.round(hybridBM25Latencies.reduce((a, b) => a + b, 0) / hybridBM25Latencies.length),
      },
      hybrid_dense_fulltext: {
        avg_ms: Math.round(hybridFTLatencies.reduce((a, b) => a + b, 0) / hybridFTLatencies.length),
      },
    },
    recommendation: '',
    queries: queryResults,
  };

  // Pick recommendation
  const bm25Avg = report.methods.bm25.avg_ms;
  const ftAvg = report.methods.fulltext.avg_ms;
  const avgOverlapBM25 = queryResults.reduce((a, r) => a + r.overlap.dense_bm25, 0) / queryResults.length;
  const avgOverlapFT = queryResults.reduce((a, r) => a + r.overlap.dense_fulltext, 0) / queryResults.length;

  // Lower overlap = more unique results = better complementarity
  // Lower latency = better performance
  if (bm25Avg <= ftAvg && avgOverlapBM25 <= avgOverlapFT) {
    report.recommendation = 'bm25 — lower latency and better complementarity with dense retrieval';
  } else if (ftAvg < bm25Avg && avgOverlapFT < avgOverlapBM25) {
    report.recommendation = 'fulltext — lower latency and better complementarity with dense retrieval';
  } else if (bm25Avg <= ftAvg) {
    report.recommendation = 'bm25 — lower latency';
  } else {
    report.recommendation = 'fulltext — lower latency';
  }

  const outputPath = path.resolve(process.cwd(), 'retrieval-benchmark-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log('\n=== RETRIEVAL BENCHMARK RESULTS ===');
  console.log(`Dense:    avg=${report.methods.dense.avg_ms}ms, p50=${report.methods.dense.p50_ms}ms, p100=${report.methods.dense.p100_ms}ms`);
  console.log(`BM25:     avg=${report.methods.bm25.avg_ms}ms, p50=${report.methods.bm25.p50_ms}ms, p100=${report.methods.bm25.p100_ms}ms`);
  console.log(`FullText: avg=${report.methods.fulltext.avg_ms}ms, p50=${report.methods.fulltext.p50_ms}ms, p100=${report.methods.fulltext.p100_ms}ms`);
  console.log(`Hybrid(Dense+BM25):     avg=${report.methods.hybrid_dense_bm25.avg_ms}ms`);
  console.log(`Hybrid(Dense+FullText): avg=${report.methods.hybrid_dense_fulltext.avg_ms}ms`);
  console.log(`\nRECOMMENDATION: ${report.recommendation}`);
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch(err => {
  console.error('Retrieval benchmark failed:', err);
  process.exit(1);
});
