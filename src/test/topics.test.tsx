import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { TOPICS, TOPIC_BATCHES } from "@/lib/topics";
import { Topics } from "@/components/Topics";

// Layout is verified in a real browser; these tests isolate question selection.
vi.mock("@/components/ui/carousel", () => {
  const Wrapper = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return { Carousel: Wrapper, CarouselContent: Wrapper, CarouselItem: Wrapper };
});
afterEach(cleanup);

describe("Topic questions", () => {
  it("uses category-dependent question counts and includes every topic once in the batches", () => {
    expect(TOPIC_BATCHES.flat().map((topic) => topic.id)).toEqual(TOPICS.map((topic) => topic.id));
    const education = TOPICS.find((topic) => topic.id === "education");
    const identity = TOPICS.find((topic) => topic.id === "identity");
    if (!education || !identity) throw new Error("Missing catalog categories");
    expect(education.questions.length).toBe(1);
    expect(identity.questions.length).toBe(4);
  });

  it("sends the exact selected FAQ question once rather than sending on category selection", () => {
    const onQuestion = vi.fn();
    render(<Topics onQuestion={onQuestion} />);
    fireEvent.click(screen.getByRole("button", { name: /Види ги сите/ }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /Патни исправи/ }),
    );
    expect(onQuestion).not.toHaveBeenCalled();
    const question = TOPICS.find((topic) => topic.id === "passport")?.questions[0];
    if (!question) throw new Error("Missing passport question");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: question }));
    expect(onQuestion).toHaveBeenCalledExactlyOnceWith(question);
  });

  it("does not silently discard another question while the chat is answering", () => {
    const onQuestion = vi.fn();
    render(<Topics onQuestion={onQuestion} busy />);
    fireEvent.click(screen.getByRole("button", { name: /Лични карти/ }));
    const question = TOPICS.find((topic) => topic.id === "identity")?.questions[0];
    if (!question) throw new Error("Missing identity question");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: question }));
    expect(onQuestion).not.toHaveBeenCalled();
  });
});
