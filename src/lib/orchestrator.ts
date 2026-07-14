import { buildPromptContext } from "./context";
import { hasLiveLlm, llmText } from "./llm";
import { mockCritique, mockHtml, mockPlan } from "./mock-generate";
import { addVersion, createProject, getProject, saveProject } from "./persist";
import type { AgentEvent, Project, ProjectAsset } from "./types";

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

async function livePlan(context: string): Promise<string[]> {
  const raw = await llmText({
    role: "planner",
    json: true,
    system:
      "You plan single-page marketing websites for everyday users. Return JSON: {\"steps\": string[]} with 3-5 short plain-English steps. No code.",
    user: context,
  });
  try {
    const parsed = JSON.parse(raw) as { steps?: string[] };
    if (Array.isArray(parsed.steps) && parsed.steps.length) return parsed.steps.slice(0, 6);
  } catch {
    /* fall through */
  }
  return mockPlan(context);
}

async function liveBuild(context: string, plan: string[]): Promise<string> {
  const raw = await llmText({
    role: "builder",
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

async function liveCritique(html: string, prompt: string): Promise<{ notes: string[]; score: number; improvedHtml?: string }> {
  const raw = await llmText({
    role: "critic",
    json: true,
    system: `Critique a landing page for everyday users and brand-first design.
Return JSON: {"notes": string[], "score": number, "needsRevision": boolean, "revisionHint": string}
Score 0-100. Keep notes short and actionable.`,
    user: `Prompt: ${prompt}\n\nHTML:\n${html.slice(0, 24000)}`,
  });
  try {
    const parsed = JSON.parse(raw) as {
      notes?: string[];
      score?: number;
      needsRevision?: boolean;
      revisionHint?: string;
    };
    return {
      notes: parsed.notes?.length ? parsed.notes : ["Looks ready for Keep / Tweak."],
      score: typeof parsed.score === "number" ? parsed.score : 80,
      improvedHtml: undefined,
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

  const live = hasLiveLlm();

  emit({
    type: "status",
    role: "system",
    message: live
      ? "Connecting the best models for this job…"
      : "Building locally (demo engine) — add an API key anytime for live models.",
  });
  await sleep(280);

  emit({ type: "status", role: "planner", message: "Reading your request and sketching the site…" });
  await sleep(420);

  const plan = live
    ? await livePlan(context)
    : mockPlan(args.prompt, args.tweak);

  emit({ type: "plan", steps: plan });
  for (const step of plan) {
    emit({ type: "status", role: "planner", message: step });
    await sleep(220);
  }

  emit({ type: "status", role: "builder", message: "Composing the page into the live preview…" });
  await sleep(360);

  let html = live
    ? await liveBuild(context, plan)
    : mockHtml({
        prompt: args.prompt,
        tweak: args.tweak,
        currentHtml: args.currentHtml,
      });

  // Speculative-style apply: stream a partial then full revision marker for UX
  const mid = Math.floor(html.length * 0.55);
  emit({ type: "html", html: html.slice(0, mid) + "\n<!-- … -->\n</body></html>", version: 0 });
  await sleep(240);
  emit({ type: "html", html, version: 1 });

  emit({ type: "status", role: "critic", message: "Checking clarity, hero strength, and mobile…" });
  await sleep(320);

  const critique = live
    ? await liveCritique(html, args.prompt)
    : mockCritique(html);

  // Optional second build pass if score is low and live models available
  if (live && critique.score < 70 && !args.tweak) {
    emit({
      type: "status",
      role: "builder",
      message: "Tightening the design based on critique…",
    });
    html = await liveBuild(
      `${context}\n\n### CRITIQUE TO ADDRESS\n${critique.notes.join("\n")}`,
      plan
    );
    emit({ type: "html", html, version: 2 });
  }

  emit({ type: "critique", notes: critique.notes, score: critique.score });

  project = await addVersion(project.id, {
    prompt: args.tweak ? `${args.prompt}\n\nTweak: ${args.tweak}` : args.prompt,
    html,
    plan,
    critique: critique.notes,
  });

  const version = project.currentVersionIndex + 1;
  emit({ type: "done", projectId: project.id, version });

  return { project, html, version };
}
