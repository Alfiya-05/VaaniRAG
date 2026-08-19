/**
 * Text preprocessing for MSMARCO-XI passages.
 * Cleans, normalizes, and flattens passages into individual records.
 */

import { RawRecord } from './loader';

export interface PassageRecord {
  document_id: string;
  text: string;
  query_type: string;
  is_selected: boolean;
  source_query_id: number;
  original_query: string;
}

/**
 * Flatten raw dataset records into individual passage records.
 * Each English passage becomes its own record with metadata.
 */
export function preprocessRecords(records: RawRecord[]): PassageRecord[] {
  const passages: PassageRecord[] = [];

  for (const record of records) {
    const englishPassages = record.passages?.English_passages || [];
    const isSelected = record.passages?.is_selected || [];

    for (let i = 0; i < englishPassages.length; i++) {
      const rawText = englishPassages[i];
      if (!rawText || rawText.trim().length < 20) continue;

      const cleaned = cleanText(rawText);
      if (cleaned.length < 20) continue;

      passages.push({
        document_id: `msmarco_${record.query_id}_p${i}`,
        text: cleaned,
        query_type: record.query_type || 'UNKNOWN',
        is_selected: isSelected[i] === 1,
        source_query_id: record.query_id,
        original_query: record.Eng_Query || record.query || '',
      });
    }
  }

  console.log(`[Preprocess] Extracted ${passages.length} passages from ${records.length} records`);
  return passages;
}

/**
 * Clean individual text content.
 */
function cleanText(text: string): string {
  return text
    // Remove HTML entities
    .replace(/&[a-zA-Z]+;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    // Remove URLs
    .replace(/https?:\/\/[^\s]+/g, '')
    // Remove email addresses
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove excessive punctuation
    .replace(/([.!?])\1{2,}/g, '$1')
    // Trim
    .trim();
}
