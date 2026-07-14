import { promises as fs } from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import type { Project, ProjectAsset, ProjectVersion } from "./types";

const ROOT = path.join(process.cwd(), "data");
const PROJECTS = path.join(ROOT, "projects");
const UPLOADS = path.join(ROOT, "uploads");

async function ensureDirs() {
  await fs.mkdir(PROJECTS, { recursive: true });
  await fs.mkdir(UPLOADS, { recursive: true });
}

function projectPath(id: string) {
  return path.join(PROJECTS, `${id}.json`);
}

export async function listProjects(): Promise<Project[]> {
  await ensureDirs();
  const files = await fs.readdir(PROJECTS);
  const projects: Project[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await fs.readFile(path.join(PROJECTS, file), "utf8");
    projects.push(JSON.parse(raw) as Project);
  }
  return projects.sort(
    (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)
  );
}

export async function getProject(id: string): Promise<Project | null> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(projectPath(id), "utf8");
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

export async function saveProject(project: Project): Promise<Project> {
  await ensureDirs();
  project.updatedAt = new Date().toISOString();
  await fs.writeFile(projectPath(project.id), JSON.stringify(project, null, 2));
  return project;
}

export async function createProject(args: {
  prompt: string;
  title?: string;
  assets?: ProjectAsset[];
}): Promise<Project> {
  const now = new Date().toISOString();
  const project: Project = {
    id: uuid(),
    title: args.title ?? deriveTitle(args.prompt),
    createdAt: now,
    updatedAt: now,
    prompt: args.prompt,
    assets: args.assets ?? [],
    versions: [],
    currentVersionIndex: -1,
  };
  return saveProject(project);
}

export function deriveTitle(prompt: string): string {
  const cleaned = prompt.trim().replace(/\s+/g, " ");
  if (cleaned.length <= 48) return cleaned || "Untitled site";
  return `${cleaned.slice(0, 45)}…`;
}

export async function addVersion(
  projectId: string,
  version: Omit<ProjectVersion, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  }
): Promise<Project> {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");
  const entry: ProjectVersion = {
    id: version.id ?? uuid(),
    createdAt: version.createdAt ?? new Date().toISOString(),
    prompt: version.prompt,
    html: version.html,
    plan: version.plan,
    critique: version.critique,
  };
  project.versions.push(entry);
  project.currentVersionIndex = project.versions.length - 1;
  return saveProject(project);
}

export async function setCurrentVersion(
  projectId: string,
  index: number
): Promise<Project> {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");
  if (index < 0 || index >= project.versions.length) {
    throw new Error("Invalid version index");
  }
  project.currentVersionIndex = index;
  return saveProject(project);
}

export async function saveUpload(args: {
  projectId: string;
  name: string;
  mimeType: string;
  buffer: Buffer;
  kind: ProjectAsset["kind"];
  priority: number;
  textExcerpt?: string;
}): Promise<ProjectAsset> {
  await ensureDirs();
  const id = uuid();
  const safe = args.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const rel = path.join(args.projectId, `${id}-${safe}`);
  const abs = path.join(UPLOADS, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, args.buffer);
  return {
    id,
    name: args.name,
    mimeType: args.mimeType,
    size: args.buffer.length,
    path: rel,
    kind: args.kind,
    textExcerpt: args.textExcerpt,
    priority: args.priority,
  };
}

export function uploadAbsPath(relative: string) {
  return path.join(UPLOADS, relative);
}

export async function readUpload(relative: string): Promise<Buffer> {
  return fs.readFile(uploadAbsPath(relative));
}
