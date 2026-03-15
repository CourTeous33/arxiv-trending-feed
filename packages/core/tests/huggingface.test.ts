import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchRecentHFData, getHFData, type HFPaperData } from "../src/huggingface.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function hfResponse(papers: { id: string; upvotes: number; numComments: number; stars?: number }[]) {
  return {
    ok: true,
    status: 200,
    json: async () =>
      papers.map((p) => ({
        paper: { id: p.id, title: "T", summary: "S", upvotes: p.upvotes, numComments: p.numComments },
        repo: p.stars ? { stars: p.stars } : undefined,
      })),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("fetchRecentHFData", () => {
  it("fetches papers for N days and merges by highest upvotes", async () => {
    // Day 0: paper A with 10 upvotes
    mockFetch.mockResolvedValueOnce(
      hfResponse([{ id: "2401.00001", upvotes: 10, numComments: 2 }])
    );
    // Day 1: same paper with 5 upvotes (older snapshot)
    mockFetch.mockResolvedValueOnce(
      hfResponse([{ id: "2401.00001", upvotes: 5, numComments: 1 }])
    );

    const result = await fetchRecentHFData(2);
    expect(result.size).toBe(1);
    // Should keep higher upvote count
    expect(result.get("2401.00001")!.upvotes).toBe(10);
  });

  it("handles API errors gracefully", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await fetchRecentHFData(1);
    expect(result.size).toBe(0);
  });

  it("collects papers from multiple days", async () => {
    mockFetch.mockResolvedValueOnce(
      hfResponse([{ id: "2401.00001", upvotes: 10, numComments: 0 }])
    );
    mockFetch.mockResolvedValueOnce(
      hfResponse([{ id: "2401.00002", upvotes: 5, numComments: 3 }])
    );

    const result = await fetchRecentHFData(2);
    expect(result.size).toBe(2);
    expect(result.has("2401.00001")).toBe(true);
    expect(result.has("2401.00002")).toBe(true);
  });

  it("extracts github stars from repo", async () => {
    mockFetch.mockResolvedValueOnce(
      hfResponse([{ id: "2401.00001", upvotes: 5, numComments: 1, stars: 100 }])
    );
    const result = await fetchRecentHFData(1);
    expect(result.get("2401.00001")!.githubStars).toBe(100);
  });
});

describe("getHFData", () => {
  it("returns data for existing paper", () => {
    const map = new Map<string, HFPaperData>();
    map.set("2401.00001", { upvotes: 10, numComments: 2, githubStars: 50, githubRepo: "https://github.com/test" });
    const data = getHFData(map, "2401.00001");
    expect(data.upvotes).toBe(10);
    expect(data.githubStars).toBe(50);
  });

  it("returns empty data for missing paper", () => {
    const map = new Map<string, HFPaperData>();
    const data = getHFData(map, "nonexistent");
    expect(data.upvotes).toBe(0);
    expect(data.numComments).toBe(0);
    expect(data.githubStars).toBe(0);
    expect(data.githubRepo).toBe("");
  });
});
