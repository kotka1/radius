import { NextRequest } from "next/server";
import {
  defaultPriority,
  inferAssetKind,
} from "@/lib/context";
import { runOrchestrator } from "@/lib/orchestrator";
import { createProject, saveProject, saveUpload } from "@/lib/persist";
import type { AgentEvent, ProjectAsset } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(event: AgentEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) {
    return new Response(JSON.stringify({ error: "Prompt required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let projectId = body.projectId ? String(body.projectId) : undefined;
  const tweak = body.tweak ? String(body.tweak) : undefined;
  const currentHtml = body.currentHtml ? String(body.currentHtml) : undefined;
  const approve = Boolean(body.approve);
  // Approve → build the deliverable; anything else (including revise) → (re)plan.
  const action: "plan" | "build" = approve ? "build" : "plan";
  const plan =
    body.plan && typeof body.plan === "object" ? body.plan : undefined;
  const incoming = Array.isArray(body.assets) ? body.assets : [];

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit = (event: AgentEvent) => {
        controller.enqueue(enc.encode(sse(event)));
      };

      try {
        if (!projectId) {
          const created = await createProject({ prompt, assets: [] });
          projectId = created.id;
        }

        const assets: ProjectAsset[] = [];

        for (const raw of incoming) {
          const name = String(raw.name ?? "file");
          const mimeType = String(raw.mimeType ?? "application/octet-stream");
          const kind = raw.kind ?? inferAssetKind(name, mimeType);
          const priority = defaultPriority(kind);
          let textExcerpt: string | undefined = raw.text
            ? String(raw.text).slice(0, 8000)
            : undefined;

          if (raw.dataBase64) {
            const buffer = Buffer.from(String(raw.dataBase64), "base64");
            if (
              !textExcerpt &&
              (mimeType.startsWith("text/") ||
                name.endsWith(".md") ||
                name.endsWith(".txt"))
            ) {
              textExcerpt = buffer.toString("utf8").slice(0, 8000);
            }
            const asset = await saveUpload({
              projectId: projectId!,
              name,
              mimeType,
              buffer,
              kind,
              priority,
              textExcerpt,
            });
            assets.push(asset);
          } else if (textExcerpt) {
            const { v4: uuid } = await import("uuid");
            assets.push({
              id: uuid(),
              name,
              mimeType,
              size: textExcerpt.length,
              path: "",
              kind,
              textExcerpt,
              priority,
            });
          }
        }

        if (assets.length) {
          const { getProject } = await import("@/lib/persist");
          const project = await getProject(projectId!);
          if (project) {
            project.assets = [...project.assets, ...assets];
            await saveProject(project);
          }
        }

        await runOrchestrator({
          prompt,
          projectId,
          action,
          plan,
          tweak,
          currentHtml,
          assets: [],
          emit,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Generation failed";
        emit({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
