import { beforeEach, describe, expect, it, vi } from "vitest";
import catalog from "../../data/services.json";

const mocks = vi.hoisted(() => ({ embed: vi.fn(), rpc: vi.fn() }));
vi.mock("@lovable.dev/ai-gateway", () => ({ generateEmbeddings: mocks.embed, generateChatCompletion: vi.fn(), GatewayError: class extends Error {} }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
import { embedTexts, searchDocuments } from "../lib/civic-ai.functions";

beforeEach(() => {
  mocks.embed.mockReset();
  mocks.rpc.mockReset().mockResolvedValue({ data: [{ title: "Имотен лист" }], error: null });
});

describe("Official service catalog", () => {
  it("contains 40 distinct real services within the requested 30–50 range", () => {
    expect(catalog.length).toBe(40);
    expect(catalog.length).toBeGreaterThanOrEqual(30);
    expect(catalog.length).toBeLessThanOrEqual(50);
    expect(new Set(catalog.map((d) => d.source_url)).size).toBe(40);
    for (const document of catalog) {
      expect(new URL(document.source_url).hostname).toBe("uslugi.gov.mk");
      expect(new URL(document.source_url).pathname).toMatch(/^\/service\/.+-\d+$/);
      expect(document.content.length).toBeGreaterThan(200);
    }
  });
});

describe("Hybrid retrieval", () => {
  it("passes a real-shaped semantic vector and the question to hybrid search", async () => {
    const embedding = Array.from({ length: 768 }, (_, i) => (i + 1) / 768);
    mocks.embed.mockResolvedValue({ data: [{ index: 0, embedding }] });
    await searchDocuments("Кој е сопственик на станот?");
    expect(mocks.embed).toHaveBeenCalledWith({ model: "google/gemini-embedding-2", input: "Кој е сопственик на станот?", dimensions: 768 });
    expect(mocks.rpc).toHaveBeenCalledWith("hybrid_search_documents", { query: "Кој е сопственик на станот?", query_embedding: JSON.stringify(embedding), match_count: 6 });
  });

  it("falls back to keyword-only retrieval on an embedding outage", async () => {
    mocks.embed.mockRejectedValue(new Error("Unavailable"));
    const result = await searchDocuments("пасош");
    expect(mocks.rpc).toHaveBeenCalledWith("hybrid_search_documents", { query: "пасош", match_count: 6 });
    expect(result[0]?.title).toBe("Имотен лист");
  });

  it("rejects malformed vectors and preserves batch order", async () => {
    mocks.embed.mockResolvedValueOnce({ data: [{ index: 0, embedding: [1, 2] }] });
    await expect(embedTexts("пасош")).rejects.toThrow("Invalid embedding response");
    const first = Array.from({ length: 768 }, () => 0.1);
    const second = Array.from({ length: 768 }, () => 0.2);
    mocks.embed.mockResolvedValueOnce({ data: [{ index: 1, embedding: second }, { index: 0, embedding: first }] });
    expect(await embedTexts(["пасош", "имот"])).toEqual([first, second]);
  });
});