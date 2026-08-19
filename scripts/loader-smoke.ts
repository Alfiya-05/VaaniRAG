import { config } from 'dotenv';
import { loadDataset } from '../ingestion/loader';
async function main() {
  config({ path: '.env.local' });
  const records = await loadDataset(20);
  console.log(JSON.stringify({ count: records.length, first: { query_id: records[0].query_id, query: records[0].Eng_Query.slice(0, 80), passages: records[0].passages.English_passages.length } }));
}
main().catch(error => { console.error(error); process.exit(1); });
