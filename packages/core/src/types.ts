export interface Paper {
  arxiv_id: string;
  title: string;
  abstract: string;
  authors: string[];
  categories: string[];
  tags: string[];
  published_at: string;
  updated_at: string;
  arxiv_url: string;
  pdf_url: string;
  summary: string;
  why_it_matters: string;
  tier: "hot" | "warm" | "cold";
  trending_score: number;
  citation_count: number;
  influential_citation_count: number;
  reference_count: number;
  hf_upvotes: number;
  hf_comments: number;
  github_stars: number;
  github_url: string;
  citation_updated_at: string;
  ingested_at: string;
}

export interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  categories: string[];
  published: string;
  updated: string;
}

export interface PaperListResponse {
  papers: Paper[];
  nextToken?: string;
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    count: number;
    nextToken?: string;
  };
}

export interface TagCount {
  tag: string;
  count: number;
}
