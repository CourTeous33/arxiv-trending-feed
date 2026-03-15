const HF_API_URL = "https://huggingface.co/api/daily_papers";

export interface HFPaperData {
  upvotes: number;
  numComments: number;
  githubStars: number;
  githubRepo: string;
}

interface HFDailyPaper {
  paper: {
    id: string; // arxiv ID
    title: string;
    summary: string;
    upvotes: number;
    numComments: number;
  };
  repo?: {
    url?: string;
    stars?: number;
  };
  githubRepo?: string;
}

import { sleep } from "./utils.js";

const EMPTY: HFPaperData = {
  upvotes: 0,
  numComments: 0,
  githubStars: 0,
  githubRepo: "",
};

/**
 * Fetch HuggingFace daily papers for a specific date.
 * Returns a map of arxiv_id → popularity data.
 */
async function fetchDailyPapers(
  date: string
): Promise<Map<string, HFPaperData>> {
  const results = new Map<string, HFPaperData>();

  const response = await fetch(`${HF_API_URL}?date=${date}`);
  if (!response.ok) {
    console.warn(`HF API error for ${date}: ${response.status}`);
    return results;
  }

  const papers = (await response.json()) as HFDailyPaper[];

  for (const entry of papers) {
    const arxivId = entry.paper.id;
    results.set(arxivId, {
      upvotes: entry.paper.upvotes ?? 0,
      numComments: entry.paper.numComments ?? 0,
      githubStars: entry.repo?.stars ?? 0,
      githubRepo: entry.githubRepo ?? entry.repo?.url ?? "",
    });
  }

  return results;
}

/**
 * Fetch HuggingFace popularity data for the last N days.
 * Merges results — if a paper appears on multiple days, keeps the highest upvotes.
 */
export async function fetchRecentHFData(
  days: number = 7
): Promise<Map<string, HFPaperData>> {
  const merged = new Map<string, HFPaperData>();

  for (let i = 0; i < days; i++) {
    const date = new Date(Date.now() - i * 86400000)
      .toISOString()
      .split("T")[0];

    const dayData = await fetchDailyPapers(date);

    for (const [id, data] of dayData) {
      const existing = merged.get(id);
      if (!existing || data.upvotes > existing.upvotes) {
        merged.set(id, data);
      }
    }

    // Small delay between requests
    if (i < days - 1) await sleep(200);
  }

  console.log(
    `Fetched HF data: ${merged.size} papers across ${days} days`
  );

  return merged;
}

/**
 * Look up HF data for a single arxiv ID from recent daily papers.
 */
export function getHFData(
  hfMap: Map<string, HFPaperData>,
  arxivId: string
): HFPaperData {
  return hfMap.get(arxivId) ?? EMPTY;
}
