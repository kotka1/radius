/**
 * Thin LLM client — OpenAI preferred; Anthropic fallback.
 * Router can override model per role.
 */

export function hasLiveLlm(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

async function openAiChat(args: {
  model: string;
  system: string;
  user: string;
  json?: boolean;
}): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0.6,
      ...(args.json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function anthropicChat(args: {
  model: string;
  system: string;
  user: string;
}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 8000,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  return (
    data.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim() ?? ""
  );
}

export async function llmText(args: {
  role: "planner" | "builder" | "critic";
  system: string;
  user: string;
  json?: boolean;
  /** Router-selected model override */
  model?: string;
}): Promise<string> {
  const planner = process.env.RADIUS_PLANNER_MODEL ?? "gpt-4o-mini";
  const builder = process.env.RADIUS_BUILDER_MODEL ?? "gpt-4o";
  const critic = process.env.RADIUS_CRITIC_MODEL ?? "gpt-4o-mini";
  const fallback =
    args.role === "planner" ? planner : args.role === "builder" ? builder : critic;
  const model = args.model ?? fallback;

  if (process.env.OPENAI_API_KEY) {
    return openAiChat({
      model,
      system: args.system,
      user: args.user,
      json: args.json,
    });
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const claudeModel = "claude-sonnet-4-20250514";
    return anthropicChat({
      model: claudeModel,
      system: args.system,
      user: args.user,
    });
  }

  throw new Error("No LLM API key configured");
}
