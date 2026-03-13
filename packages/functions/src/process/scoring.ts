import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Resource } from "sst";
import { scanAllPapers, putPaper, deletePaper } from "@arxiv-feed/core/dynamo.js";
import type { Paper } from "@arxiv-feed/core/types.js";

const s3 = new S3Client({});

const HALF_LIFE_DAYS = 7;
const HOT_THRESHOLD = 0.3;
const COLD_THRESHOLD = 0.05;
const COLD_AGE_DAYS = 90;

function computeTrendingScore(paper: Paper): number {
  const now = Date.now();
  const publishedAt = new Date(paper.published_at).getTime();
  const ageDays = (now - publishedAt) / (1000 * 60 * 60 * 24);

  // Exponential decay with half-life of ~7 days
  const recency = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);

  // Base relevance from tag count (proxy for topic richness)
  const relevance = Math.min(1.0, 0.3 + paper.tags.length * 0.1);

  return recency * relevance;
}

function daysSinceIngestion(paper: Paper): number {
  return (Date.now() - new Date(paper.ingested_at).getTime()) / (1000 * 60 * 60 * 24);
}

async function archiveToS3(paper: Paper): Promise<void> {
  const key = `archived/${paper.arxiv_id}.json`;
  await s3.send(
    new PutObjectCommand({
      Bucket: Resource.ColdStorage.name,
      Key: key,
      Body: JSON.stringify(paper),
      ContentType: "application/json",
    })
  );
}

export async function handler() {
  console.log("Starting scoring recomputation...");

  const papers = await scanAllPapers(["hot", "warm"]);
  console.log(`Processing ${papers.length} papers`);

  let promoted = 0;
  let demotedToWarm = 0;
  let demotedToCold = 0;

  for (const paper of papers) {
    const newScore = computeTrendingScore(paper);
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
      // Archive to S3 and remove from DynamoDB
      await archiveToS3(paper);
      await deletePaper(paper.arxiv_id);
      demotedToCold++;
      continue;
    }

    if (newScore !== paper.trending_score || newTier !== paper.tier) {
      if (paper.tier === "warm" && newTier === "hot") promoted++;
      if (paper.tier === "hot" && newTier === "warm") demotedToWarm++;

      await putPaper({
        ...paper,
        trending_score: newScore,
        tier: newTier,
      });
    }
  }

  console.log(
    `Scoring complete. Promoted: ${promoted}, Demoted to warm: ${demotedToWarm}, Archived to cold: ${demotedToCold}`
  );

  return { processed: papers.length, promoted, demotedToWarm, demotedToCold };
}
