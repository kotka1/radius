/**
 * Radius Router — invisible model selection for everyday users.
 * Picks quality / speed / balance from intent; UI shows the Spiral, not model names.
 */

export type RouterMode = "quality" | "speed" | "balanced";

export type RouteDecision = {
  mode: RouterMode;
  plannerModel: string;
  builderModel: string;
  criticModel: string;
  /** Plain-English label for the Spiral Spinner */
  spiralLabel: string;
};

const DEFAULTS = {
  quality: {
    planner: process.env.RADIUS_PLANNER_MODEL ?? "gpt-4o-mini",
    builder: process.env.RADIUS_BUILDER_MODEL ?? "gpt-4o",
    critic: process.env.RADIUS_CRITIC_MODEL ?? "gpt-4o-mini",
    label: "Choosing the best path…",
  },
  speed: {
    planner: process.env.RADIUS_PLANNER_MODEL ?? "gpt-4o-mini",
    builder: process.env.RADIUS_BUILDER_MODEL ?? "gpt-4o-mini",
    critic: process.env.RADIUS_CRITIC_MODEL ?? "gpt-4o-mini",
    label: "Refining quickly…",
  },
  balanced: {
    planner: process.env.RADIUS_PLANNER_MODEL ?? "gpt-4o-mini",
    builder: process.env.RADIUS_BUILDER_MODEL ?? "gpt-4o",
    critic: process.env.RADIUS_CRITIC_MODEL ?? "gpt-4o-mini",
    label: "Thinking it through…",
  },
};

export function routeTask(intent: {
  prompt: string;
  tweak?: string;
  assetCount?: number;
}): RouteDecision {
  const hasTweak = Boolean(intent.tweak?.trim());
  const isRichBrief =
    intent.prompt.length > 120 || (intent.assetCount ?? 0) > 0;

  let mode: RouterMode = "balanced";
  if (hasTweak) mode = "speed";
  else if (isRichBrief) mode = "quality";

  const preset = DEFAULTS[mode];
  return {
    mode,
    plannerModel: preset.planner,
    builderModel: preset.builder,
    criticModel: preset.critic,
    spiralLabel: preset.label,
  };
}
