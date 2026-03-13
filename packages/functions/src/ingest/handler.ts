import {
  fetchWithRateLimit,
  isFinanceRelated,
  extractTags,
} from "@arxiv-feed/core/arxiv.js";
import { putPaper, paperExists } from "@arxiv-feed/core/dynamo.js";
import { summarizePaper } from "@arxiv-feed/core/summarize.js";
import type { Paper } from "@arxiv-feed/core/types.js";

function computeInitialScore(): number {
  // New papers start with max recency, base relevance
  return 1.0;
}

export async function handler() {
  console.log("Starting arXiv ingestion...");

  const entries = await fetchWithRateLimit(200);
  console.log(`Fetched ${entries.length} entries from arXiv`);

  const relevant = entries.filter(isFinanceRelated);
  console.log(`${relevant.length} finance-related papers found`);

  let ingested = 0;
  let skipped = 0;

  for (const entry of relevant) {
    // Dedup by arxiv_id
    if (await paperExists(entry.id)) {
      skipped++;
      continue;
    }

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

    const paper: Paper = {
      arxiv_id: entry.id,
      title: entry.title,
      abstract: entry.summary,
      authors: entry.authors,
      categories: entry.categories,
      tags: extractTags(entry),
      published_at: entry.published,
      updated_at: entry.updated,
      arxiv_url: `https://arxiv.org/abs/${entry.id}`,
      pdf_url: `https://arxiv.org/pdf/${entry.id}`,
      summary,
      why_it_matters: whyItMatters,
      tier: "hot",
      trending_score: computeInitialScore(),
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
