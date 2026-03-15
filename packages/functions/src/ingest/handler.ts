import {
  fetchWithRateLimit,
  extractTags,
} from "@arxiv-feed/core/arxiv.js";
import { putPaper, paperExists } from "@arxiv-feed/core/dynamo.js";
import { summarizePaper } from "@arxiv-feed/core/summarize.js";
import { fetchBatchPaperData } from "@arxiv-feed/core/semantic-scholar.js";
import { fetchRecentHFData, getHFData } from "@arxiv-feed/core/huggingface.js";
import { daysSince } from "@arxiv-feed/core/utils.js";
import type { Paper } from "@arxiv-feed/core/types.js";

function computeInitialScore(publishedAt: string, tagCount: number): number {
  const recency = Math.pow(0.5, daysSince(publishedAt) / 7);
  const relevance = Math.min(1.0, 0.3 + tagCount * 0.1);
  // No citation data yet, so score = recency * 0.7 + relevance * 0.3
  return 0.7 * recency + 0.3 * relevance;
}

export async function handler() {
  console.log("Starting arXiv ingestion...");

  const [entries, hfData] = await Promise.all([
    fetchWithRateLimit(200),
    fetchRecentHFData(3),
  ]);
  console.log(`Fetched ${entries.length} entries from arXiv, ${hfData.size} from HF`);

  // Dedup: filter out papers already in DB
  const newEntries = [];
  let skipped = 0;
  for (const entry of entries) {
    if (await paperExists(entry.id)) {
      skipped++;
    } else {
      newEntries.push(entry);
    }
  }
  console.log(`${newEntries.length} new papers, ${skipped} dupes`);

  if (newEntries.length === 0) {
    return { ingested: 0, skipped, total: entries.length };
  }

  // Batch fetch S2 citation data for all new papers at once
  const s2Data = await fetchBatchPaperData(newEntries.map((e) => e.id));
  const defaultS2 = { citationCount: 0, influentialCitationCount: 0, referenceCount: 0 };

  let ingested = 0;
  for (const entry of newEntries) {
    let summary = "";
    let whyItMatters = "";

    try {
      const result = await summarizePaper(entry.title, entry.summary);
      summary = result.summary;
      whyItMatters = result.why_it_matters;
    } catch (err) {
      console.error(`Failed to summarize ${entry.id}:`, err);
      summary = entry.summary.slice(0, 280);
    }

    const tags = extractTags(entry);
    const s2 = s2Data.get(entry.id) ?? defaultS2;
    const hf = getHFData(hfData, entry.id);

    const paper: Paper = {
      arxiv_id: entry.id,
      title: entry.title,
      abstract: entry.summary,
      authors: entry.authors,
      categories: entry.categories,
      tags,
      published_at: entry.published,
      updated_at: entry.updated,
      arxiv_url: `https://arxiv.org/abs/${entry.id}`,
      pdf_url: `https://arxiv.org/pdf/${entry.id}`,
      summary,
      why_it_matters: whyItMatters,
      tier: "hot",
      trending_score: computeInitialScore(entry.published, tags.length),
      citation_count: s2.citationCount,
      influential_citation_count: s2.influentialCitationCount,
      reference_count: s2.referenceCount,
      hf_upvotes: hf.upvotes,
      hf_comments: hf.numComments,
      github_stars: hf.githubStars,
      github_url: hf.githubRepo,
      citation_updated_at: new Date().toISOString(),
      ingested_at: new Date().toISOString(),
    };

    await putPaper(paper);
    ingested++;
  }

  console.log(
    `Ingestion complete. Ingested: ${ingested}, Skipped (dupes): ${skipped}`
  );

  return { ingested, skipped, total: entries.length };
}
