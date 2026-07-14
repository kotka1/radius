import { NextRequest, NextResponse } from "next/server";
import { getProject, listProjects, setCurrentVersion } from "@/lib/persist";

export const runtime = "nodejs";

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      title: p.title,
      updatedAt: p.updatedAt,
      versions: p.versions.length,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const id = String(body.id ?? "");
  const index = Number(body.currentVersionIndex);
  if (!id || Number.isNaN(index)) {
    return NextResponse.json({ error: "id and currentVersionIndex required" }, { status: 400 });
  }
  try {
    const project = await setCurrentVersion(id, index);
    return NextResponse.json({ project });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 }
    );
  }
}

export async function POST(req: NextRequest) {
  // fetch single project details via body id (also have /[id])
  const body = await req.json();
  const id = String(body.id ?? "");
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ project });
}
