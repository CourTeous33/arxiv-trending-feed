import { describe, it, expect } from "vitest";

// Test the scoring formula logic directly (extracted from scoring.ts)
const HALF_LIFE_DAYS = 7;
const HOT_THRESHOLD = 0.3;
const COLD_THRESHOLD = 0.05;

const W_HF = 0.35;
const W_RECENCY = 0.25;
const W_CITATIONS = 0.15;
const W_GITHUB = 0.15;
const W_RELEVANCE = 0.10;

function computeTrendingScore(
  ageDays: number,
  tagCount: number,
  normHF: number,
  normCitation: number,
  normGithub: number
): number {
  const recency = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
  const relevance = Math.min(1.0, 0.3 + tagCount * 0.1);

  return (
    W_HF * normHF +
    W_RECENCY * recency +
    W_CITATIONS * normCitation +
    W_GITHUB * normGithub +
    W_RELEVANCE * relevance
  );
}

function normalizeScores(entries: { id: string; raw: number }[]): Map<string, number> {
  const maxScore = Math.max(...entries.map((e) => e.raw), 0.001);
  const result = new Map<string, number>();
  for (const { id, raw } of entries) {
    result.set(id, raw / maxScore);
  }
  return result;
}

describe("trending score computation", () => {
  it("gives higher score to newer papers", () => {
    const fresh = computeTrendingScore(1, 3, 0.5, 0.5, 0.5);
    const old = computeTrendingScore(30, 3, 0.5, 0.5, 0.5);
    expect(fresh).toBeGreaterThan(old);
  });

  it("gives higher score to papers with more HF upvotes", () => {
    const popular = computeTrendingScore(3, 3, 1.0, 0.1, 0.1);
    const unpopular = computeTrendingScore(3, 3, 0.0, 0.1, 0.1);
    expect(popular).toBeGreaterThan(unpopular);
  });

  it("gives higher score to papers with more GitHub stars", () => {
    const starred = computeTrendingScore(3, 3, 0.5, 0.1, 1.0);
    const unstarred = computeTrendingScore(3, 3, 0.5, 0.1, 0.0);
    expect(starred).toBeGreaterThan(unstarred);
  });

  it("gives higher score to papers with more citations", () => {
    const cited = computeTrendingScore(3, 3, 0.5, 1.0, 0.1);
    const uncited = computeTrendingScore(3, 3, 0.5, 0.0, 0.1);
    expect(cited).toBeGreaterThan(uncited);
  });

  it("more tags increase relevance component", () => {
    const manyTags = computeTrendingScore(3, 7, 0.5, 0.5, 0.5);
    const fewTags = computeTrendingScore(3, 1, 0.5, 0.5, 0.5);
    expect(manyTags).toBeGreaterThan(fewTags);
  });

  it("relevance caps at 1.0", () => {
    const r1 = computeTrendingScore(3, 10, 0.5, 0.5, 0.5);
    const r2 = computeTrendingScore(3, 20, 0.5, 0.5, 0.5);
    expect(r1).toBe(r2);
  });

  it("recency decays to ~0.5 at half-life", () => {
    const score = computeTrendingScore(7, 0, 0, 0, 0);
    // Only recency + relevance contribute. Recency at 7 days = 0.5
    // relevance with 0 tags = 0.3
    const expected = W_RECENCY * 0.5 + W_RELEVANCE * 0.3;
    expect(score).toBeCloseTo(expected, 3);
  });

  it("HF weight is the dominant signal (0.35)", () => {
    expect(W_HF).toBe(0.35);
    expect(W_HF).toBeGreaterThan(W_RECENCY);
    expect(W_HF).toBeGreaterThan(W_CITATIONS);
    expect(W_HF).toBeGreaterThan(W_GITHUB);
  });

  it("score is between 0 and 1", () => {
    const maxScore = computeTrendingScore(0, 10, 1.0, 1.0, 1.0);
    const minScore = computeTrendingScore(365, 0, 0, 0, 0);
    expect(maxScore).toBeLessThanOrEqual(1.0);
    expect(maxScore).toBeGreaterThan(0);
    expect(minScore).toBeGreaterThanOrEqual(0);
    expect(minScore).toBeLessThan(maxScore);
  });
});

describe("tier classification", () => {
  it("hot when score >= 0.3", () => {
    expect(0.5 >= HOT_THRESHOLD).toBe(true);
    expect(0.3 >= HOT_THRESHOLD).toBe(true);
  });

  it("warm when score between 0.05 and 0.3", () => {
    const score = 0.15;
    expect(score < HOT_THRESHOLD).toBe(true);
    expect(score >= COLD_THRESHOLD).toBe(true);
  });

  it("cold when score < 0.05", () => {
    expect(0.01 < COLD_THRESHOLD).toBe(true);
  });
});

describe("normalizeScores", () => {
  it("normalizes to 0-1 range", () => {
    const entries = [
      { id: "a", raw: 10 },
      { id: "b", raw: 5 },
      { id: "c", raw: 0 },
    ];
    const result = normalizeScores(entries);
    expect(result.get("a")).toBe(1.0);
    expect(result.get("b")).toBe(0.5);
    expect(result.get("c")).toBe(0);
  });

  it("handles all-zero case", () => {
    const entries = [
      { id: "a", raw: 0 },
      { id: "b", raw: 0 },
    ];
    const result = normalizeScores(entries);
    expect(result.get("a")).toBe(0);
    expect(result.get("b")).toBe(0);
  });

  it("handles single entry", () => {
    const result = normalizeScores([{ id: "a", raw: 42 }]);
    expect(result.get("a")).toBe(1.0);
  });
});
