export type AgentRole = "planner" | "builder" | "critic" | "system";

export type CreationDomain =
  | "website"
  | "plan"
  | "document"
  | "visual"
  | "cadConcept";

export type RouterMode = "quality" | "speed" | "balanced";

export type PlanArtifact = {
  title: string;
  summary: string;
  steps: string[];
  questions: string[];
  risks: string[];
  deliverables: string[];
  domain: CreationDomain;
  /** Full markdown body for the plan card / preview */
  markdown: string;
};

export type AgentEvent =
  | { type: "status"; role: AgentRole; message: string }
  | {
      type: "route";
      label: string;
      mode: RouterMode;
      domain: CreationDomain;
    }
  | { type: "plan"; steps: string[] }
  | { type: "planArtifact"; plan: PlanArtifact }
  | { type: "awaitingApproval"; projectId: string }
  | { type: "html"; html: string; version: number }
  | { type: "critique"; notes: string[]; score: number }
  | { type: "done"; projectId: string; version: number }
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
  html: string;
  plan: string[];
  critique?: string[];
  domain?: CreationDomain;
  planArtifact?: PlanArtifact;
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
  pendingPlan?: PlanArtifact;
};

export type GenerateRequest = {
  prompt: string;
  projectId?: string;
  /** Tweak instruction for revising current HTML */
  tweak?: string;
  /** Existing HTML to revise (undo target or current) */
  currentHtml?: string;
  /** After planning: user approved — build deliverables */
  approve?: boolean;
  assets?: Array<{
    name: string;
    mimeType: string;
    /** base64 without data: prefix when possible */
    dataBase64?: string;
    text?: string;
    kind?: ProjectAsset["kind"];
  }>;
};
