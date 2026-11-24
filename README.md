# CivicAI 🇲🇰

CivicAI is an AI assistant that helps citizens of North Macedonia understand government services.
You ask a question in Macedonian ("Што ми треба за пасош?") and get a clear answer split into
**explanation, required documents, eligibility conditions, practical steps and sources**.

This README teaches you how every part works. Read it top to bottom once — it's written for beginners.

---

## 1. The big picture (architecture)

CivicAI has three parts:

```text
 ┌──────────────┐  1. question   ┌────────────────────┐  2. search   ┌──────────────────┐
 │   Browser    │ ─────────────► │  Server function   │ ───────────► │    Database      │
 │ (React page) │                │ askCivicAI()       │ ◄─────────── │ documents table  │
 │              │                │                    │  3. matching └──────────────────┘
 │              │                │                    │     docs
 │              │                │                    │  4. question + docs  ┌──────────┐
 │              │                │                    │ ───────────────────► │ AI model │
 │              │ ◄───────────── │                    │ ◄─────────────────── │ (gateway)│
 └──────────────┘ 6. answer JSON └────────────────────┘ 5. structured answer └──────────┘
```

| Part | What it is | Where |
| --- | --- | --- |
| Frontend | React page the user sees | `src/routes/index.tsx`, `src/components/Chat.tsx` |
| Backend | One **server function** that runs on the server, never in the browser | `src/lib/civic-ai.functions.ts` |
| Database | Postgres (Lovable Cloud) with official services and hybrid search | `drizzle/migrations/` |
| AI model | `google/gemini-3.8-flash`, called through the Lovable AI Gateway | used inside `civic-ai.functions.ts` |
| Embedding model | `google/gemini-embedding-2`, 768 dimensions | `embedTexts()` in the same backend file |

**Why a server function?** The AI key and the database logic must stay secret. Code in a server
function runs only on the server, so the browser never sees the key. The browser just "calls" the
function like a normal JavaScript function, and TanStack Start sends an HTTP request behind the scenes.

**Tech stack:** TanStack Start (React framework), Tailwind CSS (styling), Lovable Cloud (database),
Lovable AI Gateway (AI models, no API key needed in code).

---

## 2. How the frontend works

### `src/routes/index.tsx` — the home page
- Every file in `src/routes/` is a page. `index.tsx` is the page at `/`.
- `head()` sets the browser tab title and the preview text for social media.
- The left column explains CivicAI and renders `<Topics />`: four draggable batches of topic tiles,
  with clickable dots and arrow controls. Drag either way; batches wrap around.
- **Види ги сите** opens a larger dialog with all 15 catalog categories. Choosing a category shows
  its curated FAQ starters (1–4 questions, depending on the services in that category). These are
  useful example questions, not measured popularity rankings or stored official answers.
- Choosing a FAQ question closes the dialog and calls `setPreset(...)`, which automatically sends
  the question through the existing chat. Questions are disabled while another answer is pending.
- The right column renders `<Chat preset={preset} />`.

To add a topic, add an object to `TOPICS` in `src/lib/topics.ts`:
```ts
{ id: "new-topic", name: "Нова тема", icon: BookOpen, questions: ["Вашето прашање?"] },
```
(also import the icon from `lucide-react`, and add verified documents about it — see section 8).
`src/components/Topics.tsx` handles the carousel, category selection and dialog; `TOPIC_BATCHES`
groups the starters into pages of four without duplicating the data.

### `src/components/Chat.tsx` — the chat window
State (data that changes) is kept with React `useState`:
- `messages` — the list of chat bubbles. Each message is either a user question, an AI answer, or an error.
- `input` — what's typed in the text box.
- `loading` — true while waiting for the AI.

The important function is `send(question)`:
```ts
setMessages((prev) => [...prev, { role: "user", text: question }]); // show the question immediately
setLoading(true);
const answer = await ask({ data: { question, history } });         // call the server function
setMessages((prev) => [...prev, { role: "assistant", answer }]);    // show the answer
```
`ask` comes from `useServerFn(askCivicAI)`. It looks like a normal function but actually sends the
request to the server.

`history` is the previous conversation (as plain text) so follow-up questions like
"а за дете?" make sense.

`AnswerCard` displays one answer: summary, explanation, then a `Section` for documents, conditions and
steps (empty sections are hidden), and finally the **Sources** box with links.

> Messages are **not saved** — reloading the page clears the chat. This keeps v1 simple.

### Styling
Colors and fonts are defined once in `src/styles.css` (`--primary` = deep red, `--accent` = sun yellow,
fonts IBM Plex Sans + Source Serif 4, which support Cyrillic). Components use names like `bg-primary`
or `text-muted-foreground` instead of raw colors, so you can re-theme the whole site by editing that file.

