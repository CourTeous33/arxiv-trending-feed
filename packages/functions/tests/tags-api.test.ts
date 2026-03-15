import { describe, it, expect, vi, beforeEach } from "vitest";
import { makePaper } from "./helpers.js";

const mockQueryByTier = vi.fn();
vi.mock("@arxiv-feed/core/dynamo.js", () => ({
  queryByTier: (...args: any[]) => mockQueryByTier(...args),
}));

const { handler } = await import("../src/api/tags.js");

beforeEach(() => {
  mockQueryByTier.mockReset();
});

describe("tags handler", () => {
  it("aggregates tags from hot and warm tiers", async () => {
    mockQueryByTier
      .mockResolvedValueOnce({
        papers: [
          makePaper({ tags: ["ai", "nlp"] }),
          makePaper({ tags: ["ai", "robotics"] }),
        ],
        nextToken: undefined,
      })
      .mockResolvedValueOnce({
        papers: [makePaper({ tags: ["nlp", "deep-learning"] })],
        nextToken: undefined,
      });

    const result = await handler({} as any, {} as any, () => {});
    const body = JSON.parse((result as any).body);

    expect((result as any).statusCode).toBe(200);
    expect(body.data).toHaveLength(4);

    // ai: 2, nlp: 2, robotics: 1, deep-learning: 1 — sorted by count desc
    expect(body.data[0].count).toBe(2);
    expect(body.data[2].count).toBe(1);
  });

  it("sorts tags by count descending", async () => {
    mockQueryByTier
      .mockResolvedValueOnce({
        papers: [
          makePaper({ tags: ["nlp"] }),
          makePaper({ tags: ["nlp"] }),
          makePaper({ tags: ["ai"] }),
        ],
        nextToken: undefined,
      })
      .mockResolvedValueOnce({ papers: [], nextToken: undefined });

    const result = await handler({} as any, {} as any, () => {});
    const body = JSON.parse((result as any).body);

    expect(body.data[0].tag).toBe("nlp");
    expect(body.data[0].count).toBe(2);
    expect(body.data[1].tag).toBe("ai");
    expect(body.data[1].count).toBe(1);
  });

  it("returns empty array when no papers", async () => {
    mockQueryByTier
      .mockResolvedValueOnce({ papers: [], nextToken: undefined })
      .mockResolvedValueOnce({ papers: [], nextToken: undefined });

    const result = await handler({} as any, {} as any, () => {});
    const body = JSON.parse((result as any).body);

    expect(body.data).toEqual([]);
  });
});
