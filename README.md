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
| Database | Postgres (Lovable Cloud) with a `documents` table + a search function | `drizzle/migrations/0000_create_documents_and_search.sql` |
| AI model | `google/gemini-3.8-flash`, called through the Lovable AI Gateway | used inside `civic-ai.functions.ts` |

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
- The left column explains CivicAI and shows **Popular topics** (`TOPICS` array).
  Each topic has an example question. Clicking one calls `setPreset(...)`, which passes the question
  to the chat.
- The right column renders `<Chat preset={preset} />`.

To add a topic, add an object to `TOPICS`:
```ts
{ name: "Здравство", icon: Stethoscope, question: "Како да изберам матичен лекар?" },
```
(also import the icon from `lucide-react`, and add documents about it — see section 8).

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
| `created_at` | timestamp | When the row was added |

It starts with **9 sample documents** (ID card, passport, unemployment registration, unemployment
benefit, minimum assistance, child allowance, university enrolment, dorms & scholarships, business
registration).

⚠️ The sample texts are simplified examples written for the demo. Verify them against the official
sites before showing CivicAI to real citizens.

**Security (RLS):** Row Level Security is on. The only rule is *"anyone can read documents"* — the
documents are public information. Nobody can insert, edit or delete from the website; you add documents
from the Lovable Cloud database view (section 8).

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
1. **Retrieve** — `searchDocuments(question)` finds the 4 best-matching documents.
2. **Augment** — the documents are pasted into the prompt, numbered `[1]`, `[2]`, …
3. **Generate** — the AI writes an answer using only those documents.
4. **Cite** — the source numbers the AI used are turned into real links.

These four steps *are* RAG.

---

## 5. How document retrieval works (the "R" in RAG)

**RAG = Retrieval-Augmented Generation.** Instead of hoping the AI "knows" Macedonian procedures,
we first *retrieve* trusted texts and give them to the AI. This reduces made-up answers and lets us
show sources.

We use **Postgres full-text search** — keyword search built into the database. It's simpler than
"vector embeddings" and works well for a small collection.

1. When a document is saved, Postgres automatically fills `search_vector` with its words:
   ```sql
   search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', title || ' ' || content)) STORED
   ```
2. The SQL function `search_documents(query, match_count)` (in the migration file):
   - lowercases the question and splits it into words,
   - drops very short words (under 3 letters, like "за", "на"),
   - keeps only the **first 5 letters** of each word and searches with a prefix (`пасош:*`).
     This is a tiny homemade "stemmer": Macedonian words change endings
     (пасош / пасошот / пасоши), and the beginning stays the same,
   - joins words with OR (`|`) so a document matches if it shares *any* word,
   - sorts by `ts_rank` (documents that share more/rarer words rank higher) and returns the top 4.

The server calls it like this:
```ts
const { data } = await supabase.rpc("search_documents", { query: question, match_count: 4 });
```

You can test search alone in the database SQL editor:
```sql
select title, rank from search_documents('Што ми треба за пасош?');
```

**Limitations & next steps:** keyword search misses synonyms ("работа" vs "вработување") and common
words like "документи" match many documents. The AI is told to ignore irrelevant sources. Later you can
upgrade to embeddings (pgvector) for meaning-based search — only `searchDocuments` would change.

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

- **`SYSTEM_PROMPT`** tells the AI: answer in Macedonian, use ONLY the sources, don't invent fees or
  deadlines, say honestly if the sources don't contain the answer, list the source numbers used.
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
1. Open the site, click a popular topic or type a question.
2. Try: "Кој има право на детски додаток?", "Како да отворам ДООЕЛ?",
   and something not in the documents ("Како да извадам возачка дозвола?") — CivicAI should say it
   doesn't have that information.

### Automated tests
```sh
bunx vitest run
```

### Add more documents (expand the knowledge base)
Open **Cloud → Database → documents** in Lovable and add a row, or run SQL:
```sql
insert into documents (title, category, source_name, source_url, content) values
('Возачка дозвола', 'Лични документи', 'Министерство за внатрешни работи', 'https://mvr.gov.mk',
 'Текст со сите информации...');
```
That's it — `search_vector` fills itself and the document is searchable immediately.
Tip: keep each document focused on one service and under ~400 words. Split long laws into several rows.

### Common changes
| I want to… | Edit |
| --- | --- |
| Change the AI's behaviour/tone | `SYSTEM_PROMPT` in `src/lib/civic-ai.functions.ts` |
| Add a field to answers (e.g. "fees") | `ANSWER_SCHEMA` + `CivicAnswer` type + `AnswerCard` in `Chat.tsx` |
| Retrieve more documents | `match_count: 4` in `searchDocuments` |
| Change home page text/topics | `src/routes/index.tsx` |
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
    ui/                     Ready-made UI pieces (Button, Textarea, …)
  lib/
    civic-ai.functions.ts   ⭐ Backend: retrieval + AI call + citations
  integrations/supabase/    Auto-generated database client & types (don't edit)
  generated/ai-gateway/     Auto-generated AI model types (don't edit)
  styles.css                Colors, fonts, design tokens
drizzle/migrations/
  0000_create_documents_and_search.sql   Table, search function, sample documents
AGENTS.md                   Short technical rules for the project
```

## Glossary
- **Server function** — code that runs on the server but is called from the browser like a normal function.
- **RAG** — first search for relevant texts, then give them to the AI to answer from.
- **Full-text search** — database feature for finding rows that contain given words.
- **JSON Schema** — a description of the exact JSON shape we want back.
- **RLS (Row Level Security)** — database rules for who can read/write which rows.
