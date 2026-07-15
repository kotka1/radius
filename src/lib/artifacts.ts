/**
 * Artifact builders + serializers for Radius' general creation domains.
 * Mock builders keep every domain working with no API key; live builders
 * parse LLM JSON and fall back to the mocks on any failure.
 */

import { meshToGltf, meshToStl, normalizeGeometry } from "./cad/aircraft";
import { DEFAULT_AIRCRAFT_GEOMETRY } from "./cad/aircraft";
import type {
  AircraftConceptArtifact,
  CreationArtifact,
  CreationDomain,
  DocumentArtifact,
  PlanArtifact,
} from "./types";

export const AIRCRAFT_SAFETY_NOTE =
  "Conceptual only. Radius helps you organize, model, and package ideas — it does not certify aircraft. Have a licensed aerospace engineer review structural, aerodynamic, and regulatory requirements before any fabrication, flight testing, or final CAD build.";

function titleFromPrompt(prompt: string, fallback: string): string {
  const cleaned = prompt.trim().replace(/\s+/g, " ");
  if (!cleaned) return fallback;
  return cleaned.length <= 60 ? cleaned : `${cleaned.slice(0, 57)}…`;
}

/* ------------------------------- PLAN ---------------------------------- */

export function mockPlanArtifact(
  domain: CreationDomain,
  prompt: string,
  tweak?: string
): PlanArtifact {
  const title = titleFromPrompt(prompt, "Your creation");
  const base: Omit<PlanArtifact, "steps" | "deliverables" | "questions"> = {
    kind: "plan",
    domain,
    title,
    summary: tweak
      ? `Revise the current ${domain} concept: ${tweak.trim().slice(0, 120)}`
      : `A clear path to create "${title}". Approve to build, or revise the plan first.`,
    risks: [
      "Scope may expand once details are clarified",
      "Assumptions below should be confirmed before building",
    ],
  };

  switch (domain) {
    case "cadConcept":
      return {
        ...base,
        summary:
          "A staged aircraft concept: mission brief, requirements, architecture, an outsourcing package, and a conceptual 3D preview you can export.",
        steps: [
          "Define mission, size, payload, range, and propulsion assumptions",
          "Draft a requirements + constraints checklist",
          "Break the aircraft into major subsystems",
          "Generate a conceptual parametric geometry preview",
          "Assemble an outsourcing package for CAD/aerospace review",
        ],
        deliverables: [
          "Aircraft concept brief",
          "Requirements checklist",
          "Architecture / part breakdown",
          "Conceptual 3D preview (STL + glTF)",
          "Outsourcing brief for engineers",
        ],
        questions: [
          "How many people / how much payload should it carry?",
          "Target range and cruise speed?",
          "Electric, combustion, or hybrid propulsion?",
          "Any regulatory category in mind (e.g. ultralight, experimental)?",
        ],
        risks: [
          "This is a concept, not a certified or flight-ready design",
          "Structural, aerodynamic, and safety analysis are out of scope",
        ],
        safetyNote: AIRCRAFT_SAFETY_NOTE,
      };
    case "website":
      return {
        ...base,
        steps: [
          "Understand the audience and the one action that matters",
          "Compose a full-bleed hero with the brand signal first",
          "Add one purpose section and a clear close",
          "Polish typography, motion, and mobile layout",
        ],
        deliverables: ["Single-page website (HTML)", "Exportable ZIP"],
        questions: [
          "Who is this for, and what should they do first?",
          "Any brand colors, fonts, or assets to use?",
        ],
      };
    case "document":
      return {
        ...base,
        steps: [
          "Clarify the document's purpose and reader",
          "Outline the key sections",
          "Draft clear, well-structured prose",
          "Tighten tone and formatting",
        ],
        deliverables: ["Formatted document (Markdown)", "Readable web view"],
        questions: [
          "Who is the intended reader?",
          "Preferred length and tone?",
        ],
      };
    case "visualConcept":
      return {
        ...base,
        steps: [
          "Establish the mood and references",
          "Define palette, type, and motifs",
          "Describe the primary composition",
          "Summarize a usable direction",
        ],
        deliverables: ["Visual direction document", "Concept notes"],
        questions: ["What feeling should it evoke?", "Any brands to echo or avoid?"],
      };
    case "plan":
    default:
      return {
        ...base,
        steps: [
          "Frame the goal and success criteria",
          "Map the major workstreams",
          "Sequence the steps and owners",
          "Note risks and next actions",
        ],
        deliverables: ["Structured plan document", "Checklist of next steps"],
        questions: [
          "What's the deadline or key milestone?",
          "What does success look like?",
        ],
      };
  }
}

