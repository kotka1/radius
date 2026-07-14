import { NextResponse } from "next/server";
import { listProjects, readUpload } from "@/lib/persist";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const projects = await listProjects();
  for (const project of projects) {
    const asset = project.assets.find((a) => a.id === id);
    if (!asset || !asset.path) continue;
    try {
      const buffer = await readUpload(asset.path);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": asset.mimeType,
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch {
      return NextResponse.json({ error: "File missing" }, { status: 404 });
    }
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
