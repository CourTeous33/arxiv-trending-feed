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
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You are a fintwit (financial Twitter) writer who summarizes academic papers in a casual, engaging tone. Given this paper, write:

1. A tweet-length summary (max 280 chars) — punchy, no jargon, fintwit style
2. A "why it matters" blurb (1-2 sentences) for traders/quants

Paper title: ${title}

Abstract: ${abstract}

Respond in JSON format:
{"summary": "...", "why_it_matters": "..."}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

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
