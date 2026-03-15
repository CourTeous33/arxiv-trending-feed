# ArXiv Trending Paper Feed

Auto-ingests AI/ML papers from arXiv, scores them using community signals (HuggingFace upvotes, GitHub stars, Semantic Scholar citations), summarizes with Claude, and serves as a scrollable feed with RSS support.

**Live**: https://d3pe9eu5y006yf.cloudfront.net

## API Reference

Base URL: `https://br83tm1yi5.execute-api.us-east-1.amazonaws.com`

### GET /papers/trending

Returns hot papers sorted by trending score (descending).

| Parameter   | Type   | Default | Description                          |
|-------------|--------|---------|--------------------------------------|
| `limit`     | number | 20      | Max papers to return (max 50)        |
| `tag`       | string | —       | Filter by tag (e.g. `nlp`, `robotics`) |
| `nextToken` | string | —       | Pagination cursor from previous response |

**Response:**

```json
{
  "data": [
    {
      "arxiv_id": "2503.12345",
      "title": "Paper Title",
      "abstract": "Full abstract text...",
      "authors": ["Alice", "Bob"],
      "categories": ["cs.AI", "cs.LG"],
      "tags": ["deep-learning", "nlp", "generative-ai"],
      "published_at": "2025-03-14T00:00:00Z",
      "updated_at": "2025-03-14T00:00:00Z",
      "arxiv_url": "https://arxiv.org/abs/2503.12345",
      "pdf_url": "https://arxiv.org/pdf/2503.12345",
      "summary": "Tweet-length summary of the paper",
      "why_it_matters": "Why this paper is important for AI practitioners",
      "tier": "hot",
      "trending_score": 0.62,
      "citation_count": 5,
      "influential_citation_count": 1,
      "reference_count": 30,
      "hf_upvotes": 70,
      "hf_comments": 12,
      "github_stars": 150,
      "github_url": "https://github.com/org/repo",
      "citation_updated_at": "2025-03-15T10:00:00Z",
      "ingested_at": "2025-03-14T08:00:00Z"
    }
  ],
  "meta": {
    "count": 20,
    "nextToken": "eyJhcnhpdl9pZCI6Ii4uLiJ9"
  }
}
```

### GET /papers

Returns papers by tier.

| Parameter   | Type   | Default | Description                          |
|-------------|--------|---------|--------------------------------------|
| `tier`      | string | `hot`   | Storage tier: `hot` or `warm`        |
| `limit`     | number | 20      | Max papers to return (max 100)       |
| `tag`       | string | —       | Filter by tag                        |
| `nextToken` | string | —       | Pagination cursor                    |

### GET /papers/{id}

Returns a single paper by arXiv ID (e.g. `/papers/2503.12345`).

### GET /papers/search

Full-text search across paper titles, abstracts, tags, and authors.

| Parameter | Type   | Default | Description             |
|-----------|--------|---------|-------------------------|
| `q`       | string | —       | **Required.** Search query |
| `limit`   | number | 20      | Max results (max 50)    |

### GET /tags

Returns all tags with paper counts, sorted by count descending.

```json
{
  "data": [
    { "tag": "nlp", "count": 80 },
    { "tag": "generative-ai", "count": 70 },
    { "tag": "computer-vision", "count": 66 }
  ]
}
```

### GET /rss

Returns an RSS 2.0 XML feed of trending papers. No parameters.

### GET /health

Health check. Returns `{"status": "ok", "timestamp": "..."}`.

## Trending Score

Papers are scored using 5 weighted signals:

| Signal              | Weight | Source                |
|---------------------|--------|-----------------------|
| HuggingFace upvotes | 0.35   | HF Daily Papers API   |
| Recency             | 0.25   | Exponential decay (half-life 7 days) |
| Citations           | 0.15   | Semantic Scholar API  |
| GitHub stars         | 0.15   | HF Daily Papers API   |
| Relevance           | 0.10   | Tag count proxy       |

Each signal is normalized to 0–1 within the current batch, then weighted and summed.

**Tiers:** Hot (≥0.3) stays in DynamoDB, Warm (0.05–0.3) stays in DynamoDB, Cold (<0.05 and >90 days old) is archived to S3.

## Available Tags

`nlp`, `generative-ai`, `ai`, `computer-vision`, `machine-learning`, `deep-learning`, `optimization`, `safety`, `time-series`, `robotics`, `reinforcement-learning`, `statistics`, `graph-neural-networks`

## Development

```bash
bun install              # Install dependencies
bun run test             # Run unit tests (60 tests)
bun run test:watch       # Run tests in watch mode
bun run test:coverage    # Run tests with coverage
sst dev                  # Local dev with Live Lambda
sst deploy --stage prod  # Deploy to production
```

## Architecture

```
arXiv API ──► DailyIngest (cron 8am UTC)
                ├── Fetch 200 papers
                ├── Dedup by arxiv_id
                ├── Batch fetch Semantic Scholar citations
                ├── Fetch HuggingFace popularity data
                ├── Summarize with Claude (Haiku)
                └── Store in DynamoDB (hot tier)

HourlyScoring (cron every 1h)
                ├── Scan hot + warm papers
                ├── Batch fetch S2 + HF signals
                ├── Recompute trending scores
                ├── Promote/demote tiers
                └── Archive cold papers to S3

API Gateway ──► Lambda handlers ──► DynamoDB
Frontend (Vite + React) ──► CloudFront ──► S3
```
