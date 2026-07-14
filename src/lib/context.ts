/**
 * Priority-ranked context packing (Priompt-inspired).
 * Packs materials into a token budget so the orchestrator sees what matters most.
 */

import type { ProjectAsset } from "./types";

const CHARS_PER_TOKEN = 4;

export type ContextChunk = {
  id: string;
  label: string;
  content: string;
  priority: number;
};

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Higher priority kept first when budget is tight. */
export function packContext(
  chunks: ContextChunk[],
  budgetTokens: number
): { packed: ContextChunk[]; dropped: ContextChunk[]; usedTokens: number } {
  const sorted = [...chunks].sort((a, b) => b.priority - a.priority);
  const packed: ContextChunk[] = [];
  const dropped: ContextChunk[] = [];
  let used = 0;

  for (const chunk of sorted) {
    const cost = estimateTokens(chunk.content) + estimateTokens(chunk.label) + 8;
    if (used + cost <= budgetTokens) {
      packed.push(chunk);
      used += cost;
    } else {
      dropped.push(chunk);
    }
  }

  return { packed, dropped, usedTokens: used };
}

export function assetToChunk(asset: ProjectAsset): ContextChunk | null {
  if (asset.textExcerpt) {
    return {
      id: asset.id,
      label: `${asset.kind.toUpperCase()}: ${asset.name}`,
      content: asset.textExcerpt.slice(0, 8000),
      priority: asset.priority,
    };
  }
  if (asset.kind === "logo" || asset.kind === "image") {
    return {
      id: asset.id,
      label: `${asset.kind.toUpperCase()}: ${asset.name}`,
      content: `[Image asset available at /api/assets/${asset.id} — incorporate as hero or logo if appropriate. MIME: ${asset.mimeType}]`,
      priority: asset.priority,
    };
  }
  return null;
}

export function buildPromptContext(args: {
  userPrompt: string;
  tweak?: string;
  currentHtml?: string;
  assets: ProjectAsset[];
  budgetTokens?: number;
}): string {
  const budget = args.budgetTokens ?? 6000;
  const chunks: ContextChunk[] = [
    {
      id: "intent",
      label: "USER INTENT",
      content: args.userPrompt.trim(),
      priority: 100,
    },
  ];

  if (args.tweak?.trim()) {
    chunks.push({
      id: "tweak",
      label: "TWEAK REQUEST",
      content: args.tweak.trim(),
      priority: 95,
    });
  }

  if (args.currentHtml?.trim()) {
    chunks.push({
      id: "current",
      label: "CURRENT HTML (revise in place; preserve structure unless asked)",
      content: args.currentHtml.slice(0, 40000),
      priority: 70,
    });
  }

  for (const asset of args.assets) {
    const chunk = assetToChunk(asset);
    if (chunk) chunks.push(chunk);
  }

  const { packed } = packContext(chunks, budget);
  return packed
    .map((c) => `### ${c.label}\n${c.content}`)
    .join("\n\n");
}

export function inferAssetKind(
  name: string,
  mimeType: string
): ProjectAsset["kind"] {
  const lower = name.toLowerCase();
  if (lower.includes("logo") || lower.includes("mark")) return "logo";
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/pdf" ||
    lower.endsWith(".md") ||
    lower.endsWith(".txt")
  ) {
    return "brief";
  }
  if (mimeType.startsWith("image/")) return "image";
  return "other";
}

export function defaultPriority(kind: ProjectAsset["kind"]): number {
  switch (kind) {
    case "logo":
      return 85;
    case "brief":
      return 80;
    case "image":
      return 60;
    default:
      return 40;
  }
}
