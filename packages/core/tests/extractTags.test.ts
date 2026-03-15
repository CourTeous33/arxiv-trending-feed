import { describe, it, expect } from "vitest";
import { extractTags } from "../src/arxiv.js";
import type { ArxivEntry } from "../src/types.js";

function makeEntry(overrides: Partial<ArxivEntry> = {}): ArxivEntry {
  return {
    id: "2401.00001",
    title: "A Generic Paper",
    summary: "This is a generic abstract.",
    authors: ["Alice"],
    categories: [],
    published: "2024-01-01T00:00:00Z",
    updated: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("extractTags", () => {
  it("returns empty tags for unrelated content", () => {
    const entry = makeEntry({ title: "Cooking recipes", summary: "How to make pasta" });
    expect(extractTags(entry)).toEqual([]);
  });

  it("extracts keyword-based tags from title", () => {
    const entry = makeEntry({ title: "Deep learning for image segmentation" });
    const tags = extractTags(entry);
    expect(tags).toContain("deep-learning");
    expect(tags).toContain("computer-vision");
  });

  it("extracts keyword-based tags from summary", () => {
    const entry = makeEntry({ summary: "We propose a reinforcement learning agent with policy gradient." });
    const tags = extractTags(entry);
    expect(tags).toContain("reinforcement-learning");
  });

  it("adds category-based tags for cs.AI", () => {
    const entry = makeEntry({ categories: ["cs.AI"] });
    expect(extractTags(entry)).toContain("ai");
  });

  it("adds category-based tags for cs.LG", () => {
    const entry = makeEntry({ categories: ["cs.LG"] });
    expect(extractTags(entry)).toContain("machine-learning");
  });

  it("adds category-based tags for stat.ML", () => {
    const entry = makeEntry({ categories: ["stat.ML"] });
    expect(extractTags(entry)).toContain("statistics");
  });

  it("adds category-based tags for cs.CL", () => {
    const entry = makeEntry({ categories: ["cs.CL"] });
    expect(extractTags(entry)).toContain("nlp");
  });

  it("adds category-based tags for cs.CV", () => {
    const entry = makeEntry({ categories: ["cs.CV"] });
    expect(extractTags(entry)).toContain("computer-vision");
  });

  it("deduplicates tags from keywords and categories", () => {
    const entry = makeEntry({
      title: "Natural language processing with LLMs",
      categories: ["cs.CL"],
    });
    const tags = extractTags(entry);
    const nlpCount = tags.filter((t) => t === "nlp").length;
    expect(nlpCount).toBe(1);
  });

  it("extracts multiple tags for a rich paper", () => {
    const entry = makeEntry({
      title: "Generative AI for robot manipulation using deep learning",
      summary: "We use a transformer-based diffusion model for autonomous locomotion.",
      categories: ["cs.AI", "cs.CV"],
    });
    const tags = extractTags(entry);
    expect(tags).toContain("deep-learning");
    expect(tags).toContain("generative-ai");
    expect(tags).toContain("robotics");
    expect(tags).toContain("computer-vision");
    expect(tags).toContain("ai");
  });

  it("extracts safety tags", () => {
    const entry = makeEntry({ title: "Red teaming LLMs for alignment and safety" });
    const tags = extractTags(entry);
    expect(tags).toContain("safety");
  });

  it("extracts graph-neural-networks tag", () => {
    const entry = makeEntry({ summary: "We use graph neural networks and GNN layers." });
    expect(extractTags(entry)).toContain("graph-neural-networks");
  });

  it("is case-insensitive", () => {
    const entry = makeEntry({ title: "DEEP LEARNING for NLP tasks" });
    const tags = extractTags(entry);
    expect(tags).toContain("deep-learning");
    expect(tags).toContain("nlp");
  });
});
