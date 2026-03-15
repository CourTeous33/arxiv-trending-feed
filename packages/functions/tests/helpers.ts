import type { Paper } from "@arxiv-feed/core/types.js";

export function makePaper(overrides: Partial<Paper> = {}): Paper {
  return {
    arxiv_id: "2401.00001",
    title: "Test Paper",
    abstract: "Abstract",
    authors: ["Alice"],
    categories: ["cs.AI"],
    tags: ["ai", "deep-learning"],
    published_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    arxiv_url: "https://arxiv.org/abs/2401.00001",
    pdf_url: "https://arxiv.org/pdf/2401.00001",
    summary: "A test summary",
    why_it_matters: "Important for testing",
    tier: "hot",
    trending_score: 0.5,
    citation_count: 0,
    influential_citation_count: 0,
    reference_count: 0,
    hf_upvotes: 0,
    hf_comments: 0,
    github_stars: 0,
    github_url: "",
    citation_updated_at: "2024-01-01T00:00:00Z",
    ingested_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makeEvent(overrides: any = {}): any {
  return {
    queryStringParameters: {},
    pathParameters: {},
    ...overrides,
  };
}