export function parsePlanArtifact(
  raw: string,
  domain: CreationDomain,
  prompt: string
): PlanArtifact {
  try {
    const p = JSON.parse(raw) as Partial<PlanArtifact>;
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 8) : [];
    const steps = arr(p.steps);
    if (!steps.length) return mockPlanArtifact(domain, prompt);
    const fallback = mockPlanArtifact(domain, prompt);
    return {
      kind: "plan",
      domain,
      title:
        typeof p.title === "string" && p.title.trim() ? p.title : fallback.title,
      summary:
        typeof p.summary === "string" && p.summary.trim()
          ? p.summary
          : fallback.summary,
      steps,
      questions: arr(p.questions).length ? arr(p.questions) : fallback.questions,
      risks: arr(p.risks).length ? arr(p.risks) : fallback.risks,
      deliverables: arr(p.deliverables).length
        ? arr(p.deliverables)
        : fallback.deliverables,
      safetyNote: domain === "cadConcept" ? AIRCRAFT_SAFETY_NOTE : undefined,
    };
  } catch {
    return mockPlanArtifact(domain, prompt);
  }
}

/* ----------------------------- DOCUMENT -------------------------------- */

export function mockDocumentArtifact(
  prompt: string,
  plan: PlanArtifact
): DocumentArtifact {
  const title = plan.title || titleFromPrompt(prompt, "Untitled document");
  const sections = plan.steps
    .map(
      (s, i) =>
        `## ${i + 1}. ${s}\n\nThis section covers "${s.toLowerCase()}" in the context of ${title.toLowerCase()}. Replace this placeholder with specifics once the direction is confirmed.`
    )
    .join("\n\n");
  const markdown = `# ${title}\n\n${plan.summary}\n\n${sections}\n\n## Next steps\n\n${plan.deliverables
    .map((d) => `- ${d}`)
    .join("\n")}`;
  return { kind: "document", title, markdown };
}

