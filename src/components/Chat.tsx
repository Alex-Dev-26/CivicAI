// The chat window. Messages live only in React state (they disappear on page reload).
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, Loader2, FileText, CheckCircle2, ListOrdered, BookOpen } from "lucide-react";
import { askCivicAI, type CivicAnswer, type ChatTurn } from "@/lib/civic-ai.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; answer: CivicAnswer }
  | { role: "error"; text: string };

export function Chat({ preset }: { preset: { text: string; id: number } | null }) {
  const ask = useServerFn(askCivicAI);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function send(question: string) {
    question = question.trim();
    if (!question || loading) return;

    // Short text history for the AI so follow-up questions make sense.
    const history: ChatTurn[] = messages.flatMap((m): ChatTurn[] =>
      m.role === "user"
        ? [{ role: "user", content: m.text }]
        : m.role === "assistant"
          ? [{ role: "assistant", content: m.answer.summary + "\n" + m.answer.explanation }]
          : [],
    );

    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setLoading(true);
    try {
      const answer = await ask({ data: { question, history } });
      setMessages((prev) => [...prev, { role: "assistant", answer }]);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Нешто тргна наопаку.";
      setMessages((prev) => [...prev, { role: "error", text }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  // A popular topic was clicked -> send its question.
  useEffect(() => {
    if (preset) void send(preset.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, loading]);

  return (
    <section className="flex h-[78vh] flex-col rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-3">
        <h2 className="font-serif text-lg font-bold">Разговор со CivicAI</h2>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {messages.length === 0 && (
          <p className="text-muted-foreground">
            Напишете прашање на македонски, на пример: „Кои документи ми требаат за лична карта?“
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-foreground">
              {m.text}
            </div>
          ) : m.role === "error" ? (
            <div key={i} className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {m.text}
            </div>
          ) : (
            <AnswerCard key={i} answer={m.answer} />
          ),
        )}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Ги пребарувам изворите…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <Textarea
          ref={inputRef}
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder="Вашето прашање…"
          className="min-h-[48px] resize-none bg-background"
          rows={1}
        />
        <Button type="submit" size="icon" className="h-12 w-12 shrink-0" disabled={loading || !input.trim()} aria-label="Испрати">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </section>
  );
}

// One AI answer, split into clear sections.
function AnswerCard({ answer }: { answer: CivicAnswer }) {
  return (
    <div className="space-y-4">
      <p className="font-medium">{answer.summary}</p>
      {answer.explanation && <p className="text-sm leading-relaxed text-foreground/85">{answer.explanation}</p>}
      <Section icon={FileText} title="Потребни документи" items={answer.required_documents} />
      <Section icon={CheckCircle2} title="Услови" items={answer.eligibility} />
      <Section icon={ListOrdered} title="Чекори" items={answer.steps} ordered />
      {answer.sources.length > 0 && (
        <div className="rounded-lg bg-muted p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" /> Извори
          </div>
          <ul className="space-y-1 text-sm">
            {answer.sources.map((s) => (
              <li key={s.number}>
                [{s.number}] {s.title} —{" "}
                <a href={s.source_url} target="_blank" rel="noreferrer" className="text-primary underline">
                  {s.source_name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, items, ordered }: { icon: typeof FileText; title: string; items: string[]; ordered?: boolean }) {
  if (items.length === 0) return null;
  const List = ordered ? "ol" : "ul";
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </div>
      <List className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-6 text-sm`}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </List>
    </div>
  );
}
