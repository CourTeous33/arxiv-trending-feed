import { describe, it, expect, vi, beforeEach } from "vitest";
import { makePaper, makeEvent } from "./helpers.js";

// Mock dynamo module
const mockQueryByTier = vi.fn();
const mockGetPaper = vi.fn();
vi.mock("@arxiv-feed/core/dynamo.js", () => ({
  queryByTier: (...args: any[]) => mockQueryByTier(...args),
  getPaper: (...args: any[]) => mockGetPaper(...args),
}));

// Import after mock
const { list, get, trending, search } = await import("../src/api/papers.js");

beforeEach(() => {
  mockQueryByTier.mockReset();
  mockGetPaper.mockReset();
});

describe("list handler", () => {
  it("returns papers from hot tier by default", async () => {
    const papers = [makePaper()];
    mockQueryByTier.mockResolvedValue({ papers, nextToken: undefined });

    const result = await list(makeEvent(), {} as any, () => {});
    const body = JSON.parse((result as any).body);

    expect((result as any).statusCode).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].arxiv_id).toBe("2401.00001");
    expect(mockQueryByTier).toHaveBeenCalledWith("hot", expect.objectContaining({ limit: 20 }));
  });

  it("filters by tag", async () => {
    const papers = [
      makePaper({ arxiv_id: "1", tags: ["ai", "robotics"] }),
      makePaper({ arxiv_id: "2", tags: ["ai", "nlp"] }),
      makePaper({ arxiv_id: "3", tags: ["robotics"] }),
    ];
    mockQueryByTier.mockResolvedValue({ papers, nextToken: undefined });

    const result = await list(
      makeEvent({ queryStringParameters: { tag: "robotics" } }),
      {} as any,
      () => {}
    );
    const body = JSON.parse((result as any).body);

    expect(body.data).toHaveLength(2);
    expect(body.data.every((p: any) => p.tags.includes("robotics"))).toBe(true);
  });

  it("respects limit parameter", async () => {
    mockQueryByTier.mockResolvedValue({ papers: [], nextToken: undefined });

    await list(
      makeEvent({ queryStringParameters: { limit: "5" } }),
      {} as any,
      () => {}
    );

    expect(mockQueryByTier).toHaveBeenCalledWith("hot", expect.objectContaining({ limit: 5 }));
  });

  it("caps limit at 100", async () => {
    mockQueryByTier.mockResolvedValue({ papers: [], nextToken: undefined });

    await list(
      makeEvent({ queryStringParameters: { limit: "999" } }),
      {} as any,
      () => {}
    );

    expect(mockQueryByTier).toHaveBeenCalledWith("hot", expect.objectContaining({ limit: 100 }));
  });
});

describe("get handler", () => {
  it("returns a paper by ID", async () => {
    mockGetPaper.mockResolvedValue(makePaper());

    const result = await get(
      makeEvent({ pathParameters: { id: "2401.00001" } }),
      {} as any,
      () => {}
    );
    const body = JSON.parse((result as any).body);

    expect((result as any).statusCode).toBe(200);
    expect(body.data.arxiv_id).toBe("2401.00001");
  });

  it("returns 400 for missing ID", async () => {
    const result = await get(makeEvent({ pathParameters: {} }), {} as any, () => {});
    expect((result as any).statusCode).toBe(400);
  });

  it("returns 404 for non-existent paper", async () => {
    mockGetPaper.mockResolvedValue(null);

    const result = await get(
      makeEvent({ pathParameters: { id: "nonexistent" } }),
      {} as any,
      () => {}
    );
    expect((result as any).statusCode).toBe(404);
  });
});

describe("trending handler", () => {
  it("returns hot papers sorted by trending score", async () => {
    const papers = [
      makePaper({ arxiv_id: "1", trending_score: 0.9 }),
      makePaper({ arxiv_id: "2", trending_score: 0.5 }),
    ];
    mockQueryByTier.mockResolvedValue({ papers, nextToken: undefined });

    const result = await trending(makeEvent(), {} as any, () => {});
    const body = JSON.parse((result as any).body);

    expect((result as any).statusCode).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(mockQueryByTier).toHaveBeenCalledWith("hot", expect.any(Object));
  });

  it("filters by tag", async () => {
    const papers = [
      makePaper({ arxiv_id: "1", tags: ["nlp"] }),
      makePaper({ arxiv_id: "2", tags: ["robotics"] }),
    ];
    mockQueryByTier.mockResolvedValue({ papers, nextToken: undefined });

    const result = await trending(
      makeEvent({ queryStringParameters: { tag: "nlp" } }),
      {} as any,
      () => {}
    );
    const body = JSON.parse((result as any).body);

    expect(body.data).toHaveLength(1);
    expect(body.data[0].arxiv_id).toBe("1");
  });
});

describe("search handler", () => {
  it("returns 400 when q is missing", async () => {
    const result = await search(makeEvent(), {} as any, () => {});
    expect((result as any).statusCode).toBe(400);
  });

  it("searches across title, abstract, tags, and authors", async () => {
    const papers = [
      makePaper({ arxiv_id: "1", title: "Transformer models for NLP" }),
      makePaper({ arxiv_id: "2", title: "Image segmentation" }),
    ];
    mockQueryByTier
      .mockResolvedValueOnce({ papers, nextToken: undefined })
      .mockResolvedValueOnce({ papers: [], nextToken: undefined });

    const result = await search(
      makeEvent({ queryStringParameters: { q: "transformer" } }),
      {} as any,
      () => {}
    );
    const body = JSON.parse((result as any).body);

    expect(body.data).toHaveLength(1);
    expect(body.data[0].arxiv_id).toBe("1");
  });
});
