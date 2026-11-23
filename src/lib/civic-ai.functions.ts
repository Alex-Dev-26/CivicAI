// CivicAI backend: one server function that answers a citizen's question.
// Flow: question -> search documents in the database -> send question + documents to the AI -> return a structured answer.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";
import type { Database } from "@/integrations/supabase/types";

// ---------- Types shared with the frontend ----------
export type ChatTurn = { role: "user" | "assistant"; content: string };

export type Source = { number: number; title: string; source_name: string; source_url: string };

export type CivicAnswer = {
  summary: string;
  explanation: string;
  required_documents: string[];
  eligibility: string[];
  steps: string[];
  sources: Source[];
};

// ---------- Step 1: retrieve relevant documents (the "R" in RAG) ----------
async function searchDocuments(question: string) {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const supabase = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false },
    // New "sb_" keys are not JWTs, so we send them only as the "apikey" header.
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });

  // search_documents is a SQL function defined in the database migration.
  const { data, error } = await supabase.rpc("search_documents", { query: question, match_count: 4 });
  if (error) throw new Error("Document search failed: " + error.message);
  return data ?? [];
}

// ---------- Step 2: the instructions for the AI ----------
const SYSTEM_PROMPT = `Ти си CivicAI, асистент кој им помага на граѓаните на Северна Македонија да ги разберат државните услуги.
Правила:
- Одговарај секогаш на македонски јазик, јасно и едноставно.
- Користи САМО информации од доставените ИЗВОРИ. Не измислувај такси, рокови или документи.
- Ако изворите не го содржат одговорот, кажи тоа искрено во "summary" и остави ги листите празни.
- Во "source_numbers" наведи ги броевите на изворите што навистина ги користеше.`;

// JSON Schema: forces the AI to answer in exactly this shape.
const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "explanation", "required_documents", "eligibility", "steps", "source_numbers"],
  properties: {
    summary: { type: "string", description: "Краток одговор во 1-2 реченици" },
    explanation: { type: "string", description: "Подетално објаснување" },
    required_documents: { type: "array", items: { type: "string" } },
    eligibility: { type: "array", items: { type: "string" }, description: "Услови кои мора да се исполнат" },
    steps: { type: "array", items: { type: "string" }, description: "Практични чекори по редослед" },
    source_numbers: { type: "array", items: { type: "integer" } },
  },
} as const;

// ---------- The server function the frontend calls ----------
export const askCivicAI = createServerFn({ method: "POST" })
  .inputValidator((input: { question: string; history: ChatTurn[] }) => {
    const question = String(input.question ?? "").trim();
    if (!question) throw new Error("Прашањето е празно.");
    if (question.length > 1000) throw new Error("Прашањето е предолго (максимум 1000 знаци).");
    // Keep only the last 6 turns so the request stays small.
    const history = (input.history ?? []).slice(-6).map((t) => ({
      role: t.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: String(t.content).slice(0, 2000),
    }));
    return { question, history };
  })
  .handler(async ({ data }): Promise<CivicAnswer> => {
    // 1. Retrieve
    const docs = await searchDocuments(data.question);

    // 2. Augment: put the documents into the prompt, numbered [1], [2], ...
    const sourcesText = docs.length
      ? docs.map((d, i) => `[${i + 1}] ${d.title} (${d.source_name})\n${d.content}`).join("\n\n")
      : "Нема пронајдени извори.";

    const userMessage = `ИЗВОРИ:\n${sourcesText}\n\nПРАШАЊЕ: ${data.question}\n\nВрати JSON.`;

    // 3. Generate
    let response;
    try {
      response = await generateResponse({
        model: "openai/gpt-6-astra",
        instructions: SYSTEM_PROMPT,
        input: [...data.history, { role: "user", content: userMessage }],
        text: { format: { type: "json_schema", name: "civic_answer", schema: ANSWER_SCHEMA, strict: true } },
      });
    } catch (err) {
      if (err instanceof GatewayError) {
        console.error("AI error", err.code, err.message);
        if (err.code === "rate_limited") throw new Error("Премногу барања. Обидете се повторно за момент.");
        if (err.code === "payment_required") throw new Error("AI кредитите се потрошени.");
      }
      throw new Error("AI асистентот моментално не е достапен. Обидете се повторно.");
    }

    // The AI's text lives inside response.output -> message -> output_text.
    const text = response.output
      .flatMap((item) => (item.type === "message" ? item.content : []))
      .map((c) => (c.type === "output_text" ? c.text : ""))
      .join("");
    const parsed = JSON.parse(text) as Omit<CivicAnswer, "sources"> & { source_numbers: number[] };

    // 4. Citations: turn the numbers the AI used back into real document links.
    const sources: Source[] = parsed.source_numbers
      .filter((n) => n >= 1 && n <= docs.length)
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .map((n) => {
        const d = docs[n - 1]!;
        return { number: n, title: d.title, source_name: d.source_name, source_url: d.source_url };
      });

    return {
      summary: parsed.summary,
      explanation: parsed.explanation,
      required_documents: parsed.required_documents,
      eligibility: parsed.eligibility,
      steps: parsed.steps,
      sources,
    };
  });
