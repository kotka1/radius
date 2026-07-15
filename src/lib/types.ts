export type AgentRole = "planner" | "builder" | "critic" | "system";

export type AgentEvent =
  | { type: "status"; role: AgentRole; message: string }
  | { type: "route"; label: string; mode: "quality" | "speed" | "balanced" }
  | { type: "plan"; steps: string[] }
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
};

export type GenerateRequest = {
  prompt: string;
  projectId?: string;
  /** Tweak instruction for revising current HTML */
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
