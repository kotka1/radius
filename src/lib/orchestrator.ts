import {
  mockAircraftConcept,
  mockDocumentArtifact,
  mockPlanArtifact,
  parseAircraftConcept,
  parseDocumentArtifact,
  parsePlanArtifact,
} from "./artifacts";
import { buildPromptContext } from "./context";
import { hasLiveLlm, llmText } from "./llm";
import { mockCritique, mockHtml } from "./mock-generate";
import { addVersion, createProject, ensureProject, saveProject } from "./persist";
import { routeTask, type RouteDecision } from "./router";
import type {
  AgentEvent,
  AircraftConceptArtifact,
  CreationArtifact,
  CreationDomain,
  DocumentArtifact,
  PlanArtifact,
  Project,
  ProjectAsset,
  WebsiteArtifact,
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

/* ------------------------------ PLANNING ------------------------------- */

async function livePlan(
  context: string,
  route: RouteDecision,
  prompt: string
): Promise<PlanArtifact> {
  const raw = await llmText({
    role: "planner",
    model: route.plannerModel,
    json: true,
    system: `You are Radius' planner. Turn the user's request into a clear, ChatGPT-style plan the user approves before anything is built.
Creation domain: ${route.domain}.
Return JSON: {"title": string, "summary": string, "steps": string[] (3-6), "questions": string[] (2-4 clarifying), "risks": string[] (1-3), "deliverables": string[] (1-5)}.
Keep it plain-English and concrete. No code.`,
    user: context,
  });
  return parsePlanArtifact(raw, route.domain, prompt);
}

/* ------------------------------ BUILDERS ------------------------------- */

async function liveBuildWebsite(
  context: string,
  plan: PlanArtifact,
  route: RouteDecision
): Promise<string> {
  const raw = await llmText({
    role: "builder",
    model: route.builderModel,
    system: `You build beautiful, complete single-file HTML websites (inline CSS, optional tiny JS).
Rules:
- Full-bleed hero as the first viewport; brand name is hero-level, not a tiny nav-only label.
- One headline + short support + one CTA group in the hero. No cards in the hero. No stat strips.
- Expressive Google Fonts via link tags. Atmospheric background (gradient/texture), not flat gray.
- Mobile-first. Accessible semantics. Return ONLY the HTML document.`,
    user: `${context}\n\n### PLAN\n${plan.steps
      .map((s, i) => `${i + 1}. ${s}`)
      .join("\n")}`,
  });
  return extractHtml(raw);
}

async function liveCritique(
  html: string,
  prompt: string,
  route: RouteDecision
): Promise<{ notes: string[]; score: number }> {
  const raw = await llmText({
    role: "critic",
    model: route.criticModel,
    json: true,
    system: `Critique a landing page for everyday users and brand-first design.
Return JSON: {"notes": string[], "score": number, "needsRevision": boolean, "revisionHint": string}
Score 0-100. Keep notes short and actionable.`,
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

async function liveDocument(
  context: string,
  plan: PlanArtifact,
  route: RouteDecision,
  prompt: string
): Promise<DocumentArtifact> {
  const raw = await llmText({
    role: "builder",
    model: route.builderModel,
    system: `You write clear, well-structured documents in Markdown for everyday users.
Use a single top-level "# Title", then "##" sections. Return ONLY Markdown, no code fences.`,
    user: `${context}\n\n### APPROVED PLAN\n${plan.steps
      .map((s, i) => `${i + 1}. ${s}`)
      .join("\n")}`,
  });
  return parseDocumentArtifact(raw, prompt, plan);
}

async function liveAircraftConcept(
  context: string,
  route: RouteDecision,
  prompt: string
): Promise<AircraftConceptArtifact> {
  const raw = await llmText({
    role: "builder",
    model: route.builderModel,
    json: true,
    system: `You are Radius' aircraft concept assistant. Produce a SERIOUS but clearly CONCEPTUAL (non-certified) aircraft package.
Return JSON with: {"title": string, "mission": string, "brief": {"size","payload","range","propulsion","crew"}, "requirements": string[], "architecture": [{"name","description","material","considerations": string[]}], "outsourcing": {"questionsForEngineers": string[], "requiredFiles": string[], "vendorBrief": string, "reviewChecklist": string[]}, "geometry": {"fuselageLength","fuselageRadius","noseLength","tailLength","wingSpan","wingChord","wingSweepDeg","wingDihedralDeg","tailSpan","tailChord","finHeight"}}.
Geometry values are approximate metres. Do NOT claim certification or airworthiness.`,
    user: context,
  });
  return parseAircraftConcept(raw, prompt);
}

/* ------------------------------ PROJECT -------------------------------- */

async function resolveProject(args: RunArgs): Promise<Project> {
  const assets = args.assets ?? [];
  if (args.projectId) {
    // Rehydrate from client snapshot when memory/`/tmp` was wiped on Vercel.
    return ensureProject({
      id: args.projectId,
      prompt: args.prompt,
      pendingPlan: args.plan,
      artifact: args.artifact,
      html: args.currentHtml,
      assets,
    });
  }
  return createProject({ prompt: args.prompt, assets });
}

export type RunArgs = {
  prompt: string;
  projectId?: string;
  action?: "plan" | "build";
  plan?: PlanArtifact;
  /** Latest artifact from the client — seeds versions on cold-start rehydrate. */
  artifact?: CreationArtifact;
  tweak?: string;
  currentHtml?: string;
  assets?: ProjectAsset[];
  emit: (event: AgentEvent) => void;
};

export async function runOrchestrator(args: RunArgs): Promise<{
  project: Project;
  version: number;
}> {
  const action = args.action ?? "plan";
  return action === "build" ? runBuildPhase(args) : runPlanPhase(args);
}

/* --------------------------- PLAN PHASE -------------------------------- */

async function runPlanPhase(args: RunArgs): Promise<{
  project: Project;
  version: number;
}> {
  const { emit } = args;
  let project = await resolveProject(args);

  const route = routeTask({
    prompt: args.prompt,
    tweak: args.tweak,
    assetCount: project.assets.length,
  });

  emit({
    type: "route",
    label: route.spiralLabel,
    mode: route.mode,
    domain: route.domain,
    domainLabel: route.domainLabel,
  });

  const live = hasLiveLlm();
  emit({
    type: "status",
    role: "system",
    message: live
      ? "Choosing the best path for this request…"
      : "Planning locally (demo engine) — add an API key anytime for live models.",
  });
  await sleep(240);

  emit({
    type: "status",
    role: "planner",
    message: "Reading your request and drafting a plan…",
  });
  await sleep(360);

  const context = buildPromptContext({
    userPrompt: args.prompt,
    tweak: args.tweak,
    currentHtml: args.currentHtml,
    assets: project.assets,
    budgetTokens: 7000,
  });

  const plan = live
    ? await livePlan(context, route, args.prompt)
    : mockPlanArtifact(route.domain, args.prompt, args.tweak);

  emit({ type: "plan", steps: plan.steps });
  emit({ type: "planArtifact", plan });

  project.pendingPlan = plan;
  project = await saveProject(project);

  emit({ type: "awaitingApproval", plan });
  emit({
    type: "done",
    projectId: project.id,
    version: project.currentVersionIndex + 1,
    phase: "plan",
  });

  return { project, version: project.currentVersionIndex + 1 };
}

/* --------------------------- BUILD PHASE ------------------------------- */

async function buildArtifact(
  domain: CreationDomain,
  plan: PlanArtifact,
  route: RouteDecision,
  args: RunArgs,
  context: string,
  live: boolean,
  emit: (e: AgentEvent) => void
): Promise<{ artifact: CreationArtifact; critique?: string[]; score?: number }> {
  if (domain === "cadConcept") {
    emit({
      type: "status",
      role: "builder",
      message: "Assembling the aircraft concept package…",
    });
    await sleep(320);
    const concept = live
      ? await liveAircraftConcept(context, route, args.prompt)
      : mockAircraftConcept(args.prompt);
    return { artifact: concept };
  }

  if (domain === "document" || domain === "plan" || domain === "visualConcept") {
    emit({
      type: "status",
      role: "builder",
      message: "Writing the document…",
    });
    await sleep(320);
    const doc = live
      ? await liveDocument(context, plan, route, args.prompt)
      : mockDocumentArtifact(args.prompt, plan);
    return { artifact: doc };
  }

  // Website (default deliverable).
  emit({
    type: "status",
    role: "builder",
    message: "Composing the page into the live preview…",
  });
  await sleep(320);

  let html = live
    ? await liveBuildWebsite(context, plan, route)
    : mockHtml({
        prompt: args.prompt,
        tweak: args.tweak,
        currentHtml: args.currentHtml,
      });

  const mid = Math.floor(html.length * 0.55);
  emit({
    type: "html",
    html: html.slice(0, mid) + "\n<!-- … -->\n</body></html>",
    version: 0,
  });
  await sleep(220);
  emit({ type: "html", html, version: 1 });

  emit({
    type: "status",
    role: "critic",
    message: "Checking clarity, hero strength, and mobile…",
  });
  await sleep(300);

  const critique = live
    ? await liveCritique(html, args.prompt, route)
    : mockCritique(html);

  if (live && critique.score < 70 && !args.tweak) {
    emit({
      type: "status",
      role: "builder",
      message: "Tightening the design based on critique…",
    });
    html = await liveBuildWebsite(
      `${context}\n\n### CRITIQUE TO ADDRESS\n${critique.notes.join("\n")}`,
      plan,
      route
    );
    emit({ type: "html", html, version: 2 });
  }

  const artifact: WebsiteArtifact = { kind: "website", html };
  return { artifact, critique: critique.notes, score: critique.score };
}

async function runBuildPhase(args: RunArgs): Promise<{
  project: Project;
  version: number;
}> {
  const { emit } = args;
  let project = await resolveProject(args);

  const plan = args.plan ?? project.pendingPlan;
  if (!plan) {
    throw new Error("No approved plan to build. Create a plan first.");
  }

  const route = routeTask({
    prompt: args.prompt,
    tweak: args.tweak,
    assetCount: project.assets.length,
    domain: plan.domain,
  });

  emit({
    type: "route",
    label: route.spiralLabel,
    mode: route.mode,
    domain: route.domain,
    domainLabel: route.domainLabel,
  });

  const live = hasLiveLlm();
  emit({
    type: "status",
    role: "system",
    message: live
      ? "Building your approved plan with the selected models…"
      : "Building locally (demo engine) — add an API key anytime for live models.",
  });
  await sleep(240);

  const context = buildPromptContext({
    userPrompt: args.prompt,
    tweak: args.tweak,
    currentHtml: args.currentHtml,
    assets: project.assets,
    budgetTokens: 7000,
  });

  const { artifact, critique, score } = await buildArtifact(
    route.domain,
    plan,
    route,
    args,
    context,
    live,
    emit
  );

  const versionNumber = project.versions.length + 1;
  emit({ type: "artifact", artifact, version: versionNumber });

  if (critique) {
    emit({ type: "critique", notes: critique, score: score ?? 80 });
  }

  project.pendingPlan = undefined;
  project = await addVersion(project.id, {
    prompt: args.tweak ? `${args.prompt}\n\nTweak: ${args.tweak}` : args.prompt,
    html: artifact.kind === "website" ? artifact.html : undefined,
    plan: plan.steps,
    planArtifact: plan,
    artifact,
    domain: route.domain,
    critique,
  });
  // addVersion re-reads the project; clear the pending plan durably.
  project.pendingPlan = undefined;
  project = await saveProject(project);

  const version = project.currentVersionIndex + 1;
  emit({ type: "done", projectId: project.id, version, phase: "build" });

  return { project, version };
}
