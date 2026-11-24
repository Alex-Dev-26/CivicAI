// @vitest-environment node
import { describe, expect, it } from "vitest";
import { searchDocuments } from "../lib/civic-ai.functions";

// Explicit opt-in: these calls require the configured server environment and use embedding credits.
describe.skipIf(process.env["CIVIC_LIVE_TESTS"] !== "true")("Live official hybrid retrieval", () => {
  it("finds the property ownership service for a Macedonian paraphrase", async () => {
    const result = await searchDocuments("Сакам документ што покажува кој го поседува мојот стан.");
    expect(result[0]?.title).toBe("Имотен лист");
    expect(result.every((d) => new URL(d.source_url).hostname === "uslugi.gov.mk")).toBe(true);
  }, 60000);

  it("finds the health-insurance status service", async () => {
    const result = await searchDocuments("Како да проверам дали сум здравствено осигуран?");
    expect(result[0]?.title).toBe("Потврда за осигурано/неосигурано лице и платен/неплатен придонес");
  }, 60000);

  it("keeps the first-passport service relevant for exact keywords", async () => {
    const result = await searchDocuments("Што ми треба за да извадам пасош?");
    expect(result[0]?.title).toBe("Издавање на пасош (прв пат)");
    expect(result.length).toBeLessThanOrEqual(6);
  }, 60000);
});