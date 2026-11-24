// Offline maintenance only. Run with bun; never expose this as a public server function.
import { readFile, writeFile } from "node:fs/promises";
import { embedTexts } from "../src/lib/civic-ai.functions";

type CatalogDocument = {
  title: string;
  category: string;
  source_name: string;
  source_url: string;
  content: string;
  verified_at: string;
};

const documents = JSON.parse(await readFile("data/services.json", "utf8")) as CatalogDocument[];
if (documents.length < 30 || documents.length > 50 || new Set(documents.map((d) => d.source_url)).size !== documents.length) {
  throw new Error("Catalog must contain 30–50 distinct official services");
}
const indexed = [];
for (let offset = 0; offset < documents.length; offset += 5) {
  const batch = documents.slice(offset, offset + 5);
  const vectors = await embedTexts(batch.map((d) => `${d.title}\n${d.category}\n${d.content}`));
  for (const [i, document] of batch.entries()) {
    const embedding = vectors[i];
    if (!embedding) throw new Error("Missing catalog embedding");
    indexed.push({ ...document, embedding, embedding_model: "google/gemini-embedding-2" });
  }
  console.log(`Indexed ${indexed.length}/${documents.length} services`);
}
const output = process.argv[2] ?? "/tmp/civic-catalog-indexed.json";
await writeFile(output, JSON.stringify(indexed));
// Data import is intentionally separate from schema migrations and citizen requests.
const literal = JSON.stringify(indexed).replaceAll("'", "''");
const sql = `BEGIN;
UPDATE public.documents SET is_active = false WHERE is_active;
INSERT INTO public.documents (title,category,source_name,source_url,content,verified_at,embedding,embedding_model,is_active)
SELECT title,category,source_name,source_url,content,verified_at,embedding::extensions.vector,embedding_model,true
FROM jsonb_to_recordset('${literal}'::jsonb) AS d(title text,category text,source_name text,source_url text,content text,verified_at timestamptz,embedding text,embedding_model text);
COMMIT;`;
await writeFile(`${output}.sql`, sql);
console.log(`Prepared catalog import: ${output}.sql`);