# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ArXiv AI Trending Paper Feed — auto-ingests AI/ML papers from arXiv, deduplicates, summarizes with Claude API in a casual tone, scores using HuggingFace upvotes + Semantic Scholar citations + GitHub stars, and serves as a scrollable Twitter-style feed with RSS support.

Pipeline: `arXiv API → Ingest → Dedup → Summarize (Claude) → Score (HF + S2 + GitHub) → Store (DynamoDB) → Serve (API + Web UI + RSS)`

## Tech Stack

- **Infrastructure**: SST (sst.dev) on AWS — all infra defined in `sst.config.ts`
- **Runtime**: TypeScript Lambda functions
- **Database**: DynamoDB (hot/warm papers), S3 (cold storage for archived papers)
- **API**: API Gateway v2 with Lambda handlers
- **Frontend**: Static site (Vite + React) deployed to S3 + CloudFront
- **Summarization**: Claude API (Haiku) for tweet-length summaries
- **Scoring signals**: HuggingFace Daily Papers API, Semantic Scholar API
- **Testing**: Vitest (60 unit tests)
- **CI**: GitHub Actions (type check, test, lint, build on PRs)

## Commands

```bash
# Development
sst dev                        # Local dev with Live Lambda
sst dev --stage staging        # Dev against staging environment

# Testing
bun run test                   # Run all unit tests
bun run test:watch             # Run tests in watch mode
bun run test:coverage          # Run tests with coverage report

# Deploy
sst deploy --stage prod        # Deploy to production
sst diff                       # Preview infra changes before deploying
sst remove                     # Tear down all resources for current stage

# Secrets
sst secret set ClaudeApiKey sk-ant-...   # Set encrypted secret (per-stage)

# Frontend
cd frontend && bun run build   # Build static site

# Utilities
sst shell                      # Shell with linked resources available
sst console                    # Open SST web dashboard
```

## Architecture

### Project Structure

```
├── sst.config.ts                          # All infrastructure definition
├── vitest.config.ts                       # Test configuration
├── .github/workflows/ci.yml              # GitHub Actions CI
├── packages/
│   ├── core/src/
│   │   ├── types.ts                       # Paper, ArxivEntry, TagCount types
│   │   ├── arxiv.ts                       # arXiv API client + tag extraction
│   │   ├── dynamo.ts                      # DynamoDB operations (put, get, query, scan, delete)
│   │   ├── huggingface.ts                 # HuggingFace Daily Papers API client
│   │   ├── semantic-scholar.ts            # Semantic Scholar API client (single + batch)
│   │   ├── summarize.ts                   # Claude API summarization
│   │   └── utils.ts                       # Shared utilities (sleep, daysSince)
│   ├── core/tests/                        # Unit tests for core modules
│   ├── functions/src/
│   │   ├── api/
│   │   │   ├── papers.ts                  # list, get, trending, search handlers
│   │   │   ├── rss.ts                     # RSS XML generation
│   │   │   ├── tags.ts                    # Tag listing with counts
│   │   │   └── health.ts                  # Health check
│   │   ├── ingest/handler.ts              # arXiv polling + dedup + summarize + store
│   │   └── process/scoring.ts             # Trending score recomputation + tier migration
│   └── functions/tests/                   # Unit tests for Lambda handlers
└── frontend/src/                          # Vite + React frontend
```

### Key Patterns

- **Resource Linking**: SST links resources to Lambda functions. Access via `import { Resource } from "sst"` — e.g., `Resource.Papers.name`.
- **Stages**: Each stage (dev/staging/prod) gets completely isolated resources.
- **Shared utilities**: `packages/core/src/utils.ts` exports `sleep()` and `daysSince()` — use these instead of defining inline.
- **Test helpers**: `packages/functions/tests/helpers.ts` exports `makePaper()` and `makeEvent()` — use for all handler tests.

## API Endpoints

Base URL: `https://br83tm1yi5.execute-api.us-east-1.amazonaws.com`