---

## 3. The database

There is one table: **`documents`**. Each row is one piece of official information.

| Column | Type | What it stores |
| --- | --- | --- |
| `id` | uuid | Unique ID, created automatically |
| `title` | text | E.g. "Вадење патна исправа (пасош)" |
| `category` | text | Topic: Лични документи, Вработување, Образование, Социјални услуги |
| `source_name` | text | Institution, e.g. "Министерство за внатрешни работи" |
| `source_url` | text | Link shown in citations |
| `content` | text | The actual information the AI reads |
| `search_vector` | tsvector | **Automatic.** A searchable index of title + content (see section 5) |
| `embedding` | vector(768) | Meaning-based representation of title, category and official excerpt |
| `embedding_model` | text | Identifies the embedding model; different models must never be mixed |
| `verified_at` | timestamp | Date the official page was checked, not a guarantee the law is current |
| `is_active` | boolean | Only active records participate in hybrid search |
| `created_at` | timestamp | When the row was added |

The live catalog contains **40 distinct official services**, transcribed from individual service
pages on the national portal, **uslugi.gov.mk**, checked on **24 November 2026**. The source inventory
is `data/services.json`: every entry includes the service title, institution, direct source URL,
official excerpt and check date. It covers identity cards, passports, driving licences, civil records,
social and child protection, health insurance, education/scholarships, property, business, taxes,
employment and pension records. The nine original demo rows are retained as history but excluded
from retrieval (`is_active = false`).

**Source caution:** an official portal may itself contain outdated information. Excerpts are not
complete laws; collapsed/truncated descriptions were omitted, not guessed. A visibly stale VAT
threshold was excluded. Annual scholarship listings do not establish that applications are currently
open. Confirm changing fees, deadlines and eligibility with the institution before acting.

**Security (RLS):** Row Level Security is on. The only rule is *"anyone can read documents"* — the
documents are public information. Citizen accounts and anonymous visitors cannot insert, edit or
delete records. Catalog loading is a trusted offline maintenance action (section 8). The reviewed
indexed snapshot is kept in the **private** `civic-catalog` storage bucket; signed-in accounts can
read it, but there is no citizen upload permission. The temporary import-only account permission
was revoked immediately after loading. `catalog_imports` is a deprecated, unused import experiment;
the application does not read or write it.

---

## 4. How the backend receives and processes a question

Everything is in **`src/lib/civic-ai.functions.ts`**. Read it alongside this section.

```ts
export const askCivicAI = createServerFn({ method: "POST" })
  .inputValidator((input) => { ... })   // A. check the input
  .handler(async ({ data }) => { ... }); // B. do the work
```

**A. Validation** — rejects empty questions or questions over 1000 characters and keeps only the
last 6 conversation turns. Never trust data that comes from the browser.

**B. The handler** does four steps:
1. **Retrieve** — `searchDocuments(question)` embeds the question and finds the 6 best-matching documents.
2. **Augment** — the documents are pasted into the prompt, numbered `[1]`, `[2]`, …
3. **Generate** — the AI uses those documents for official facts and may add clearly labelled general guidance.
4. **Cite** — the source numbers the AI used are turned into real links.

These four steps *are* RAG.

---

## 5. How document retrieval works (the "R" in RAG)

**RAG = Retrieval-Augmented Generation.** Instead of hoping the AI "knows" Macedonian procedures,
we first *retrieve* trusted texts and give them to the AI. This reduces made-up answers and lets us
show sources.

We use **hybrid search**: keyword matching and meaning-based vector matching work together.
An *embedding* is a list of numbers representing meaning, not an AI-written answer.

1. **Offline document indexing:** `scripts/catalog.ts` calls `embedTexts()` on each service's title,
   category and excerpt. Gemini Embedding 2 returns 768 numbers, stored in pgvector's `embedding`
   field. Indexing never runs when a citizen opens the page or sends a question.
2. **Question embedding:** the same model and dimensions embed the citizen's question on the server.
   This makes a phrase such as “кој го поседува мојот стан” match “Имотен лист” without exact words.
3. **Keyword branch:** Postgres automatically builds `search_vector`. Hybrid search lowercases words,
   excludes short/common question words, keeps five-letter prefixes and uses OR matching and `ts_rank`.
4. **Vector branch:** cosine similarity (`1 - (embedding <=> query_embedding)`) ranks matching meanings.
   Only active records with the correct model and similarity of at least 0.45 are eligible.
5. **Merge:** up to 20 candidates from each branch are deduplicated and combined using weighted
   **reciprocal rank fusion**: `0.1 / (10 + keyword_position) + 0.9 / (10 + semantic_position)`.
   The top 6 are sent to the answer model. Semantic matches have more weight so generic words do not
   crowd out the right service. Match count is bounded to 1–10 in SQL.

