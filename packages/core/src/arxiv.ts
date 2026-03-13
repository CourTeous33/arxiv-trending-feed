import { XMLParser } from "fast-xml-parser";
import type { ArxivEntry } from "./types.js";

const ARXIV_API_URL = "http://export.arxiv.org/api/query";

const CATEGORIES = ["q-fin.*", "cs.AI", "cs.LG", "stat.ML"];

const FINANCE_KEYWORDS = [
  "trading",
  "portfolio",
  "financial",
  "market",
  "stock",
  "hedge",
  "risk",
  "asset",
  "pricing",
  "investment",
  "alpha",
  "volatility",
  "options",
  "derivatives",
  "quantitative",
  "quant",
  "arbitrage",
  "algorithmic trading",
  "order book",
  "execution",
  "sentiment",
  "forecasting",
  "prediction",
  "returns",
  "equity",
  "fixed income",
  "crypto",
  "defi",
  "reinforcement learning",
  "time series",
  "transformer",
  "llm",
  "large language model",
  "nlp",
  "natural language",
];

function buildQuery(): string {
  const catQuery = CATEGORIES.map((c) => `cat:${c}`).join("+OR+");
  return `(${catQuery})`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchArxivPapers(
  maxResults: number = 100,
  start: number = 0
): Promise<ArxivEntry[]> {
  const query = buildQuery();
  const url = `${ARXIV_API_URL}?search_query=${query}&start=${start}&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`arXiv API error: ${response.status} ${response.statusText}`);
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

export function isFinanceRelated(entry: ArxivEntry): boolean {
  // All q-fin papers are relevant
  if (entry.categories.some((c) => c.startsWith("q-fin"))) {
    return true;
  }

  const text = `${entry.title} ${entry.summary}`.toLowerCase();
  return FINANCE_KEYWORDS.some((kw) => text.includes(kw));
}

export function extractTags(entry: ArxivEntry): string[] {
  const tags: string[] = [];
  const text = `${entry.title} ${entry.summary}`.toLowerCase();

  const tagKeywords: Record<string, string[]> = {
    "deep-learning": ["deep learning", "neural network", "transformer", "attention"],
    "reinforcement-learning": ["reinforcement learning", "rl agent", "policy gradient"],
    nlp: ["nlp", "natural language", "sentiment", "text", "llm", "large language model"],
    "time-series": ["time series", "forecasting", "temporal"],
    "portfolio-optimization": ["portfolio", "allocation", "optimization"],
    "risk-management": ["risk", "var ", "value at risk", "hedging"],
    "market-microstructure": ["order book", "market making", "execution", "microstructure"],
    crypto: ["crypto", "bitcoin", "ethereum", "defi", "blockchain"],
    options: ["option", "derivative", "volatility surface", "black-scholes"],
    "high-frequency": ["high frequency", "hft", "low latency", "tick data"],
    "alternative-data": ["alternative data", "satellite", "social media", "news"],
    "generative-ai": ["generative", "gpt", "llm", "large language model", "diffusion"],
  };

  for (const [tag, keywords] of Object.entries(tagKeywords)) {
    if (keywords.some((kw) => text.includes(kw))) {
      tags.push(tag);
    }
  }

  // Add arxiv category-based tags
  for (const cat of entry.categories) {
    if (cat.startsWith("q-fin")) tags.push("quantitative-finance");
    if (cat === "cs.AI") tags.push("ai");
    if (cat === "cs.LG") tags.push("machine-learning");
    if (cat === "stat.ML") tags.push("statistics");
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
