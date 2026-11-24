import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Landmark } from "lucide-react";
import { Chat } from "@/components/Chat";
import { Topics } from "@/components/Topics";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CivicAI — Твој водич низ државните услуги" },
      {
        name: "description",
        content:
          "Прашај на македонски и добиј јасен одговор: потребни документи, услови и чекори, со извори.",
      },
      { property: "og:title", content: "CivicAI — Твој водич низ државните услуги" },
      {
        property: "og:description",
        content: "AI асистент за државни услуги, закони и постапки во Северна Македонија.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  // When a topic is clicked we pass its question to <Chat />. The counter makes repeated clicks work.
  const [preset, setPreset] = useState<{ text: string; id: number } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-6 py-4">
          <Landmark className="h-6 w-6 text-primary" />
          <span className="font-serif text-xl font-bold">CivicAI</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[1fr_1.4fr]">
        <section className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Државни услуги, објаснети
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold leading-tight md:text-5xl">
            Прашај што те интересира. Добиј јасен одговор.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            CivicAI ги чита официјалните информации наместо тебе и ти кажува кои документи ти
            требаат, дали ги исполнуваш условите и што да направиш чекор по чекор — со извори за
            проверените информации.
          </p>

          <Topics
            busy={busy}
            onQuestion={(text) => {
              setPreset((previous) => ({ text, id: (previous?.id ?? 0) + 1 }));
            }}
          />
          <p className="mt-6 text-xs text-muted-foreground">
            CivicAI е помошна алатка. За конечни информации секогаш проверете кај надлежната
            институција.
          </p>
        </section>

        <Chat preset={preset} onBusyChange={setBusy} />
      </main>
    </div>
  );
}
