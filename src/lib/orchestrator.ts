import { buildPromptContext } from "./context";
import { hasLiveLlm, llmText } from "./llm";
import { mockCritique, mockHtml, mockPlan } from "./mock-generate";
import {
  mockCadConceptHtml,
  mockPlanArtifact,
  planToHtml,
} from "./plan-artifact";
import { addVersion, createProject, getProject, saveProject } from "./persist";
import { routeTask } from "./router";
import type {
  AgentEvent,
  CreationDomain,
  PlanArtifact,
  Project,
  ProjectAsset,
} from "./types";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractHtml(raw: string): string {
  const fenced = raw.match(/```html\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const doc = raw.match(/<!DOCTYPE html[\s\S]*<\/html>/i);
  if (doc?.[0]) return doc[0].trim();
  if (raw.includes("<html")) return raw.trim();
  return raw.trim();
}

async function liveStructuredPlan(
  context: string,
  domain: CreationDomain,
  model: string
): Promise<PlanArtifact> {
  const raw = await llmText({
    role: "planner",
    model,
    json: true,
    system: `You are Radius Planning Mode. Create a clear ChatGPT-style plan BEFORE any deliverable is built.
Domain: ${domain}.
Return JSON:
{
  "title": string,
  "summary": string,
  "steps": string[],
  "questions": string[],
  "risks": string[],
  "deliverables": string[],
  "markdown": string
}
Rules:
- Plain English for everyday users.
- For cadConcept / aircraft: serious concept planning, parts, outsourcing — NEVER propose a marketing website.
- Include a short safety note for regulated engineering in risks.
- markdown should be useful body content (## sections), not repeating the whole JSON.`,
    user: context,
  });

  try {
    const parsed = JSON.parse(raw) as Partial<PlanArtifact>;
    if (parsed.title && parsed.summary && Array.isArray(parsed.steps)) {
      return {
        title: parsed.title,
        summary: parsed.summary,
        steps: parsed.steps.slice(0, 8),
        questions: parsed.questions?.slice(0, 8) ?? [],
        risks: parsed.risks?.slice(0, 6) ?? [],
        deliverables: parsed.deliverables?.slice(0, 6) ?? [],
        domain,
        markdown: parsed.markdown ?? `## Intent\n${context}`,
      };
    }
  } catch {
    /* fall through */
  }
  return mockPlanArtifact(context, domain);
}

async function livePlanSteps(
  context: string,
  model: string
): Promise<string[]> {
  const raw = await llmText({
    role: "planner",
    model,
    json: true,
    system:
      'Return JSON: {"steps": string[]} with 3-5 short plain-English steps. No code.',
    user: context,
  });
  try {
    const parsed = JSON.parse(raw) as { steps?: string[] };
    if (Array.isArray(parsed.steps) && parsed.steps.length)
      return parsed.steps.slice(0, 6);
  } catch {
    /* fall through */
  }
  return mockPlan(context);
}

async function liveBuildWebsite(
  context: string,
  plan: string[],
  model: string
): Promise<string> {
  const raw = await llmText({
    role: "builder",
    model,
    system: `You build beautiful, complete single-file HTML websites (inline CSS, optional tiny JS).
Rules:
- Full-bleed hero as the first viewport; brand name is hero-level, not a tiny nav-only label.
- One headline + short support + one CTA group in the hero. No cards in the hero. No stat strips.
- Expressive Google Fonts via link tags. Atmospheric background (gradient/texture), not flat gray.
- Mobile-first. Accessible semantics. Return ONLY the HTML document.`,
    user: `${context}\n\n### PLAN\n${plan.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
  });
  return extractHtml(raw);
}

async function liveBuildCadPackage(
  context: string,
  plan: PlanArtifact,
  model: string
): Promise<string> {
  const raw = await llmText({
    role: "builder",
    model,
    system: `You produce a serious HTML concept package for aircraft / CAD planning (NOT a marketing landing page).
Return a complete HTML document with sections:
Mission brief, Requirements checklist, Architecture breakdown, Parts tree, Outsourcing vendor brief, Safety disclaimer.
Use Fraunces + Outfit fonts, dark atmospheric background, clear typography.
Label clearly as CONCEPT — not flightworthy.`,
    user: `${context}\n\n### APPROVED PLAN\n${JSON.stringify(plan)}`,
  });
  return extractHtml(raw);
}

async function liveCritique(
  html: string,
  prompt: string,
  model: string
): Promise<{ notes: string[]; score: number }> {
  const raw = await llmText({
    role: "critic",
    model,
    json: true,
    system: `Critique the deliverable for clarity and usefulness to an everyday user.
Return JSON: {"notes": string[], "score": number}`,
    user: `Prompt: ${prompt}\n\nHTML:\n${html.slice(0, 24000)}`,
  });
  try {
    const parsed = JSON.parse(raw) as { notes?: string[]; score?: number };
    return {
      notes: parsed.notes?.length ? parsed.notes : ["Looks ready for Keep / Tweak."],
      score: typeof parsed.score === "number" ? parsed.score : 80,
    };
  } catch {
    return mockCritique(html);
  }
}

