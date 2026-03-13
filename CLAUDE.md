# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ArXiv AI Trading Paper Feed — auto-ingests AI/finance papers from arXiv, deduplicates, summarizes with Claude API in a casual fintwit tone, and serves as a scrollable Twitter-style feed with RSS support.

Pipeline: `arXiv API → Ingest → Dedup → Summarize (Claude) → Store (DynamoDB) → Serve (API + Web UI + RSS)`

## Tech Stack

- **Infrastructure**: SST (sst.dev) on AWS — all infra defined in `sst.config.ts`
- **Runtime**: TypeScript Lambda functions
- **Database**: DynamoDB (hot/warm papers), S3 (cold storage for archived papers)
- **API**: API Gateway v2 with Lambda handlers
- **Frontend**: Static site (Vite) deployed to S3 + CloudFront
- **Summarization**: Claude API (Haiku) for tweet-length summaries
- **IaC Engine**: Pulumi under the hood, state in S3

## Commands

```bash
# Development
sst dev                        # Local dev with Live Lambda (runs code locally against real AWS)
sst dev --stage staging        # Dev against staging environment

# Deploy
sst deploy --stage prod        # Deploy to production
sst diff                       # Preview infra changes before deploying
sst remove                     # Tear down all resources for current stage

# Secrets
sst secret set ClaudeApiKey sk-ant-...   # Set encrypted secret (per-stage, stored in SSM)

# Frontend
cd frontend && npm run build   # Build static site

# Utilities
sst shell                      # Shell with linked resources available
sst console                    # Open SST web dashboard
```

## Architecture

### Project Structure

```
├── sst.config.ts              # All infrastructure definition
├── sst-env.d.ts               # Auto-generated types for linked resources (commit this)
├── lambdas/
│   ├── api/
│   │   ├── papers.ts          # list, get, trending, search handlers
│   │   ├── rss.ts             # RSS XML generation
│   │   ├── tags.ts            # Tag listing
│   │   └── health.ts
│   ├── ingest/
│   │   └── handler.ts         # arXiv polling + dedup + summarize
│   └── process/
│       └── scoring.ts         # Trending score recomputation + cold storage migration
└── frontend/
    └── src/
```

### Key Patterns

- **Resource Linking**: SST links resources (DynamoDB, S3, secrets) to Lambda functions. Access via `import { Resource } from "sst"` — e.g., `Resource.Papers.name` for the table name. Fully typed.
- **Stages**: Each stage (dev/staging/prod) gets completely isolated resources. No shared state.
- **Transforms**: Override underlying resource defaults via the `transform` prop on SST components.
- **Outputs**: Component properties return `Output<T>` (resolved at deploy time). Use `$concat()` or `$interpolate` to compose them.

### DynamoDB Schema

- **Table**: `Papers` — PK: `arxiv_id`
- **GSI `tierTrending`**: PK: `tier` (hot/warm/cold), SK: `trending_score` — for trending queries
- Tags, published_at, summary, why_it_matters stored as attributes

### Trending Score & Storage Tiers

- `trending_score = recency × relevance × engagement` — recency decays exponentially (half-life ~7 days)
- **Hot** (>0.3): full row + embeddings in DynamoDB
- **Warm** (0.05–0.3): DynamoDB without embeddings
- **Cold** (<0.05, >90 days): archived to S3 as compressed JSON, lazy-loaded on query

### Crons

- **DailyIngest**: polls arXiv API, deduplicates (arxiv ID exact match + optional embedding similarity), summarizes with Claude
- **HourlyScoring**: recomputes trending scores, migrates papers between tiers

## Design Decisions

- arXiv API rate limit: 1 req/3s — batch ingestion only, build in retry logic
- Summarization uses title + abstract only (not full PDF text) for cost/speed
- Dedup MVP: arxiv ID exact match. Embedding similarity (cosine >0.95) is optional enhancement.
- RSS endpoint is public (no auth). API endpoints use Bearer token auth via API Gateway.
- Claude API is the dominant cost (~$1.50/mo at ~1200 papers/mo)
