import { XMLParser } from "fast-xml-parser";
import type { ArxivEntry } from "./types.js";
import { sleep } from "./utils.js";

const ARXIV_API_URL = "http://export.arxiv.org/api/query";

const CATEGORIES = ["cs.AI", "cs.LG", "stat.ML", "cs.CL", "cs.CV"];

function buildQuery(): string {
  const catQuery = CATEGORIES.map((c) => `cat:${c}`).join("+OR+");
  return `(${catQuery})`;
}

export async function fetchArxivPapers(
  maxResults: number = 100,
  start: number = 0
): Promise<ArxivEntry[]> {
  const query = buildQuery();
  const url = `${ARXIV_API_URL}?search_query=${query}&start=${start}&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;

  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(5000 * attempt);
    response = await fetch(url);
    if (response.status === 429) {
      console.warn(`arXiv rate limited, retrying (attempt ${attempt + 1}/3)...`);
      continue;
    }
    break;
  }
  if (!response || !response.ok) {
    throw new Error(`arXiv API error: ${response?.status} ${response?.statusText}`);
  }

  const xml = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) => name === "entry" || name === "author" || name === "category",
  });
  const parsed = parser.parse(xml);

  const entries = parsed?.feed?.entry;
  if (!entries || !Array.isArray(entries)) {
    return [];
  }

  return entries.map(parseEntry);
}

function parseEntry(entry: any): ArxivEntry {
  const id = typeof entry.id === "string" ? entry.id : entry.id?.["#text"] ?? "";
  const arxivId = id.replace("http://arxiv.org/abs/", "").replace(/v\d+$/, "");

  const authors = (entry.author ?? []).map(
    (a: any) => a.name ?? a["#text"] ?? "Unknown"
  );

  const categories = (entry.category ?? []).map(
    (c: any) => c["@_term"] ?? c.term ?? ""
  );

  return {
    id: arxivId,
    title: (entry.title ?? "").replace(/\s+/g, " ").trim(),
    summary: (entry.summary ?? "").replace(/\s+/g, " ").trim(),
    authors,
    categories,
    published: entry.published ?? "",
    updated: entry.updated ?? "",
  };
}

export function extractTags(entry: ArxivEntry): string[] {
  const tags: string[] = [];
  const text = `${entry.title} ${entry.summary}`.toLowerCase();

  const tagKeywords: Record<string, string[]> = {
    "deep-learning": ["deep learning", "neural network", "transformer", "attention"],
    "reinforcement-learning": ["reinforcement learning", "rl agent", "policy gradient"],
    nlp: ["nlp", "natural language", "sentiment", "text", "llm", "large language model"],
    "time-series": ["time series", "forecasting", "temporal"],
    "computer-vision": ["image", "object detection", "segmentation", "vision", "cnn", "diffusion model"],
    robotics: ["robot", "manipulation", "locomotion", "autonomous"],
    "generative-ai": ["generative", "gpt", "llm", "large language model", "diffusion"],
    optimization: ["optimization", "gradient", "convergence", "loss function"],
    "graph-neural-networks": ["graph neural", "gnn", "knowledge graph"],
    safety: ["alignment", "safety", "hallucination", "jailbreak", "red team"],
  };

  for (const [tag, keywords] of Object.entries(tagKeywords)) {
    if (keywords.some((kw) => text.includes(kw))) {
      tags.push(tag);
    }
  }

  // Add arxiv category-based tags
  const categoryTagMap: Record<string, string> = {
    "cs.AI": "ai",
    "cs.LG": "machine-learning",
    "stat.ML": "statistics",
    "cs.CL": "nlp",
    "cs.CV": "computer-vision",
  };
  for (const cat of entry.categories) {
    const mapped = categoryTagMap[cat];
    if (mapped) tags.push(mapped);
  }

  return [...new Set(tags)];
}

export async function fetchWithRateLimit(
  maxResults: number = 200
): Promise<ArxivEntry[]> {
  const allEntries: ArxivEntry[] = [];
  const batchSize = 100;

  for (let start = 0; start < maxResults; start += batchSize) {
    if (start > 0) {
      await sleep(3000); // arXiv rate limit: 1 req per 3 seconds
    }
    const entries = await fetchArxivPapers(
      Math.min(batchSize, maxResults - start),
      start
    );
    allEntries.push(...entries);
    if (entries.length < batchSize) break;
  }

  return allEntries;
}
