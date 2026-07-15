import { NextResponse } from "next/server";
import JSZip from "jszip";
import { artifactToFiles } from "@/lib/artifacts";
import { getProject } from "@/lib/persist";
import type { CreationArtifact } from "@/lib/types";

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
  // Prefer the structured artifact; fall back to legacy html-only versions.
  const artifact: CreationArtifact =
    version.artifact ??
    (version.html
      ? { kind: "website", html: version.html }
      : { kind: "document", title: project.title, markdown: project.prompt });

  const zip = new JSZip();
  for (const file of artifactToFiles(artifact)) {
    zip.file(file.name, file.content);
  }
  zip.file(
    "README.txt",
    `Radius export\nProject: ${project.title}\nType: ${artifact.kind}\nPrompt: ${project.prompt}\nExported: ${new Date().toISOString()}\n${
      artifact.kind === "aircraftConcept"
        ? "\nNOTE: Conceptual only. Not a certified or airworthy design. Have a licensed aerospace engineer review before any fabrication or flight.\n"
        : ""
    }`
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="radius-${id.slice(0, 8)}.zip"`,
    },
  });
}