export function parseDocumentArtifact(
  raw: string,
  prompt: string,
  plan: PlanArtifact
): DocumentArtifact {
  const cleaned = raw
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  if (cleaned.length < 40) return mockDocumentArtifact(prompt, plan);
  const heading = cleaned.match(/^#\s+(.+)$/m);
  const title = heading?.[1]?.trim() || plan.title || titleFromPrompt(prompt, "Document");
  return { kind: "document", title, markdown: cleaned };
}

/* ------------------------- AIRCRAFT CONCEPT ---------------------------- */

export function mockAircraftConcept(prompt: string): AircraftConceptArtifact {
  const title = titleFromPrompt(prompt, "Concept aircraft");
  return {
    kind: "aircraftConcept",
    title,
    mission:
      "A light, efficient personal aircraft concept intended for short regional hops. Direction is conceptual and must be validated by a licensed aerospace engineer.",
    brief: {
      size: "~8 m length, ~11 m wingspan (light aircraft class)",
      payload: "1–2 occupants plus light cargo (~200 kg)",
      range: "~300 km target on the assumed propulsion",
      propulsion: "Assumed electric or hybrid — to be confirmed",
      crew: "Single pilot",
    },
    requirements: [
      "Stable, forgiving low-speed handling for the target pilot skill level",
      "Meet the intended regulatory category's weight and stall-speed limits",
      "Fit in a standard hangar / trailer footprint",
      "Use manufacturable, sourceable materials",
      "Provide safe emergency egress",
    ],
    architecture: [
      {
        name: "Fuselage",
        description: "Central body housing cockpit, payload, and systems.",
        material: "Composite or aluminum semi-monocoque (TBD)",
        considerations: ["Occupant safety cell", "Access panels for maintenance"],
      },
      {
        name: "Wing",
        description: "Main lifting surface; carries fuel/battery and control surfaces.",
        material: "Composite spar + skin (TBD)",
        considerations: ["Aspect ratio vs. storage", "Spar load path"],
      },
      {
        name: "Empennage (tail)",
        description: "Horizontal + vertical stabilizers for pitch/yaw stability.",
        considerations: ["Tail volume coefficients", "Control authority"],
      },
      {
        name: "Landing gear",
        description: "Supports ground handling, takeoff, and landing loads.",
        considerations: ["Fixed vs. retractable", "Shock absorption"],
      },
      {
        name: "Propulsion",
        description: "Thrust source and energy storage.",
        considerations: ["Power-to-weight", "Cooling", "Energy density"],
      },
      {
        name: "Cockpit / controls",
        description: "Pilot interface, instrumentation, and flight controls.",
        considerations: ["Visibility", "Ergonomics", "Redundancy"],
      },
    ],
    outsourcing: {
      questionsForEngineers: [
        "Which regulatory category should we target, and what are its hard limits?",
        "Is the assumed propulsion realistic for the target range and payload?",
        "What wing loading and aspect ratio do you recommend?",
        "What structural analysis (FEA) and load cases are required before build?",
      ],
      requiredFiles: [
        "plan.md — concept brief and requirements",
        "parts.json — subsystem breakdown",
        "model.stl / model.gltf — conceptual geometry for reference",
      ],
      vendorBrief:
        "We have an early-stage light-aircraft concept and need a licensed aerospace engineer / CAD vendor to validate feasibility, refine geometry, and produce airworthy CAD and analysis. The attached files are conceptual and not for fabrication.",
      reviewChecklist: [
        "Confirm regulatory category and constraints",
        "Validate aerodynamic assumptions",
        "Validate structural load paths",
        "Confirm propulsion and energy budget",
        "Define next-phase deliverables and cost",
      ],
    },
    geometry: { ...DEFAULT_AIRCRAFT_GEOMETRY },
    safetyNote: AIRCRAFT_SAFETY_NOTE,
  };
}

export function parseAircraftConcept(
  raw: string,
  prompt: string
): AircraftConceptArtifact {
  try {
    const p = JSON.parse(raw) as Partial<AircraftConceptArtifact>;
    const fallback = mockAircraftConcept(prompt);
    const arr = (v: unknown, f: string[]): string[] =>
      Array.isArray(v) && v.length
        ? v.filter((x) => typeof x === "string")
        : f;
    return {
      kind: "aircraftConcept",
      title: typeof p.title === "string" && p.title.trim() ? p.title : fallback.title,
      mission:
        typeof p.mission === "string" && p.mission.trim()
          ? p.mission
          : fallback.mission,
      brief: { ...fallback.brief, ...(p.brief ?? {}) },
      requirements: arr(p.requirements, fallback.requirements),
      architecture:
        Array.isArray(p.architecture) && p.architecture.length
          ? p.architecture
              .filter((a) => a && typeof a.name === "string")
              .map((a) => ({
                name: a.name,
                description: a.description ?? "",
                material: a.material,
                considerations: Array.isArray(a.considerations)
                  ? a.considerations
                  : undefined,
              }))
          : fallback.architecture,
      outsourcing: {
        questionsForEngineers: arr(
          p.outsourcing?.questionsForEngineers,
          fallback.outsourcing.questionsForEngineers
        ),
        requiredFiles: arr(
          p.outsourcing?.requiredFiles,
          fallback.outsourcing.requiredFiles
        ),
        vendorBrief:
          typeof p.outsourcing?.vendorBrief === "string" &&
          p.outsourcing.vendorBrief.trim()
            ? p.outsourcing.vendorBrief
            : fallback.outsourcing.vendorBrief,
        reviewChecklist: arr(
          p.outsourcing?.reviewChecklist,
          fallback.outsourcing.reviewChecklist
        ),
      },
      geometry: normalizeGeometry(p.geometry),
      safetyNote: AIRCRAFT_SAFETY_NOTE,
    };
  } catch {
    return mockAircraftConcept(prompt);
  }
}

/* --------------------------- SERIALIZERS ------------------------------- */

export function aircraftConceptToMarkdown(a: AircraftConceptArtifact): string {
  const parts = a.architecture
    .map(
      (p) =>
        `### ${p.name}\n${p.description}${
          p.material ? `\n\n*Material:* ${p.material}` : ""
        }${
          p.considerations?.length
            ? `\n\n${p.considerations.map((c) => `- ${c}`).join("\n")}`
            : ""
        }`
    )
    .join("\n\n");
  return `# ${a.title}

> ${a.safetyNote}

## Mission
${a.mission}

## Concept brief
- **Size:** ${a.brief.size}
- **Payload:** ${a.brief.payload}
- **Range:** ${a.brief.range}
- **Propulsion:** ${a.brief.propulsion}${a.brief.crew ? `\n- **Crew:** ${a.brief.crew}` : ""}

## Requirements
${a.requirements.map((r) => `- ${r}`).join("\n")}

## Architecture
${parts}

## Outsourcing brief
${a.outsourcing.vendorBrief}

### Questions for engineers
${a.outsourcing.questionsForEngineers.map((q) => `- ${q}`).join("\n")}

### Required files
${a.outsourcing.requiredFiles.map((f) => `- ${f}`).join("\n")}

### Review checklist
${a.outsourcing.reviewChecklist.map((c) => `- [ ] ${c}`).join("\n")}
`;
}

export type ExportFile = { name: string; content: string };

/** Turn any artifact into a set of downloadable files for the export ZIP. */
export function artifactToFiles(artifact: CreationArtifact): ExportFile[] {
  switch (artifact.kind) {
    case "website":
      return [{ name: "index.html", content: artifact.html }];
    case "document":
      return [{ name: "document.md", content: artifact.markdown }];
    case "aircraftConcept": {
      const files: ExportFile[] = [
        { name: "plan.md", content: aircraftConceptToMarkdown(artifact) },
        {
          name: "requirements.md",
          content: `# Requirements\n\n${artifact.requirements
            .map((r) => `- ${r}`)
            .join("\n")}`,
        },
        {
          name: "parts.json",
          content: JSON.stringify(
            { title: artifact.title, architecture: artifact.architecture },
            null,
            2
          ),
        },
        {
          name: "outsourcing.md",
          content: `# Outsourcing brief\n\n${artifact.outsourcing.vendorBrief}\n\n## Questions\n${artifact.outsourcing.questionsForEngineers
            .map((q) => `- ${q}`)
            .join("\n")}\n\n## Review checklist\n${artifact.outsourcing.reviewChecklist
            .map((c) => `- [ ] ${c}`)
            .join("\n")}`,
        },
        { name: "geometry.json", content: JSON.stringify(artifact.geometry, null, 2) },
        { name: "model.stl", content: meshToStl(artifact.geometry) },
        { name: "model.gltf", content: meshToGltf(artifact.geometry) },
      ];
      return files;
    }
  }
}
