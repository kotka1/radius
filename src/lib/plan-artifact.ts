import type { CreationDomain, PlanArtifact } from "./types";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render a plan / document as a polished HTML preview page */
export function planToHtml(plan: PlanArtifact): string {
  const steps = plan.steps
    .map((s, i) => `<li><strong>${i + 1}.</strong> ${escapeHtml(s)}</li>`)
    .join("");
  const questions = plan.questions
    .map((q) => `<li>${escapeHtml(q)}</li>`)
    .join("");
  const risks = plan.risks.map((r) => `<li>${escapeHtml(r)}</li>`).join("");
  const deliverables = plan.deliverables
    .map((d) => `<li>${escapeHtml(d)}</li>`)
    .join("");

  const body = plan.markdown
    .split(/\n{2,}/)
    .map((block) => {
      const t = block.trim();
      if (!t) return "";
      if (t.startsWith("# ")) {
        return `<h1>${escapeHtml(t.slice(2))}</h1>`;
      }
      if (t.startsWith("## ")) {
        return `<h2>${escapeHtml(t.slice(3))}</h2>`;
      }
      if (t.startsWith("- ")) {
        const items = t
          .split("\n")
          .map((line) => line.replace(/^- /, "").trim())
          .filter(Boolean)
          .map((line) => `<li>${escapeHtml(line)}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${escapeHtml(t)}</p>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(plan.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<style>
  :root { --bg:#090b10; --fg:#f3f1ea; --muted:#a8b0bc; --gold:#c9a54a; --line:rgba(243,241,234,.12); }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:"Outfit",system-ui,sans-serif; background:radial-gradient(900px 500px at 80% 0%, rgba(201,165,74,.12), transparent 55%), var(--bg); color:var(--fg); line-height:1.55; padding:clamp(24px,5vw,56px); }
  .badge { display:inline-block; font-size:.72rem; letter-spacing:.16em; text-transform:uppercase; color:var(--gold); margin-bottom:14px; }
  h1 { font-family:"Fraunces",Georgia,serif; font-size:clamp(1.8rem,4vw,2.8rem); letter-spacing:-.02em; max-width:18ch; margin-bottom:12px; }
  .summary { color:var(--muted); max-width:52ch; margin-bottom:28px; font-size:1.05rem; }
  h2 { font-family:"Fraunces",Georgia,serif; font-size:1.25rem; margin:28px 0 10px; }
  ul { padding-left:1.2rem; color:var(--muted); max-width:60ch; }
  li { margin:6px 0; }
  .note { margin-top:36px; padding:16px 18px; border:1px solid var(--line); border-radius:14px; color:var(--muted); font-size:.92rem; max-width:60ch; }
  .note strong { color:var(--gold); }
  p { color:var(--muted); max-width:60ch; margin:10px 0; }
</style>
</head>
<body>
  <div class="badge">Radius plan · ${escapeHtml(plan.domain)}</div>
  <h1>${escapeHtml(plan.title)}</h1>
  <p class="summary">${escapeHtml(plan.summary)}</p>
  ${body}
  <h2>Suggested path</h2>
  <ul>${steps}</ul>
  <h2>Questions to answer next</h2>
  <ul>${questions || "<li>None yet — approve to continue.</li>"}</ul>
  <h2>Risks & boundaries</h2>
  <ul>${risks}</ul>
  <h2>Deliverables after you approve</h2>
  <ul>${deliverables}</ul>
  <div class="note"><strong>Not certified engineering.</strong> Radius helps you plan, model concepts, and package work for specialists. Aircraft and regulated builds need licensed professional review before fabrication or flight.</div>
</body>
</html>`;
}

export function mockPlanArtifact(
  prompt: string,
  domain: CreationDomain
): PlanArtifact {
  if (domain === "cadConcept") {
    return {
      title: "Aircraft concept package",
      summary:
        "A plan-first path to a concept CAD package your brother can review, iterate, and eventually hand to a specialist for real drawings.",
      domain,
      steps: [
        "Clarify mission: sport / trainer / experimental, seats, range, cruise speed",
        "Define constraints: budget band, build method (kit / CNC / composite), workshop limits",
        "Draft architecture: fuselage, wing, empennage, landing gear, propulsion, controls",
        "Produce concept geometry + parts tree for outsourcing discussion",
        "Package vendor brief, file list, and review checklist",
      ],
      questions: [
        "Manned or UAV? How many seats?",
        "Approximate wingspan and max takeoff weight target?",
        "Engine preference (piston / electric / undecided)?",
        "Is this a learning concept, a kit path, or a custom experimental build?",
      ],
      risks: [
        "AI geometry is conceptual — not flightworthy without engineering analysis",
        "Structural loads, flutter, and certification are outside Radius v1",
        "STEP/STL exports need professional CAD review before CNC or composite molds",
      ],
      deliverables: [
        "Concept brief + requirements checklist",
        "Systems / parts breakdown",
        "Outsourcing vendor brief",
        "Later: parametric 3D concept preview + STEP/STL package",
      ],
      markdown: `## Intent
${prompt}

## What Radius will do
Help you turn “build an aeroplane” into a serious, shareable concept package: mission assumptions, architecture, parts, and a handoff brief for CAD / aerospace specialists.

## What Radius will not do yet
Certify airworthiness, replace a structural engineer, or produce flight-ready manufacturing drawings alone.`,
    };
  }

  return {
    title: "Creation plan",
    summary: `A clear plan for: ${prompt.slice(0, 120)}`,
    domain,
    steps: [
      "Understand the goal and constraints",
      "Propose the best deliverable shape",
      "List open questions before building",
      "Build only after you approve",
    ],
    questions: ["What does success look like?", "Any hard constraints (time, budget, tools)?"],
    risks: ["Building too early can waste a pass — plan first keeps Radius focused."],
    deliverables: ["Approved plan", "First deliverable draft", "Keep / Undo / Tweak loop"],
    markdown: `## Intent\n${prompt}\n\n## Approach\nPlan first, then build the right artifact — website, document, visual, or technical concept.`,
  };
}

export function mockCadConceptHtml(prompt: string, plan: PlanArtifact): string {
  return planToHtml({
    ...plan,
    title: "Aircraft concept — approved build",
    summary:
      "First deliverable package: requirements, architecture, parts tree, and outsourcing brief. Conceptual only.",
    markdown: `## Mission brief
Request: ${prompt}

## Architecture (concept)
- Fuselage: primary structure, cabin/cockpit volume, systems routing
- Wing: planform, span estimate, spars/ribs concept, attachment
- Empennage: horizontal + vertical stabilizer sizing assumptions
- Landing gear: tricycle vs taildragger — TBD from your answers
- Propulsion: mount, fuel/battery volume, cooling/airflow notes
- Controls: surfaces, linkages, cockpit interface

## Parts tree (starter)
1. Fuselage assembly
2. Left / right wing
3. Horizontal stabilizer
4. Vertical stabilizer + rudder
5. Landing gear set
6. Propulsion mount
7. Control surfaces kit

## Outsourcing brief
Ask a CAD partner for: watertight STEP assemblies, named parts, material callouts TBD, and a revision table. Provide this Radius package as the starting brief.

## Next with Radius
Answer the planning questions → refine dimensions → generate parametric concept geometry → export preview files.`,
  });
}
