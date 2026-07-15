import { promises as fs } from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import type { Project, ProjectAsset, ProjectVersion } from "./types";

/**
 * Vercel/serverless: /var/task is read-only (EROFS).
 * Use /tmp + in-memory store so Generate works in production demos.
 * Local: still writes under ./data for durable shares.
 */

type Store = {
  projects: Map<string, Project>;
  uploads: Map<string, Buffer>;
};

function getStore(): Store {
  const g = globalThis as typeof globalThis & { __radiusStore?: Store };
  if (!g.__radiusStore) {
    g.__radiusStore = {
      projects: new Map(),
      uploads: new Map(),
    };
  }
  return g.__radiusStore;
}

function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function dataRoot(): string {
  if (isServerless()) {
    return path.join("/tmp", "radius-data");
  }
  return path.join(process.cwd(), "data");
}

function projectsDir(): string {
  return path.join(dataRoot(), "projects");
}

function uploadsDir(): string {
  return path.join(dataRoot(), "uploads");
}

async function ensureDirs() {
  await fs.mkdir(projectsDir(), { recursive: true });
  await fs.mkdir(uploadsDir(), { recursive: true });
}

function projectPath(id: string) {
  return path.join(projectsDir(), `${id}.json`);
}

async function writeProjectDisk(project: Project): Promise<void> {
  try {
    await ensureDirs();
    await fs.writeFile(projectPath(project.id), JSON.stringify(project, null, 2));
  } catch (err) {
    // Serverless /tmp full or unexpected FS error — memory still holds the project
    if (!isServerless()) throw err;
  }
}

export async function listProjects(): Promise<Project[]> {
  const store = getStore();
  const fromMemory = [...store.projects.values()];

  try {
    await ensureDirs();
    const files = await fs.readdir(projectsDir());
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const id = file.replace(/\.json$/, "");
      if (store.projects.has(id)) continue;
      try {
        const raw = await fs.readFile(path.join(projectsDir(), file), "utf8");
        const project = JSON.parse(raw) as Project;
        store.projects.set(project.id, project);
        fromMemory.push(project);
      } catch {
        /* skip corrupt */
      }
    }
  } catch {
    /* no disk */
  }

  return [...store.projects.values()].sort(
    (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)
  );
}

export async function getProject(id: string): Promise<Project | null> {
  const store = getStore();
  const cached = store.projects.get(id);
  if (cached) return cached;

  try {
    const raw = await fs.readFile(projectPath(id), "utf8");
    const project = JSON.parse(raw) as Project;
    store.projects.set(project.id, project);
    return project;
  } catch {
    return null;
  }
}

export async function saveProject(project: Project): Promise<Project> {
  project.updatedAt = new Date().toISOString();
  getStore().projects.set(project.id, project);
  await writeProjectDisk(project);
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
    domain: version.domain,
    planArtifact: version.planArtifact,
    artifact: version.artifact,
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
  const id = uuid();
  const safe = args.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const rel = path.join(args.projectId, `${id}-${safe}`);
  const store = getStore();
  store.uploads.set(rel, args.buffer);

  try {
    await ensureDirs();
    const abs = path.join(uploadsDir(), rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, args.buffer);
  } catch (err) {
    if (!isServerless()) throw err;
  }

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
  return path.join(uploadsDir(), relative);
}

export async function readUpload(relative: string): Promise<Buffer> {
  const mem = getStore().uploads.get(relative);
  if (mem) return mem;
  return fs.readFile(uploadAbsPath(relative));
}
