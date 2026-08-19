# VaaniRAG — Voice-Enabled RAG System

**HH Goa 2026 Shortlisting Task 2**

A production-quality, voice-enabled Retrieval-Augmented Generation system that answers questions using the MSMARCO-XI knowledge base.

## Architecture

```
Voice/Text → STT → Query Processor → Hybrid Retrieval → Reranking → Context Builder → LLM → Guardrails → Response
```

### Pipeline Stages

| Stage | Implementation | Notes |
|-------|---------------|-------|
| STT | Sarvam `saaras:v3` | Voice input transcription |
| Embedding | Local MiniLM (`Xenova/all-MiniLM-L6-v2`) | 384-dim, singleton, quantized |
| Dense Retrieval | Qdrant ANN search | Cosine similarity |
| Lexical Retrieval | In-memory BM25 (Okapi) | Genuine BM25 formula, not full-text wrapper |
| Fusion | Reciprocal Rank Fusion (k=60) | Merges dense + lexical candidates |
| Reranking | Local cross-encoder (`ms-marco-MiniLM-L-6-v2`) | No Groq calls for reranking |
| Context | Token-budgeted builder | ≤1500 tokens, 3-5 chunks |
| Generation | Groq `llama-3.1-70b-versatile` | ≤256 output tokens |
| Guardrails | 4-layer (off-topic, safety, sufficiency, grounding) | Pattern + embedding + word-overlap |

### Chunking Strategies

1. **Semantic** — Topic-boundary detection via sentence similarity
2. **Sentence** — Groups of 4 sentences with 1-sentence overlap
3. **Fixed-window** — Character-based windows with configurable overlap
4. **Metadata-aware** — Preserves full MSMARCO metadata per chunk

## Quick Start

### 1. Prerequisites

- Node.js 18+
- Qdrant Cloud account (or local Qdrant)
- API keys: Groq, Sarvam (for voice)

### 2. Setup

```bash
# Clone & install
cd VaaniRAG
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys
```

### 3. Ingest Data

```bash
npm run ingest
```

This loads 10,000 English records from MSMARCO-XI, applies all 4 chunking strategies, generates embeddings, uploads to Qdrant, and builds the BM25 index.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Benchmark

```bash
npm run benchmark
```

Runs 105 test queries and produces `benchmark-results.json` with actual P50/P70/P100 latencies.

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/query` | Text query `{ "query": "..." }` |
| POST | `/api/voice` | Voice query (multipart form with `audio` file) |
| GET | `/api/health` | System health check |
| GET | `/api/metrics` | Performance metrics |

## Dashboard

Navigate to `/dashboard` for real-time analytics:
- P50/P70/P100 latency with targets
- Pipeline breakdown (STT, Embed, Retrieval, Rerank, LLM, Grounding)
- Token usage statistics
- Guardrail effectiveness
- Recent query history

## Environment Variables

See `.env.example` for all configurable values.

## License

Built for HH Goa 2026 Shortlisting Task 2.
