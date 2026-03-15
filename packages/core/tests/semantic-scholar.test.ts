import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchPaperData, fetchBatchPaperData } from "../src/semantic-scholar.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("fetchPaperData", () => {
  it("returns citation data for a valid paper", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        paperId: "abc123",
        citationCount: 42,
        influentialCitationCount: 5,
        referenceCount: 30,
      }),
    });

    const result = await fetchPaperData("2401.00001");
    expect(result.citationCount).toBe(42);
    expect(result.influentialCitationCount).toBe(5);
    expect(result.referenceCount).toBe(30);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("ARXIV:2401.00001")
    );
  });

  it("returns empty data for 404", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const result = await fetchPaperData("nonexistent");
    expect(result.citationCount).toBe(0);
    expect(result.influentialCitationCount).toBe(0);
  });

  it("retries on 429 and returns data on success", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          paperId: "abc",
          citationCount: 10,
          influentialCitationCount: 1,
          referenceCount: 5,
        }),
      });

    const result = await fetchPaperData("2401.00001");
    expect(result.citationCount).toBe(10);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns empty on non-ok non-404 response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await fetchPaperData("2401.00001");
    expect(result.citationCount).toBe(0);
  });
});

describe("fetchBatchPaperData", () => {
  it("batch fetches multiple papers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        { paperId: "a", citationCount: 10, influentialCitationCount: 1, referenceCount: 5 },
        { paperId: "b", citationCount: 20, influentialCitationCount: 2, referenceCount: 10 },
      ],
    });

    const result = await fetchBatchPaperData(["2401.00001", "2401.00002"]);
    expect(result.size).toBe(2);
    expect(result.get("2401.00001")!.citationCount).toBe(10);
    expect(result.get("2401.00002")!.citationCount).toBe(20);
  });

  it("handles null entries in batch response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [
        null,
        { paperId: "b", citationCount: 5, influentialCitationCount: 0, referenceCount: 3 },
      ],
    });

    const result = await fetchBatchPaperData(["2401.00001", "2401.00002"]);
    expect(result.get("2401.00001")!.citationCount).toBe(0);
    expect(result.get("2401.00002")!.citationCount).toBe(5);
  });

  it("returns empty data on 429", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
    const result = await fetchBatchPaperData(["2401.00001"]);
    expect(result.get("2401.00001")!.citationCount).toBe(0);
  });

  it("returns empty data on server error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await fetchBatchPaperData(["2401.00001"]);
    expect(result.get("2401.00001")!.citationCount).toBe(0);
  });
});
