/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "arxiv-trading-feed",
      removal: input?.stage === "prod" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: { region: "us-east-1" },
      },
    };
  },
  async run() {
    // Secrets
    const claudeApiKey = new sst.Secret("ClaudeApiKey");

    // DynamoDB table
    const papers = new sst.aws.Dynamo("Papers", {
      fields: {
        arxiv_id: "string",
        tier: "string",
        trending_score: "number",
      },
      primaryIndex: { hashKey: "arxiv_id" },
      globalIndexes: {
        tierTrending: {
          hashKey: "tier",
          rangeKey: "trending_score",
        },
      },
    });

    // S3 bucket for cold storage
    const coldStorage = new sst.aws.Bucket("ColdStorage");

    // API Gateway
    const api = new sst.aws.ApiGatewayV2("Api");

    api.route("GET /papers", {
      handler: "packages/functions/src/api/papers.list",
      link: [papers],
    });

    api.route("GET /papers/{id}", {
      handler: "packages/functions/src/api/papers.get",
      link: [papers],
    });

    api.route("GET /papers/trending", {
      handler: "packages/functions/src/api/papers.trending",
      link: [papers],
    });

    api.route("GET /papers/search", {
      handler: "packages/functions/src/api/papers.search",
      link: [papers],
    });

    api.route("GET /rss", {
      handler: "packages/functions/src/api/rss.handler",
      link: [papers],
    });

    api.route("GET /tags", {
      handler: "packages/functions/src/api/tags.handler",
      link: [papers],
    });

    api.route("GET /health", {
      handler: "packages/functions/src/api/health.handler",
    });

    // Cron: Daily ingestion
    new sst.aws.Cron("DailyIngest", {
      schedule: "cron(0 8 * * ? *)",
      job: {
        handler: "packages/functions/src/ingest/handler.handler",
        link: [papers, claudeApiKey],
        timeout: "300 seconds",
      },
    });

    // Cron: Hourly scoring
    new sst.aws.Cron("HourlyScoring", {
      schedule: "rate(1 hour)",
      job: {
        handler: "packages/functions/src/process/scoring.handler",
        link: [papers, coldStorage],
        timeout: "120 seconds",
      },
    });

    return {
      api: api.url,
    };
  },
});
