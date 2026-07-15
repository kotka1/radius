/**
 * Radius Router v2 — invisible model + creation-domain selection.
 * Classifies intent into a creation domain, picks quality/speed/balance,
 * and returns the concrete model IDs the orchestrator passes into LLM calls.
 * The UI shows the Spiral copy, never model names.
 */

import type { CreationDomain, RouterMode } from "./types";

export type RouteDecision = {
  mode: RouterMode;
  domain: CreationDomain;
  plannerModel: string;
  builderModel: string;
  criticModel: string;
  /** Plain-English label for the Spiral Spinner */
  spiralLabel: string;
  /** Human label for the domain (feed only, still no model names) */
  domainLabel: string;
  /** Regulated work (aircraft/CAD) that needs a non-certification note */
  requiresSafetyNote: boolean;
};

const DEFAULTS = {
  quality: {
    planner: process.env.RADIUS_PLANNER_MODEL ?? "gpt-4o-mini",
    builder: process.env.RADIUS_BUILDER_MODEL ?? "gpt-4o",
    critic: process.env.RADIUS_CRITIC_MODEL ?? "gpt-4o-mini",
  },
  speed: {
    planner: process.env.RADIUS_PLANNER_MODEL ?? "gpt-4o-mini",
    builder: process.env.RADIUS_BUILDER_MODEL ?? "gpt-4o-mini",
    critic: process.env.RADIUS_CRITIC_MODEL ?? "gpt-4o-mini",
  },
  balanced: {
    planner: process.env.RADIUS_PLANNER_MODEL ?? "gpt-4o-mini",
    builder: process.env.RADIUS_BUILDER_MODEL ?? "gpt-4o",
    critic: process.env.RADIUS_CRITIC_MODEL ?? "gpt-4o-mini",
  },
} as const;

const DOMAIN_LABEL: Record<CreationDomain, string> = {
  website: "Website",
  plan: "Plan",
  document: "Document",
  visualConcept: "Visual concept",
  cadConcept: "CAD concept",
};

const SPIRAL_BY_DOMAIN: Record<CreationDomain, string> = {
  website: "Planning the build…",
  plan: "Choosing the best path…",
  document: "Shaping the document…",
  visualConcept: "Sketching the concept…",
  cadConcept: "Preparing the CAD concept…",
};

const CAD_RE =
  /\b(aircraft|airplane|aeroplane|plane|jet|glider|drone|uav|rocket|aerospace|fuselage|wing(?:span)?|airfoil|cad|cam|step file|stl|solidworks|fusion\s*360|3d\s*model|3d\s*print|mechanical part|machined?|manufactur\w*|tolerance|engineering drawing|assembly|bracket|chassis|enclosure|gearbox|turbine|propeller)\b/i;
const WEBSITE_RE =
  /\b(website|web\s*site|landing page|web page|webpage|homepage|home page|storefront|portfolio site|marketing site|app page|one[-\s]?pager|microsite)\b/i;
const DOCUMENT_RE =
  /\b(document|essay|report|white\s*paper|whitepaper|memo|letter|cover letter|resume|cv|proposal|contract|spec sheet|blog post|article|press release|readme|user guide|manual)\b/i;
const PLAN_RE =
  /\b(plan|strategy|roadmap|research|analysis|business plan|go[-\s]?to[-\s]?market|gtm|launch plan|checklist|framework|outline|study)\b/i;
const VISUAL_RE =
  /\b(logo|moodboard|mood board|brand identity|color palette|colour palette|poster|illustration|concept art|visual concept|style guide)\b/i;

export function classifyDomain(prompt: string): CreationDomain {
  const p = prompt.toLowerCase();
  // High-stakes / technical wins first so "plane website" still gets safety framing.
  if (CAD_RE.test(p)) return "cadConcept";
  if (WEBSITE_RE.test(p)) return "website";
  if (VISUAL_RE.test(p)) return "visualConcept";
  if (DOCUMENT_RE.test(p)) return "document";
  if (PLAN_RE.test(p)) return "plan";
  // Ambiguous everyday asks default to a website (v1 core deliverable).
  return "website";
}

export function routeTask(intent: {
  prompt: string;
  tweak?: string;
  assetCount?: number;
  /** Domain from an already-approved plan, so build matches plan. */
  domain?: CreationDomain;
}): RouteDecision {
  const hasTweak = Boolean(intent.tweak?.trim());
  const isRichBrief =
    intent.prompt.length > 120 || (intent.assetCount ?? 0) > 0;

  const domain = intent.domain ?? classifyDomain(intent.prompt);

  let mode: RouterMode = "balanced";
  if (hasTweak) mode = "speed";
  else if (domain === "cadConcept" || isRichBrief) mode = "quality";

  const preset = DEFAULTS[mode];
  return {
    mode,
    domain,
    plannerModel: preset.planner,
    builderModel: preset.builder,
    criticModel: preset.critic,
    spiralLabel: hasTweak ? "Refining quickly…" : SPIRAL_BY_DOMAIN[domain],
    domainLabel: DOMAIN_LABEL[domain],
    requiresSafetyNote: domain === "cadConcept",
  };
}
