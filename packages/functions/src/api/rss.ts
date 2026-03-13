import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { queryByTier } from "@arxiv-feed/core/dynamo.js";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const handler: APIGatewayProxyHandlerV2 = async () => {
  const result = await queryByTier("hot", { limit: 50 });

  const items = result.papers
    .map(
      (p) => `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${escapeXml(p.arxiv_url)}</link>
      <description>${escapeXml(p.summary)}</description>
      <pubDate>${new Date(p.published_at).toUTCString()}</pubDate>
      <guid isPermaLink="false">${escapeXml(p.arxiv_id)}</guid>
      ${p.tags.map((t) => `<category>${escapeXml(t)}</category>`).join("\n      ")}
    </item>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>ArXiv AI Trading Paper Feed</title>
    <description>Latest AI/ML papers relevant to trading and quantitative finance</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
    body: xml,
  };
};