```ts
const [vector] = await embedTexts(question);
const { data } = await supabase.rpc("hybrid_search_documents", {
  query: question, query_embedding: JSON.stringify(vector), match_count: 6,
});
```

**Fallback:** if embedding generation fails or returns malformed vectors, the server logs a safe
diagnostic and calls the same SQL function without a vector. Keyword search still works. The old
`search_documents` function is retained for compatibility, but the app no longer calls it.

**Small-catalog choice:** vector retrieval uses an exact scan over just 40 rows rather than an
approximate vector index. The keyword branch uses a GIN index. Add HNSW only when the collection is
large enough to justify it. Editing a title, category or excerpt clears its embedding and check date
through a trigger; review and re-index it rather than keeping stale vectors.

---

## 6. How the AI receives information and generates answers

The call (simplified):
```ts
const response = await generateChatCompletion({
  model: "google/gemini-3.8-flash",
  messages: [
    { role: "system", content: SYSTEM_PROMPT },        // the rules
    ...history,
    { role: "user", content: userMessage },
  ],
  response_format: { type: "json_schema", json_schema: { name: "civic_answer", schema: ANSWER_SCHEMA, strict: true } },
});
```

- **`SYSTEM_PROMPT`** defines CivicAI's purpose: help citizens find verified government-service
  information and navigate complex processes. It answers in Macedonian, uses sources for official
  requirements, and never invents fees, deadlines or eligibility. It may use general knowledge and
  reasoning instead of refusing simply because a topic is missing from the catalog. Unsupported
  guidance must be marked **“Општа насока — не е потврдена со официјален извор”**, with practical
  verification advice. Required-document and eligibility lists contain only sourced requirements;
  general practical steps are allowed. Citations only refer to retrieved sources actually used.
- **`userMessage`** looks like:
  ```text
  ИЗВОРИ:
  [1] Вадење патна исправа (пасош) (Министерство за внатрешни работи)
  Пасош (патна исправа) може да извади ...

  [2] ...

  ПРАШАЊЕ: Што ми треба за да извадам пасош?
  ```
- **`ANSWER_SCHEMA`** (JSON Schema) forces the AI to reply in exactly this shape:
  ```json
  { "summary": "...", "explanation": "...", "required_documents": ["..."],
    "eligibility": ["..."], "steps": ["..."], "source_numbers": [1] }
  ```
  Because the shape is guaranteed, the frontend can display neat sections without guessing.

**API keys:** the `@lovable.dev/ai-gateway` package reads `LOVABLE_API_KEY` from the server
environment automatically. It's managed by Lovable and never appears in code or the browser.

**Errors:** if the AI fails (rate limit, no credits, network), the function throws a friendly
Macedonian error message, which the chat shows in a red box.

---

## 7. How citations are produced

The AI only returns *numbers* (`source_numbers: [1, 3]`). The server converts them to real documents:
```ts
const sources = parsed.source_numbers
  .filter((n) => n >= 1 && n <= docs.length)      // ignore invalid numbers
  .filter((n, i, arr) => arr.indexOf(n) === i)    // remove duplicates
  .map((n) => ({ number: n, title: docs[n-1].title, source_name: ..., source_url: ... }));
```
Why not let the AI write the links? Because AIs can invent URLs. This way every citation points to a
document that really was retrieved from our database.

---

## 8. Running, testing and modifying