| Method | Path               | Description                        | Key Params                          |
|--------|--------------------|------------------------------------|-------------------------------------|
| GET    | `/papers/trending` | Hot papers by trending score       | `limit`, `tag`, `nextToken`         |
| GET    | `/papers`          | Papers by tier                     | `tier`, `limit`, `tag`, `nextToken` |
| GET    | `/papers/{id}`     | Single paper by arXiv ID           | —                                   |
| GET    | `/papers/search`   | Full-text search                   | `q` (required), `limit`             |
| GET    | `/tags`            | All tags with counts               | —                                   |
| GET    | `/rss`             | RSS 2.0 feed of trending papers    | —                                   |
| GET    | `/health`          | Health check                       | —                                   |

### Paper Object Schema

```typescript
interface Paper {
  arxiv_id: string;           // e.g. "2503.12345"
  title: string;
  abstract: string;
  authors: string[];
  categories: string[];       // arXiv categories: cs.AI, cs.LG, stat.ML, cs.CL, cs.CV
  tags: string[];             // Derived tags: nlp, deep-learning, computer-vision, etc.
  published_at: string;       // ISO 8601
  updated_at: string;
  arxiv_url: string;
  pdf_url: string;
  summary: string;            // Claude-generated tweet-length summary
  why_it_matters: string;     // Claude-generated importance blurb
  tier: "hot" | "warm" | "cold";
  trending_score: number;     // 0-1, weighted composite score
  citation_count: number;     // From Semantic Scholar
  influential_citation_count: number;
  reference_count: number;
  hf_upvotes: number;         // From HuggingFace Daily Papers
  hf_comments: number;
  github_stars: number;
  github_url: string;
  citation_updated_at: string;
  ingested_at: string;
}
```

### Response Format

All endpoints return JSON with this envelope:

```json
{
  "data": [...],
  "meta": { "count": 20, "nextToken": "..." }
}
```

Pagination: pass `nextToken` from the response as a query parameter to get the next page.

### Example API Calls

```bash
# Get trending papers
curl https://br83tm1yi5.execute-api.us-east-1.amazonaws.com/papers/trending

# Filter by tag
curl "https://br83tm1yi5.execute-api.us-east-1.amazonaws.com/papers/trending?tag=nlp&limit=10"

# Search papers
curl "https://br83tm1yi5.execute-api.us-east-1.amazonaws.com/papers/search?q=transformer"

# Get a specific paper
curl https://br83tm1yi5.execute-api.us-east-1.amazonaws.com/papers/2503.12345

# Get tags
curl https://br83tm1yi5.execute-api.us-east-1.amazonaws.com/tags

# RSS feed
curl https://br83tm1yi5.execute-api.us-east-1.amazonaws.com/rss
```

## DynamoDB Schema

- **Table**: `Papers` — PK: `arxiv_id`
- **GSI `tierTrending`**: PK: `tier` (hot/warm/cold), SK: `trending_score` — for trending queries
- All paper fields stored as top-level attributes

## Trending Score Formula

```
score = 0.35 × normHF + 0.25 × recency + 0.15 × normCitations + 0.15 × normGitHub + 0.10 × relevance
```

- **normHF**: `log1p(upvotes + comments × 0.5)`, normalized to 0–1 within batch
- **recency**: `0.5^(ageDays / 7)` — exponential decay, half-life 7 days
- **normCitations**: `log1p(citationCount / ageDays)`, normalized to 0–1
- **normGitHub**: `log1p(stars)`, normalized to 0–1
- **relevance**: `min(1.0, 0.3 + tagCount × 0.1)`

**Tiers**: Hot (≥0.3), Warm (0.05–0.3), Cold (<0.05, >90 days → archived to S3)

## Crons

- **DailyIngest** (8am UTC): polls arXiv API for 200 papers, deduplicates, batch-fetches S2 citations, fetches HF data, summarizes with Claude, stores in DynamoDB
- **HourlyScoring**: recomputes trending scores for all hot/warm papers, promotes/demotes tiers, archives cold papers to S3

## Design Decisions

- arXiv API rate limit: 1 req/3s — batch ingestion with retry logic (3 attempts, 5s exponential backoff)
- Summarization uses title + abstract only (not full PDF text) for cost/speed
- Dedup: arxiv ID exact match
- S2 citations fetched in batch (max 500/request) not per-paper
- HF upvotes are the strongest trending signal (weight 0.35) since citations build slowly for new papers
- RSS endpoint is public (no auth)
- Claude API is the dominant cost (~$1.50/mo at ~1200 papers/mo)
