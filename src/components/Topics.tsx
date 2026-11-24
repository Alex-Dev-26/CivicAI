import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TOPICS, TOPIC_BATCHES, type Topic } from "@/lib/topics";

export function Topics({
  onQuestion,
  busy = false,
}: {
  onQuestion: (question: string) => void;
  busy?: boolean;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [batch, setBatch] = useState(0);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Topic | null>(null);

  useEffect(() => {
    if (!api) return;
    const sync = () => setBatch(api.selectedScrollSnap());
    sync();
    api.on("select", sync);
    api.on("reInit", sync);
    return () => {
      api.off("select", sync);
      api.off("reInit", sync);
    };
  }, [api]);

  function showTopic(topic: Topic) {
    setSelected(topic);
    setOpen(true);
  }
  function askQuestion(question: string) {
    if (busy) return;
    setOpen(false);
    onQuestion(question);
  }

  return (
    <div className="mt-10 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-xl font-bold">Популарни теми</h2>
        <Button
          variant="link"
          className="px-0"
          onClick={() => {
            setSelected(null);
            setOpen(true);
          }}
        >
          Види ги сите <ArrowRight />
        </Button>
      </div>
      <Carousel
        setApi={setApi}
        opts={{ loop: true, align: "start" }}
        className="mt-4"
        aria-label="Популарни теми"
      >
        <CarouselContent className="cursor-grab active:cursor-grabbing">
          {TOPIC_BATCHES.map((topics, index) => (
            <CarouselItem key={index} aria-label={`Група ${index + 1} од ${TOPIC_BATCHES.length}`}>
              <div className="grid grid-cols-2 gap-3">
                {topics.map((topic) => (
                  <Button
                    key={topic.id}
                    variant="outline"
                    onClick={() => showTopic(topic)}
                    className="h-auto min-h-36 min-w-0 flex-col items-start justify-start gap-2 whitespace-normal rounded-lg bg-card p-4 text-left shadow-none hover:border-primary hover:bg-muted"
                  >
                    <topic.icon className="text-primary" />
                    <span className="break-words font-semibold">{topic.name}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {topic.questions.length} прашања
                    </span>
                  </Button>
                ))}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Претходна група"
            title="Претходна група"
            onClick={() => api?.scrollPrev()}
          >
            <ArrowLeft />
          </Button>
          {TOPIC_BATCHES.map((_, index) => (
            <Button
              key={index}
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              aria-label={`Група ${index + 1}`}
              aria-current={batch === index ? "true" : undefined}
              onClick={() => api?.scrollTo(index)}
            >
              <span
                className={`h-2 w-2 rounded-full transition-colors ${batch === index ? "bg-primary" : "bg-border"}`}
              />
            </Button>
          ))}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Следна група"
            title="Следна група"
            onClick={() => api?.scrollNext()}
          >
            <ArrowRight />
          </Button>
        </div>
      </Carousel>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-lg p-0">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-12 text-left">
            <DialogTitle className="font-serif text-2xl">
              {selected ? selected.name : "Сите теми"}
            </DialogTitle>
            <DialogDescription className="mt-2">
              {selected ? "Често поставувани прашања" : "Државни услуги и постапки"}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto p-4 sm:p-6">
            {selected ? (
              <>
                <Button variant="ghost" className="mb-4" onClick={() => setSelected(null)}>
                  <ArrowLeft /> Сите теми
                </Button>
                <ul className="divide-y divide-border">
                  {selected.questions.map((question) => (
                    <li key={question}>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => askQuestion(question)}
                        className="h-auto min-h-16 w-full justify-between gap-4 whitespace-normal px-3 py-4 text-left"
                      >
                        <span>{question}</span>
                        <ArrowRight className="shrink-0 text-primary" />
                      </Button>
                    </li>
                  ))}
                </ul>
                {busy && (
                  <p role="status" className="mt-4 text-sm text-muted-foreground">
                    CivicAI го подготвува претходниот одговор…
                  </p>
                )}
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {TOPICS.map((topic) => (
                  <Button
                    key={topic.id}
                    variant="outline"
                    onClick={() => setSelected(topic)}
                    className="h-auto min-h-28 min-w-0 justify-start gap-3 whitespace-normal rounded-lg p-4 text-left shadow-none"
                  >
                    <topic.icon className="shrink-0 text-primary" />
                    <span className="flex-1">
                      <span className="block">{topic.name}</span>
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {topic.questions.length} прашања
                      </span>
                    </span>
                    <ChevronRight className="shrink-0 text-muted-foreground" />
                  </Button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
