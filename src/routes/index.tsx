import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Landmark, GraduationCap, Briefcase, IdCard, HeartHandshake } from "lucide-react";
import { Chat } from "@/components/Chat";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CivicAI — Твој водич низ државните услуги" },
      { name: "description", content: "Прашај на македонски и добиј јасен одговор: потребни документи, услови и чекори, со извори." },
      { property: "og:title", content: "CivicAI — Твој водич низ државните услуги" },
      { property: "og:description", content: "AI асистент за државни услуги, закони и постапки во Северна Македонија." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

// Popular topics: clicking an example question sends it to the chat.
const TOPICS = [
  { name: "Лични документи", icon: IdCard, question: "Што ми треба за да извадам пасош?" },
  { name: "Вработување", icon: Briefcase, question: "Како да се пријавам како невработено лице?" },
  { name: "Образование", icon: GraduationCap, question: "Како да се запишам на државен универзитет?" },
  { name: "Социјални услуги", icon: HeartHandshake, question: "Кој има право на детски додаток?" },
];

function Index() {
  // When a topic is clicked we pass its question to <Chat />. The counter makes repeated clicks work.
  const [preset, setPreset] = useState<{ text: string; id: number } | null>(null);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-6 py-4">
          <Landmark className="h-6 w-6 text-primary" />
          <span className="font-serif text-xl font-bold">CivicAI</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[1fr_1.4fr]">
        <section>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Државни услуги, објаснети</p>
          <h1 className="mt-3 font-serif text-4xl font-bold leading-tight md:text-5xl">
            Прашај што те интересира. Добиј јасен одговор.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            CivicAI ги чита официјалните информации наместо тебе и ти кажува кои документи ти требаат, дали
            ги исполнуваш условите и што да направиш чекор по чекор — со извор за секој одговор.
          </p>

          <h2 className="mt-10 font-serif text-xl font-bold">Популарни теми</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {TOPICS.map((t) => (
              <button
                key={t.name}
                onClick={() => setPreset({ text: t.question, id: Date.now() })}
                className="rounded-lg border border-border bg-card p-4 text-left transition hover:border-primary"
              >
                <t.icon className="h-5 w-5 text-primary" />
                <div className="mt-2 font-semibold">{t.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">„{t.question}“</div>
              </button>
            ))}
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            CivicAI е помошна алатка. За конечни информации секогаш проверете кај надлежната институција.
          </p>
        </section>

        <Chat preset={preset} />
      </main>
    </div>
  );
}
