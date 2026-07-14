import { NextResponse } from "next/server";
import JSZip from "jszip";
import { getProject } from "@/lib/persist";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const project = await getProject(id);
  if (!project || project.currentVersionIndex < 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const version = project.versions[project.currentVersionIndex];
  const zip = new JSZip();
  zip.file("index.html", version.html);
  zip.file(
    "README.txt",
    `Radius export\nProject: ${project.title}\nPrompt: ${project.prompt}\nExported: ${new Date().toISOString()}\n`
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="radius-${id.slice(0, 8)}.zip"`,
    },
  });
}
