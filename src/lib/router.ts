/**
 * Radius Router — invisible model + domain selection for everyday users.
 * UI shows the Spiral and plain English — never model names.
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
  /** Require plan approval before building */
  planFirst: boolean;
};

const OPENAI = {
  quality: {
    planner: process.env.RADIUS_PLANNER_MODEL ?? "gpt-4o",
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
};

function detectDomain(prompt: string): CreationDomain {
  const p = prompt.toLowerCase();

  if (
    /\b(aeroplane|airplane|aircraft|plane|cad|3d\s*model|step\s*file|stl|solidworks|fusion\s*360|cnc|machin|blueprint|schematic|fuselage|wing\s*span|parts?\s*list|engineering\s*drawing|outsourcing)\b/i.test(
      p
    )
  ) {
    return "cadConcept";
  }

  if (
    /\b(website|landing\s*page|web\s*page|homepage|site\s*for|portfolio\s*site|storefront)\b/i.test(
      p
    )
  ) {
    return "website";
  }

  if (
    /\b(logo|poster|brand\s*visual|moodboard|image|illustration|hero\s*visual)\b/i.test(
      p
    )
  ) {
    return "visual";
  }

  if (
    /\b(document|proposal|brief|report|spec|whitepaper|pdf)\b/i.test(p)
  ) {
    return "document";
  }

  if (
    /\b(plan|strategy|roadmap|research|how\s*(do|can|should)\s*i|help\s*me\s*(think|plan))\b/i.test(
      p
    )
  ) {
    return "plan";
  }

  // Short vague prompts like "an aeroplane" already caught; default to plan-first general
  if (p.split(/\s+/).length <= 6) return "plan";

  return "website";
}

function spiralFor(domain: CreationDomain, mode: RouterMode): string {
  if (domain === "cadConcept") {
    return mode === "speed"
      ? "Refining the technical plan…"
      : "Planning the CAD concept…";
  }
  if (domain === "plan") return "Thinking it through…";
  if (domain === "document") return "Structuring the document…";
  if (domain === "visual") return "Shaping the visual concept…";
  if (mode === "speed") return "Refining quickly…";
  if (mode === "quality") return "Choosing the best path…";
  return "Thinking it through…";
}

export function routeTask(intent: {
  prompt: string;
  tweak?: string;
  assetCount?: number;
  approve?: boolean;
  /** User is revising the plan — stay in plan-first, don't build yet */
  revisePlan?: boolean;
}): RouteDecision {
  const domain = detectDomain(intent.prompt);
  const hasTweak = Boolean(intent.tweak?.trim());
  const isRichBrief =
    intent.prompt.length > 120 || (intent.assetCount ?? 0) > 0;

  let mode: RouterMode = "balanced";
  if (hasTweak && !intent.revisePlan) mode = "speed";
  else if (domain === "cadConcept" || isRichBrief) mode = "quality";

  const models = OPENAI[mode];
  const needsPlanDomain =
    domain === "cadConcept" ||
    domain === "plan" ||
    domain === "document" ||
    domain === "visual";

  const planFirst =
    !intent.approve &&
    needsPlanDomain &&
    (intent.revisePlan || !hasTweak);

  return {
    mode,
    domain,
    plannerModel: models.planner,
    builderModel: models.builder,
    criticModel: models.critic,
    spiralLabel: spiralFor(domain, mode),
    planFirst,
  };
}