export type RunArgs = {
  prompt: string;
  projectId?: string;
  tweak?: string;
  currentHtml?: string;
  approve?: boolean;
  revisePlan?: boolean;
  assets?: ProjectAsset[];
  emit: (event: AgentEvent) => void;
};

export async function runOrchestrator(args: RunArgs): Promise<{
  project: Project;
  html: string;
  version: number;
}> {
  const { emit } = args;
  const assets = args.assets ?? [];

  let project: Project;
  if (args.projectId) {
    const existing = await getProject(args.projectId);
    if (!existing) throw new Error("Project not found");
    project = existing;
    if (assets.length) {
      project.assets = [...project.assets, ...assets];
      project = await saveProject(project);
    }
  } else {
    project = await createProject({ prompt: args.prompt, assets });
  }

  const context = buildPromptContext({
    userPrompt: args.prompt,
    tweak: args.tweak,
    currentHtml: args.currentHtml,
    assets: project.assets,
    budgetTokens: 7000,
  });

  const route = routeTask({
    prompt: args.prompt,
    tweak: args.tweak,
    assetCount: project.assets.length,
    approve: args.approve,
    revisePlan: args.revisePlan,
  });

  emit({
    type: "route",
    label: route.spiralLabel,
    mode: route.mode,
    domain: route.domain,
  });

  const live = hasLiveLlm();

  emit({
    type: "status",
    role: "system",
    message: live
      ? "Connecting the best models for this job…"
      : "Building with the demo engine — add an API key anytime for live models.",
  });
  await sleep(220);

  // ——— PLAN FIRST ———
  if (route.planFirst) {
    emit({
      type: "status",
      role: "planner",
      message:
        route.domain === "cadConcept"
          ? "Planning a serious aircraft / CAD concept path — not a website…"
          : "Planning before we build anything…",
    });
    await sleep(320);

    const planArtifact = live
      ? await liveStructuredPlan(context, route.domain, route.plannerModel)
      : mockPlanArtifact(args.prompt, route.domain);

    project.pendingPlan = planArtifact;
    project = await saveProject(project);

    emit({ type: "plan", steps: planArtifact.steps });
    emit({ type: "planArtifact", plan: planArtifact });

    const planHtml = planToHtml(planArtifact);
    emit({ type: "html", html: planHtml, version: 1 });
    emit({ type: "awaitingApproval", projectId: project.id });
    emit({
      type: "status",
      role: "system",
      message: "Plan ready — Approve to build, or revise with Tweak.",
    });
    emit({ type: "done", projectId: project.id, version: 0 });

    return { project, html: planHtml, version: 0 };
  }

  // ——— BUILD (approved plan, website, or tweak) ———
  const pending = project.pendingPlan;
  const domain = pending?.domain ?? route.domain;

  emit({
    type: "status",
    role: "planner",
    message:
      args.approve || pending
        ? "Approved — starting the build…"
        : "Reading your request…",
  });
  await sleep(280);

  const steps =
    pending?.steps ??
    (live
      ? await livePlanSteps(context, route.plannerModel)
      : mockPlan(args.prompt, args.tweak));

  emit({ type: "plan", steps });

  emit({
    type: "status",
    role: "builder",
    message:
      domain === "cadConcept"
        ? "Assembling the concept package into the preview…"
        : "Composing into the live preview…",
  });
  await sleep(300);

  let html: string;
  if (domain === "cadConcept") {
    const planForBuild = pending ?? mockPlanArtifact(args.prompt, "cadConcept");
    html = live
      ? await liveBuildCadPackage(context, planForBuild, route.builderModel)
      : mockCadConceptHtml(args.prompt, planForBuild);
  } else if (args.tweak && args.currentHtml) {
    html = live
      ? await liveBuildWebsite(context, steps, route.builderModel)
      : mockHtml({
          prompt: args.prompt,
          tweak: args.tweak,
          currentHtml: args.currentHtml,
        });
  } else {
    html = live
      ? await liveBuildWebsite(context, steps, route.builderModel)
      : mockHtml({
          prompt: args.prompt,
          tweak: args.tweak,
          currentHtml: args.currentHtml,
        });
  }

  const mid = Math.floor(html.length * 0.55);
  emit({
    type: "html",
    html: html.slice(0, mid) + "\n<!-- … -->\n</body></html>",
    version: 0,
  });
  await sleep(200);
  emit({ type: "html", html, version: 1 });

  emit({
    type: "status",
    role: "critic",
    message: "Checking clarity and usefulness…",
  });
  await sleep(240);

  const critique = live
    ? await liveCritique(html, args.prompt, route.criticModel)
    : mockCritique(html);

  emit({ type: "critique", notes: critique.notes, score: critique.score });

  project.pendingPlan = undefined;
  project = await saveProject(project);

  project = await addVersion(project.id, {
    prompt: args.tweak
      ? `${args.prompt}\n\nTweak: ${args.tweak}`
      : args.prompt,
    html,
    plan: steps,
    critique: critique.notes,
    domain,
    planArtifact: pending,
  });

  const version = project.currentVersionIndex + 1;
  emit({ type: "done", projectId: project.id, version });
  emit({
    type: "status",
    role: "system",
    message: "Ready — Keep, undo, or tweak.",
  });

  return { project, html, version };
}
