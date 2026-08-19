/**
 * Ingestion CLI script — loads, preprocesses, chunks, embeds, and indexes MSMARCO-XI.
 * Usage: npm run ingest
 */

import { loadDataset } from '../ingestion/loader';
import { preprocessRecords } from '../ingestion/preprocess';
import { semanticChunk } from '../ingestion/chunkers/semantic';
import { sentenceChunk } from '../ingestion/chunkers/sentence';
import { fixedWindowChunk } from '../ingestion/chunkers/fixed-window';
import { metadataAwareChunk } from '../ingestion/chunkers/metadata-aware';
import { embedChunks } from '../ingestion/embedder';
import { indexChunks } from '../ingestion/indexer';
import { getBM25Index } from '../lib/retrieval/bm25';
import { ChunkRecord } from '../lib/types';

// Load env
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const totalStart = performance.now();
  console.log('=== VaaniRAG Ingestion Pipeline ===');
  console.log(`Sample size: ${process.env.INGEST_SAMPLE_SIZE || '10000'}`);
  console.log(`Language: ${process.env.LANGUAGES || 'en'}`);
  console.log('');

  // Step 1: Load dataset
  console.log('--- Step 1: Loading dataset ---');
  const records = await loadDataset();

  // Step 2: Preprocess
  console.log('\n--- Step 2: Preprocessing ---');
  const passages = preprocessRecords(records);

  // Step 3: Apply all 4 chunking strategies
  console.log('\n--- Step 3: Chunking (4 strategies) ---');

  const semanticChunks = semanticChunk(passages);
  console.log(`  Semantic:       ${semanticChunks.length} chunks`);

  const sentenceChunks = sentenceChunk(passages);
  console.log(`  Sentence:       ${sentenceChunks.length} chunks`);

  const fixedChunks = fixedWindowChunk(passages);
  console.log(`  Fixed-window:   ${fixedChunks.length} chunks`);

  const metaChunks = metadataAwareChunk(passages);
  console.log(`  Metadata-aware: ${metaChunks.length} chunks`);

  // Combine all chunks (each chunk knows its strategy via chunk_strategy field)
  const allChunks: ChunkRecord[] = [
    ...semanticChunks,
    ...sentenceChunks,
    ...fixedChunks,
    ...metaChunks,
  ];
  console.log(`\n  Total chunks: ${allChunks.length}`);

  // Step 4: Generate embeddings
  console.log('\n--- Step 4: Generating embeddings ---');
  const embeddedChunks = await embedChunks(allChunks);

  // Step 5: Upload to Qdrant
  console.log('\n--- Step 5: Uploading to Qdrant ---');
  await indexChunks(embeddedChunks);

  // Step 6: Build BM25 index
  console.log('\n--- Step 6: Building BM25 index ---');
  const bm25 = getBM25Index();
  bm25.build(allChunks);

  const totalElapsed = Math.round((performance.now() - totalStart) / 1000);
  console.log(`\n=== Ingestion complete in ${totalElapsed}s ===`);
  console.log(`  Records: ${records.length}`);
  console.log(`  Passages: ${passages.length}`);
  console.log(`  Chunks: ${allChunks.length}`);
  console.log(`  BM25 docs: ${bm25.documentCount}`);
}

main().catch(err => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
