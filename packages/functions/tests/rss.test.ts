import { describe, it, expect, vi, beforeEach } from "vitest";
import { makePaper } from "./helpers.js";

const mockQueryByTier = vi.fn();
vi.mock("@arxiv-feed/core/dynamo.js", () => ({
  queryByTier: (...args: any[]) => mockQueryByTier(...args),
}));

const { handler } = await import("../src/api/rss.js");

beforeEach(() => {
  mockQueryByTier.mockReset();
});

describe("RSS handler", () => {
  it("returns valid RSS XML", async () => {
    mockQueryByTier.mockResolvedValue({
      papers: [makePaper()],
      nextToken: undefined,
    });

    const result = await handler({} as any, {} as any, () => {});
    const body = (result as any).body;

    expect((result as any).statusCode).toBe(200);
    expect((result as any).headers["Content-Type"]).toContain("rss+xml");
    expect(body).toContain('<?xml version="1.0"');
    expect(body).toContain("<rss version=\"2.0\">");
    expect(body).toContain("<title>Test Paper</title>");
    expect(body).toContain("<guid isPermaLink=\"false\">2401.00001</guid>");
  });

  it("escapes XML special characters", async () => {
    mockQueryByTier.mockResolvedValue({
      papers: [makePaper({ title: "A <b>bold</b> & \"special\" paper" })],
      nextToken: undefined,
    });

    const result = await handler({} as any, {} as any, () => {});
    const body = (result as any).body;

    expect(body).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(body).toContain("&amp;");
    expect(body).toContain("&quot;special&quot;");
  });

  it("includes tags as categories", async () => {
    mockQueryByTier.mockResolvedValue({
      papers: [makePaper({ tags: ["nlp", "deep-learning"] })],
      nextToken: undefined,
    });

    const result = await handler({} as any, {} as any, () => {});
    const body = (result as any).body;

    expect(body).toContain("<category>nlp</category>");
    expect(body).toContain("<category>deep-learning</category>");
  });

  it("handles empty paper list", async () => {
    mockQueryByTier.mockResolvedValue({ papers: [], nextToken: undefined });

    const result = await handler({} as any, {} as any, () => {});
    const body = (result as any).body;

    expect((result as any).statusCode).toBe(200);
    expect(body).toContain("<channel>");
    expect(body).not.toContain("<item>");
  });
});
