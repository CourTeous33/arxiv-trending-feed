import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Resource } from "sst";
import { scanAllPapers, putPaper, deletePaper } from "@arxiv-feed/core/dynamo.js";
import { fetchBatchPaperData } from "@arxiv-feed/core/semantic-scholar.js";
import { fetchRecentHFData } from "@arxiv-feed/core/huggingface.js";
import { daysSince } from "@arxiv-feed/core/utils.js";
import type { Paper } from "@arxiv-feed/core/types.js";

const s3 = new S3Client({});

const HALF_LIFE_DAYS = 7;
const HOT_THRESHOLD = 0.3;
const COLD_THRESHOLD = 0.05;
const COLD_AGE_DAYS = 90;

/**
 * Scoring weights — HF upvotes are the strongest signal for "trending right now"
 *
 * HF upvotes (0.35): Real-time community signal from ML practitioners
 * Recency (0.25): Exponential decay, half-life 7 days
 * Citations (0.15): Academic impact (slow-building, matters more for older papers)
 * GitHub stars (0.15): Implementation traction
 * Relevance (0.10): Tag richness as topic coverage proxy
 */
const W_HF = 0.35;
const W_RECENCY = 0.25;
const W_CITATIONS = 0.15;
const W_GITHUB = 0.15;
const W_RELEVANCE = 0.10;

function normalizeScores(
  entries: { id: string; raw: number }[]
): Map<string, number> {
  const maxScore = Math.max(...entries.map((e) => e.raw), 0.001);
  const result = new Map<string, number>();
  for (const { id, raw } of entries) {
    result.set(id, raw / maxScore);
  }
  return result;
}

function computeTrendingScore(
  paper: Paper,
  normHF: number,
  normCitation: number,
  normGithub: number
): number {
  const recency = Math.pow(0.5, daysSince(paper.published_at) / HALF_LIFE_DAYS);
  const relevance = Math.min(1.0, 0.3 + paper.tags.length * 0.1);

  return (
    W_HF * normHF +
    W_RECENCY * recency +
    W_CITATIONS * normCitation +
    W_GITHUB * normGithub +
    W_RELEVANCE * relevance
  );
}

function daysSinceIngestion(paper: Paper): number {
  return daysSince(paper.ingested_at);
}

async function archiveToS3(paper: Paper): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: Resource.ColdStorage.name,
      Key: `archived/${paper.arxiv_id}.json`,
      Body: JSON.stringify(paper),
      ContentType: "application/json",
    })
  );
}

export async function handler() {
  console.log("Starting scoring recomputation...");

  const papers = await scanAllPapers(["hot", "warm"]);
  console.log(`Processing ${papers.length} papers`);

  // Fetch external signals in parallel
  const arxivIds = papers.map((p) => p.arxiv_id);
  const [s2Data, hfData] = await Promise.all([
    fetchBatchPaperData(arxivIds),
    fetchRecentHFData(7),
  ]);
  console.log(`Fetched S2: ${s2Data.size}, HF: ${hfData.size} papers`);

  // Enrich papers with external data
  const now = Date.now();
  const enriched = papers.map((paper) => {
    const ageDays = daysSince(paper.published_at, now);

    const s2 = s2Data.get(paper.arxiv_id) ?? {
      citationCount: paper.citation_count ?? 0,
      influentialCitationCount: paper.influential_citation_count ?? 0,
      referenceCount: paper.reference_count ?? 0,
    };

    const hf = hfData.get(paper.arxiv_id);
    const hfUpvotes = hf?.upvotes ?? paper.hf_upvotes ?? 0;
    const hfComments = hf?.numComments ?? paper.hf_comments ?? 0;
    const githubStars = hf?.githubStars ?? paper.github_stars ?? 0;
    const githubUrl = hf?.githubRepo ?? paper.github_url ?? "";

    const citVelocity =
      ageDays < 1
        ? s2.citationCount
        : s2.citationCount / ageDays;

    return {
      paper,
      s2,
      hfUpvotes,
      hfComments,
      githubStars,
      githubUrl,
      rawHF: Math.log1p(hfUpvotes + hfComments * 0.5),
      rawCitation: Math.log1p(citVelocity),
      rawGithub: Math.log1p(githubStars),
    };
  });

  // Normalize each signal to 0-1
  const normHF = normalizeScores(
    enriched.map((e) => ({ id: e.paper.arxiv_id, raw: e.rawHF }))
  );
  const normCit = normalizeScores(
    enriched.map((e) => ({ id: e.paper.arxiv_id, raw: e.rawCitation }))
  );
  const normGH = normalizeScores(
    enriched.map((e) => ({ id: e.paper.arxiv_id, raw: e.rawGithub }))
  );

  let promoted = 0;
  let demotedToWarm = 0;
  let demotedToCold = 0;

  for (const e of enriched) {
    const { paper } = e;
    const newScore = computeTrendingScore(
      paper,
      normHF.get(paper.arxiv_id) ?? 0,
      normCit.get(paper.arxiv_id) ?? 0,
      normGH.get(paper.arxiv_id) ?? 0
    );

    let newTier = paper.tier;
    if (newScore >= HOT_THRESHOLD) {
      newTier = "hot";
    } else if (newScore >= COLD_THRESHOLD) {
      newTier = "warm";
    } else if (daysSinceIngestion(paper) > COLD_AGE_DAYS) {
      newTier = "cold";
    } else {
      newTier = "warm";
    }

    if (newTier === "cold" && paper.tier !== "cold") {
      await archiveToS3(paper);
      await deletePaper(paper.arxiv_id);
      demotedToCold++;
      continue;
    }

    const dataChanged =
      e.s2.citationCount !== (paper.citation_count ?? 0) ||
      e.hfUpvotes !== (paper.hf_upvotes ?? 0) ||
      e.githubStars !== (paper.github_stars ?? 0);
    const scoreChanged =
      newScore !== paper.trending_score || newTier !== paper.tier;

    if (scoreChanged || dataChanged) {
      if (paper.tier === "warm" && newTier === "hot") promoted++;
      if (paper.tier === "hot" && newTier === "warm") demotedToWarm++;

      await putPaper({
        ...paper,
        trending_score: newScore,
        tier: newTier,
        citation_count: e.s2.citationCount,
        influential_citation_count: e.s2.influentialCitationCount,
        reference_count: e.s2.referenceCount,
        hf_upvotes: e.hfUpvotes,
        hf_comments: e.hfComments,
        github_stars: e.githubStars,
        github_url: e.githubUrl,
        citation_updated_at: new Date().toISOString(),
      });
    }
  }

  console.log(
    `Scoring complete. Promoted: ${promoted}, Demoted to warm: ${demotedToWarm}, Archived: ${demotedToCold}`
  );

  return { processed: papers.length, promoted, demotedToWarm, demotedToCold };
}
