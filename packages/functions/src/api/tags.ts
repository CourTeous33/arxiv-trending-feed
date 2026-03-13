import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { queryByTier } from "@arxiv-feed/core/dynamo.js";
import type { TagCount } from "@arxiv-feed/core/types.js";

export const handler: APIGatewayProxyHandlerV2 = async () => {
  const hotResult = await queryByTier("hot", { limit: 100 });
  const warmResult = await queryByTier("warm", { limit: 100 });
  const allPapers = [...hotResult.papers, ...warmResult.papers];

  const counts = new Map<string, number>();
  for (const paper of allPapers) {
    for (const tag of paper.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const tags: TagCount[] = Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: tags }),
  };
};