### Run
In Lovable, the preview runs automatically. Locally:
```sh
npm i
npm run dev
```
(Locally you need the project's environment variables; the AI and database work out of the box in Lovable.)

### Test manually
1. Open the site, drag the topic tiles, check that the active dot changes, and open **Види ги сите**.
   Choose a category, then a FAQ question; it should be sent immediately to the chat. Or type a question.
2. Try: "Кој има право на детски додаток?", "Како да отворам ДООЕЛ?",
   "Сакам документ што покажува кој го поседува мојот стан.", or "Како да проверам дали сум здравствено осигуран?".
   For something outside the catalog, try "Како да ги организирам документите пред посета на институција?".
   CivicAI should offer clearly labelled general advice, not refuse or pretend that advice is verified law.

### Automated tests
```sh
bunx vitest run
```

`src/test/civic-retrieval.test.ts` checks the requested 30–50 range, exactly 40 distinct official URLs,
query embedding use, vector validation, batch ordering and keyword fallback. `src/test/topics.test.tsx`
checks category-dependent FAQ lists, exact question dispatch and blocking selections while busy. Opt-in live tests call
real retrieval, so they consume embedding credits:
```sh
CIVIC_LIVE_TESTS=true bunx vitest run src/test/civic-search.integration.test.ts
```

### Add more documents (expand the knowledge base)
1. Review a real institution/service page. Update `data/services.json` with its direct URL, exact
   supported facts and check date. Never invent missing fees or application periods.
2. In the configured Lovable environment, run:
   ```sh
   bun scripts/catalog.ts /tmp/civic-catalog-indexed.json
   ```
   It embeds batches of five using the same backend helper, validates all vectors and prepares both
   a JSON snapshot and `/tmp/civic-catalog-indexed.json.sql`. No private key is written to either file.
   Locally, Gateway access must be configured securely; never put credentials in source code.
3. Apply the prepared **data import** through trusted Lovable Cloud maintenance, separately from
   schema migrations. It retires the previous catalog and loads the reviewed set in one transaction.
   Do not expose the script or privileged import access as a citizen-facing endpoint. Ask Lovable to
   load the prepared catalog if you cannot run the import yourself.
   For the initial load, a temporary authenticated maintenance account inserted the 40 indexed rows
   through the Data API. An account-specific INSERT policy allowed only official portal URLs with
   matching-model embeddings; migration `0004` removed it immediately. Do not reuse that account ID
   or grant general citizen write access for a future import.
4. Verify 40 active rows, 40 matching-model embeddings, real source links, and live retrieval tests.

`verified_at` means “this source page was checked”; it is not legal certification. Changing a record
directly makes it keyword-searchable, but you must re-index it to restore meaning-based search.

### Common changes
| I want to… | Edit |
| --- | --- |
| Change the AI's behaviour/tone | `SYSTEM_PROMPT` in `src/lib/civic-ai.functions.ts` |
| Add a field to answers (e.g. "fees") | `ANSWER_SCHEMA` + `CivicAnswer` type + `AnswerCard` in `Chat.tsx` |
| Retrieve more documents | `match_count: 6` in `searchDocuments` (SQL caps it at 10) |
| Change ranking | New migration replacing `hybrid_search_documents`; run live regression tests |
| Change home page text | `src/routes/index.tsx` |
| Change topic categories / FAQ starters | `src/lib/topics.ts` |
| Change topic browsing and dialog | `src/components/Topics.tsx` |
| Change colors/fonts | `src/styles.css` (and font link in `src/routes/__root.tsx`) |

---

## 9. Where everything is

```text
src/
  routes/
    __root.tsx              App shell: <html>, fonts, page-not-found & error screens
    index.tsx               Home page: intro + popular topics + chat
  components/
    Chat.tsx                Chat window, answer cards, sources box
    Topics.tsx              Draggable topic batches, all-topic dialog and FAQ selection
    ui/                     Ready-made UI pieces (Button, Textarea, …)
  lib/
    civic-ai.functions.ts   ⭐ Backend: retrieval + AI call + citations
    topics.ts               Catalog-aligned category and FAQ starters
  integrations/supabase/    Auto-generated database client & types (don't edit)
  generated/ai-gateway/     Auto-generated AI model types (don't edit)
  styles.css                Colors, fonts, design tokens
drizzle/migrations/
  0000_create_documents_and_search.sql   Table, search function, sample documents
  0001_hybrid_service_search.sql         Vector fields and initial hybrid retrieval
  0002_private_catalog_imports.sql       Private snapshot support (import table deprecated)
  0003_scoped_catalog_load.sql           One-time scoped catalog permission
  0004_close_catalog_maintenance_access.sql  Revokes that permission
  0005_balance_hybrid_relevance.sql      Initial weighted hybrid ranking
  0006_semantic_paraphrase_priority.sql  Prioritizes semantic ownership matches
  0007_read_only_citizen_catalog_grants.sql  Removes unused citizen write grants
data/services.json          Reviewed official service excerpts and source inventory
scripts/catalog.ts          Offline embedding and data-import preparation
src/test/civic-retrieval.test.ts       Catalog and fallback regression tests
src/test/civic-search.integration.test.ts  Opt-in real retrieval regressions
AGENTS.md                   Short technical rules for the project
```

## Glossary
- **Server function** — code that runs on the server but is called from the browser like a normal function.
- **RAG** — first search for relevant texts, then give them to the AI to answer from.
- **Full-text search** — database feature for finding rows that contain given words.
- **Embedding** — a numerical representation of meaning; related phrases have similar vectors.
- **pgvector** — Postgres extension that stores vectors and compares them using cosine distance.
- **Hybrid search** — combining keyword and semantic results rather than relying on either alone.
- **Reciprocal rank fusion** — merging result lists by position, avoiding incompatible score scales.
- **JSON Schema** — a description of the exact JSON shape we want back.
- **RLS (Row Level Security)** — database rules for who can read/write which rows.
