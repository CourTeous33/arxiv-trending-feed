import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getPaper, queryByTier } from "@arxiv-feed/core/dynamo.js";

export const list: APIGatewayProxyHandlerV2 = async (event) => {
  const params = event.queryStringParameters ?? {};
  const limit = Math.min(parseInt(params.limit ?? "20", 10), 100);
  const tier = params.tier ?? "hot";
  const nextToken = params.nextToken
    ? JSON.parse(Buffer.from(params.nextToken, "base64url").toString())
    : undefined;

  const result = await queryByTier(tier, { limit, nextToken });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: result.papers,
      meta: {
        count: result.papers.length,
        nextToken: result.nextToken
          ? Buffer.from(JSON.stringify(result.nextToken)).toString("base64url")
          : undefined,
      },
    }),
  };
};

export const get: APIGatewayProxyHandlerV2 = async (event) => {
  const id = event.pathParameters?.id;
  if (!id) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing paper ID" }),
    };
  }

  const paper = await getPaper(decodeURIComponent(id));
  if (!paper) {
    return {
      statusCode: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Paper not found" }),
    };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: paper }),
  };
};

export const trending: APIGatewayProxyHandlerV2 = async (event) => {
  const params = event.queryStringParameters ?? {};
  const limit = Math.min(parseInt(params.limit ?? "20", 10), 50);

  // Query hot tier sorted by trending_score descending (default)
  const result = await queryByTier("hot", { limit });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: result.papers,
      meta: { count: result.papers.length },
    }),
  };
};

export const search: APIGatewayProxyHandlerV2 = async (event) => {
  const params = event.queryStringParameters ?? {};
  const q = params.q?.toLowerCase();

  if (!q) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing search query parameter 'q'" }),
    };
  }

  // Simple scan-based search across hot + warm tiers
  // For production, consider OpenSearch or DynamoDB filter expressions
  const hotResult = await queryByTier("hot", { limit: 100 });
  const warmResult = await queryByTier("warm", { limit: 100 });
  const allPapers = [...hotResult.papers, ...warmResult.papers];

  const matches = allPapers.filter((p) => {
    const text =
      `${p.title} ${p.abstract} ${p.tags.join(" ")} ${p.authors.join(" ")}`.toLowerCase();
    return text.includes(q);
  });

  const limit = Math.min(parseInt(params.limit ?? "20", 10), 50);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: matches.slice(0, limit),
      meta: { count: matches.length },
    }),
  };
};
