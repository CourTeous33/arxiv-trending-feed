const BASE_URL = "https://api.semanticscholar.org/graph/v1";

const FIELDS = "citationCount,influentialCitationCount,referenceCount";

export interface S2PaperData {
  citationCount: number;
  influentialCitationCount: number;
  referenceCount: number;
}

interface S2PaperResponse {
  paperId: string;
  citationCount?: number;
  influentialCitationCount?: number;
  referenceCount?: number;
}

import { sleep } from "./utils.js";

const EMPTY: S2PaperData = {
  citationCount: 0,
  influentialCitationCount: 0,
  referenceCount: 0,
};

function parseResponse(r: S2PaperResponse | null): S2PaperData {
  if (!r) return EMPTY;
  return {
    citationCount: r.citationCount ?? 0,
    influentialCitationCount: r.influentialCitationCount ?? 0,
    referenceCount: r.referenceCount ?? 0,
  };
}

/**
 * Fetch paper data from Semantic Scholar by arXiv ID.
 */
export async function fetchPaperData(arxivId: string): Promise<S2PaperData> {
  const url = `${BASE_URL}/paper/ARXIV:${arxivId}?fields=${FIELDS}`;

  const response = await fetch(url);

  if (response.status === 404) return EMPTY;

  if (response.status === 429) {
    await sleep(1000);
    const retry = await fetch(url);
    if (!retry.ok) return EMPTY;
    return parseResponse((await retry.json()) as S2PaperResponse);
  }

  if (!response.ok) {
    console.warn(`Semantic Scholar API error for ${arxivId}: ${response.status}`);
    return EMPTY;
  }

  return parseResponse((await response.json()) as S2PaperResponse);
}

/**
 * Batch fetch paper data for multiple papers.
 * Max 500 IDs per request.
 */
export async function fetchBatchPaperData(
  arxivIds: string[]
): Promise<Map<string, S2PaperData>> {
  const results = new Map<string, S2PaperData>();

  const chunks: string[][] = [];
  for (let i = 0; i < arxivIds.length; i += 500) {
    chunks.push(arxivIds.slice(i, i + 500));
  }

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const ids = chunk.map((id) => `ARXIV:${id}`);

    const response = await fetch(`${BASE_URL}/paper/batch?fields=${FIELDS}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });

    if (response.status === 429) {
      await sleep(1000);
      for (const id of chunk) results.set(id, EMPTY);
      continue;
    }

    if (!response.ok) {
      console.warn(`Semantic Scholar batch API error: ${response.status}`);
      for (const id of chunk) results.set(id, EMPTY);
      continue;
    }

    const data = (await response.json()) as (S2PaperResponse | null)[];
    for (let i = 0; i < chunk.length; i++) {
      results.set(chunk[i], parseResponse(data[i]));
    }

    if (ci < chunks.length - 1) await sleep(100);
  }

  return results;
}
