import Anthropic from "@anthropic-ai/sdk";
import { Resource } from "sst";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: Resource.ClaudeApiKey.value });
  }
  return client;
}

interface SummarizeResult {
  summary: string;
  why_it_matters: string;
}

export async function summarizePaper(
  title: string,
  abstract: string
): Promise<SummarizeResult> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `You are a tech Twitter writer who summarizes AI research papers in a casual, engaging tone. Given this paper, write:

1. A tweet-length summary (max 280 chars) — punchy, no jargon, accessible style
2. A "why it matters" blurb (1-2 sentences) for AI researchers and practitioners

Paper title: ${title}

Abstract: ${abstract}

Respond with ONLY raw JSON, no markdown fences or other text:
{"summary": "...", "why_it_matters": "..."}`,
      },
    ],
  });

  let text =
    message.content[0].type === "text" ? message.content[0].text : "";

  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  try {
    const parsed = JSON.parse(text);
    return {
      summary: parsed.summary ?? "",
      why_it_matters: parsed.why_it_matters ?? "",
    };
  } catch {
    return {
      summary: text.slice(0, 280),
      why_it_matters: "",
    };
  }
}
