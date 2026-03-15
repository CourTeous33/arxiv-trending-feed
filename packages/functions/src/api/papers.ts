import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getPaper, queryByTier } from "@arxiv-feed/core/dynamo.js";
import type { Paper } from "@arxiv-feed/core/types.js";

function decodeToken(raw: string | undefined): Record<string, any> | undefined {
  return raw ? JSON.parse(Buffer.from(raw, "base64url").toString()) : undefined;
}

function encodeToken(token: Record<string, any> | undefined): string | undefined {
  return token ? Buffer.from(JSON.stringify(token)).toString("base64url") : undefined;
}

function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function queryWithTagFilter(
  tier: string,
  opts: { limit: number; tag?: string; nextToken?: Record<string, any> }
) {
  const fetchLimit = opts.tag ? Math.min(opts.limit * 5, 500) : opts.limit;
  const result = await queryByTier(tier, { limit: fetchLimit, nextToken: opts.nextToken });

  const filtered = opts.tag
    ? result.papers.filter((p: Paper) => p.tags.includes(opts.tag!)).slice(0, opts.limit)
    : result.papers.slice(0, opts.limit);

  return { papers: filtered, nextToken: result.nextToken };
}

export const list: APIGatewayProxyHandlerV2 = async (event) => {
  const params = event.queryStringParameters ?? {};
  const limit = Math.min(parseInt(params.limit ?? "20", 10), 100);
  const tier = params.tier ?? "hot";

  const result = await queryWithTagFilter(tier, {
    limit,
    tag: params.tag,
    nextToken: decodeToken(params.nextToken),
  });

  return jsonResponse(200, {
    data: result.papers,
    meta: {
      count: result.papers.length,
      nextToken: encodeToken(result.nextToken),
    },
  });
};

export const get: APIGatewayProxyHandlerV2 = async (event) => {
  const id = event.pathParameters?.id;
  if (!id) {
    return jsonResponse(400, { error: "Missing paper ID" });
  }

  const paper = await getPaper(decodeURIComponent(id));
  if (!paper) {
    return jsonResponse(404, { error: "Paper not found" });
  }

  return jsonResponse(200, { data: paper });
};

export const trending: APIGatewayProxyHandlerV2 = async (event) => {
  const params = event.queryStringParameters ?? {};
  const limit = Math.min(parseInt(params.limit ?? "20", 10), 50);

  const result = await queryWithTagFilter("hot", {
    limit,
    tag: params.tag,
    nextToken: decodeToken(params.nextToken),
  });

  return jsonResponse(200, {
    data: result.papers,
    meta: {
      count: result.papers.length,
      nextToken: encodeToken(result.nextToken),
    },
  });
};

export const search: APIGatewayProxyHandlerV2 = async (event) => {
  const params = event.queryStringParameters ?? {};
  const q = params.q?.toLowerCase();

  if (!q) {
    return jsonResponse(400, { error: "Missing search query parameter 'q'" });
  }

  const hotResult = await queryByTier("hot", { limit: 100 });
  const warmResult = await queryByTier("warm", { limit: 100 });
  const allPapers = [...hotResult.papers, ...warmResult.papers];

  const matches = allPapers.filter((p) => {
    const text =
      `${p.title} ${p.abstract} ${p.tags.join(" ")} ${p.authors.join(" ")}`.toLowerCase();
    return text.includes(q);
  });

  const limit = Math.min(parseInt(params.limit ?? "20", 10), 50);

  return jsonResponse(200, {
    data: matches.slice(0, limit),
    meta: { count: matches.length },
  });
};
