export type AgentRole = "planner" | "builder" | "critic" | "system";

/**
 * Creation domains the Router can classify a request into.
 * Kept invisible to end users — surfaced only as Spiral copy.
 */
export type CreationDomain =
  | "website"
  | "plan"
  | "document"
  | "visualConcept"
  | "cadConcept";

export type RouterMode = "quality" | "speed" | "balanced";

/** Deliverable types Radius can build after a plan is approved. */
export type ArtifactKind = "website" | "document" | "plan" | "aircraftConcept";

/**
 * Structured plan produced before any deliverable is built.
 * This is the ChatGPT-style plan card the user approves or revises.
 */
export type PlanArtifact = {
  kind: "plan";
  domain: CreationDomain;
  title: string;
  summary: string;
  steps: string[];
  questions: string[];
  risks: string[];
  deliverables: string[];
  /** Non-certification / safety note for regulated (e.g. aircraft) work. */
  safetyNote?: string;
};

export type WebsiteArtifact = {
  kind: "website";
  html: string;
};

export type DocumentArtifact = {
  kind: "document";
  title: string;
  /** Markdown body rendered in the Visual Stage. */
  markdown: string;
};

export type AircraftPart = {
  name: string;
  description: string;
  material?: string;
  considerations?: string[];
};

/**
 * Approximate, conceptual parametric geometry (metres).
 * Deterministic code turns this into a preview + STL/glTF exports.
 * NOT airworthy or manufacturing-valid geometry.
 */
export type AircraftGeometrySpec = {
  units: "m";
  fuselageLength: number;
  fuselageRadius: number;
  noseLength: number;
  tailLength: number;
  wingSpan: number;
  wingChord: number;
  wingSweepDeg: number;
  wingDihedralDeg: number;
  tailSpan: number;
  tailChord: number;
  finHeight: number;
};

export type AircraftConceptArtifact = {
  kind: "aircraftConcept";
  title: string;
  mission: string;
  brief: {
    size: string;
    payload: string;
    range: string;
    propulsion: string;
    crew?: string;
  };
  requirements: string[];
  architecture: AircraftPart[];
  outsourcing: {
    questionsForEngineers: string[];
    requiredFiles: string[];
    vendorBrief: string;
    reviewChecklist: string[];
  };
  geometry: AircraftGeometrySpec;
  safetyNote: string;
};

export type CreationArtifact =
  | WebsiteArtifact
  | DocumentArtifact
  | AircraftConceptArtifact;

export type AgentEvent =
  | { type: "status"; role: AgentRole; message: string }
  | {
      type: "route";
      label: string;
      mode: RouterMode;
      domain: CreationDomain;
      domainLabel: string;
    }
  | { type: "plan"; steps: string[] }
  | { type: "planArtifact"; plan: PlanArtifact }
  | { type: "awaitingApproval"; plan: PlanArtifact }
  | { type: "html"; html: string; version: number }
  | { type: "artifact"; artifact: CreationArtifact; version: number }
  | { type: "critique"; notes: string[]; score: number }
  | {
      type: "done";
      projectId: string;
      version: number;
      phase: "plan" | "build";
    }
  | { type: "error"; message: string };

export type ProjectAsset = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** Relative path under data/uploads or data URL for small images */
  path: string;
  kind: "logo" | "image" | "brief" | "other";
  textExcerpt?: string;
  priority: number;
};

export type ProjectVersion = {
  id: string;
  createdAt: string;
  prompt: string;
  /** Website HTML (kept for websites + legacy projects). */
  html?: string;
  plan: string[];
  /** Structured plan the user approved before this build. */
  planArtifact?: PlanArtifact;
  /** The built deliverable (website / document / aircraft concept). */
  artifact?: CreationArtifact;
  domain?: CreationDomain;
  critique?: string[];
};

export type Project = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  prompt: string;
  assets: ProjectAsset[];
  versions: ProjectVersion[];
  /** Index into versions; current kept version */
  currentVersionIndex: number;
  /** Plan awaiting approval before the next build. */
  pendingPlan?: PlanArtifact;
};

export type GenerateRequest = {
  prompt: string;
  projectId?: string;
  /** Which phase to run: plan first, then build after approval. */
  action?: "plan" | "build";
  /** Approved plan passed back on build (survives cold starts). */
  plan?: PlanArtifact;
  /** Tweak instruction for revising the current deliverable */
  tweak?: string;
  /** Existing HTML to revise (undo target or current) */
  currentHtml?: string;
  assets?: Array<{
    name: string;
    mimeType: string;
    /** base64 without data: prefix when possible */
    dataBase64?: string;
    text?: string;
    kind?: ProjectAsset["kind"];
  }>;
};
