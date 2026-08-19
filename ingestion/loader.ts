import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, stat, rename } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const HF_BASE = 'https://huggingface.co/datasets/ai4bharat/MSMARCO-XI/resolve/main';
const DEFAULT_FILE = 'validation/urdval.parquet';
const DEFAULT_BYTES = 419206311;

/**
 * Bounded direct loader for real English content in MSMARCO-XI.
 * Reads a repository Parquet file through HTTP byte ranges and never uses
 * the failing Hugging Face datasets-server conversion endpoint.
 */








export interface RawRecord {
  query_id: number;
  query: string;
  Eng_Query: string;
  Answer: string;
  Eng_Answer: string;
  query_type: string;
  source_lang: string;
  target_lang: string;
  passages: { English_passages: string[]; Translated_passages: string[]; is_selected: number[] };
}

type Row = Record<string, unknown>;

function sampleLimit(sampleSize?: number): number {
  const value = sampleSize ?? Number.parseInt(process.env.INGEST_SAMPLE_SIZE || '10000', 10);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`INGEST_SAMPLE_SIZE must be a positive integer; received ${value}`);
  return value;
}

function fileConfig(): { path: string; bytes: number } {
  const path = (process.env.MSMARCO_XI_FILE || DEFAULT_FILE).trim();
  if (!path || path.startsWith('/') || path.includes('..') || !path.endsWith('.parquet')) {
    throw new Error(`MSMARCO_XI_FILE must be a repository-relative .parquet path; received ${path || '<empty>'}`);
  }
  const bytes = Number.parseInt(process.env.MSMARCO_XI_FILE_BYTES || '', 10) || (path === DEFAULT_FILE ? DEFAULT_BYTES : 0);
  if (!bytes) throw new Error(`MSMARCO_XI_FILE_BYTES is required for custom file '${path}'.`);
  return { path, bytes };
}

const stringValue = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const numberValue = (value: unknown) => {
  const result = typeof value === 'bigint' ? Number(value) : Number(value);
  return Number.isFinite(result) ? result : null;
};
const stringArray = (value: unknown) => Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
const selectedArray = (value: unknown) => Array.isArray(value) ? value.map(item => item === true || item === 1 ? 1 : 0) : [];

function normalize(row: Row): RawRecord | null {
  const passages = row.passages && typeof row.passages === 'object' ? row.passages as Row : {};
  const queryId = numberValue(row.query_id);
  const english = stringArray(passages.English_passages);
  const englishQuery = stringValue(row.Eng_Query);
  if (queryId === null || !englishQuery || english.length === 0) return null;
  return {
    query_id: queryId,
    query: stringValue(row.query),
    Eng_Query: englishQuery,
    Answer: stringValue(row.Answer),
    Eng_Answer: stringValue(row.Eng_Answer),
    query_type:stringValue(row.query_type) || 'UNKNOWN',
    source_lang: stringValue(row.source_lang),
    target_lang: stringValue(row.target_lang),
    passages: {
      English_passages: english,
      Translated_passages: stringArray(passages.Translated_passages),
      is_selected: selectedArray(passages.is_selected),
    },
  };
}


async function ensureLocalFile(filePath: string, expectedBytes: number): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  let existing = 0;
  try { existing = (await stat(filePath)).size; } catch { existing = 0; }
  if (existing === expectedBytes) { console.log("[Loader] Using cached local Parquet file: " + filePath); return; }
  if (existing > expectedBytes) throw new Error("Cached Parquet file is larger than expected: " + existing + " > " + expectedBytes);
  const url = HF_BASE + "/" + fileConfig().path + "?download=true";
  const curl = process.env.CURL_BIN || (process.platform === "win32" ? "curl.exe" : "curl");
  const tempPath = filePath + ".part";
  console.log("[Loader] Downloading MSMARCO-XI Parquet to cache: " + filePath + " (resume=" + existing + ")");
  await execFileAsync(curl, ["--fail", "--location", "--continue-at", "-", "--output", tempPath, url], { maxBuffer: 1024 * 1024, encoding: "utf8" });
  const downloaded = (await stat(tempPath)).size;
  if (downloaded !== expectedBytes) throw new Error("Incomplete MSMARCO-XI download: " + downloaded + " / " + expectedBytes + " bytes");
  await rename(tempPath, filePath);
  console.log("[Loader] Cached and verified " + downloaded + " bytes.");
}

export async function loadDataset(sampleSize?: number): Promise<RawRecord[]> {
  const limit = sampleLimit(sampleSize);
  const config = fileConfig();
  const localFile = process.env.MSMARCO_XI_LOCAL_FILE || path.join("data", "msmarco-xi", path.basename(config.path));
  await ensureLocalFile(localFile, config.bytes);
  const { asyncBufferFromFile, parquetReadObjects } = await import("hyparquet");
  const file = await asyncBufferFromFile(localFile);
  console.log("[Loader] Reading up to " + limit + " real English records from local Parquet cache.");
  const records: RawRecord[] = [];
  const seenIds = new Set<number>();
  const seenContent = new Set<string>();
  const columns = ["query_id", "query", "Eng_Query", "Answer", "Eng_Answer", "query_type", "source_lang", "target_lang", "passages"];
  const batchSize = Math.min(1000, Math.max(100, limit));
  let rowStart = 0;
  let rowsRead = 0;
  let skipped = 0;
  while (records.length < limit) {
    const rows = await parquetReadObjects({ file, columns, rowStart, rowEnd: rowStart + batchSize });
    if (rows.length === 0) break;
    rowsRead += rows.length;
    for (const row of rows as Row[]) {
      const record = normalize(row);
      if (!record) { skipped++; continue; }
      const key = String(record.query_id) + ":" + record.Eng_Query + ":" + record.passages.English_passages[0];
      if (seenIds.has(record.query_id) || seenContent.has(key)) { skipped++; continue; }
      seenIds.add(record.query_id);
      seenContent.add(key);
      records.push(record);
      if (records.length >= limit) break;
    }
    rowStart += rows.length;
    console.log("[Loader] Read " + rowsRead + " rows; valid=" + records.length + "; skipped=" + skipped);
    if (rows.length < batchSize) break;
  }
  if (records.length === 0) throw new Error("No valid English MSMARCO-XI records loaded from " + localFile + "; read=" + rowsRead + ", skipped=" + skipped + ".");
  console.log("[Loader] Loaded " + records.length + " real English records; skipped " + skipped + " invalid/duplicate rows.");
  return records;
}
