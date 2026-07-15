import Link from "next/link";
import { notFound } from "next/navigation";
import { aircraftConceptToMarkdown } from "@/lib/artifacts";
import { aircraftPreviewHtml } from "@/lib/cad/preview";
import { documentToHtml } from "@/lib/markdown";
import { getProject } from "@/lib/persist";
import type { CreationArtifact } from "@/lib/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function resolveArtifact(html: string | undefined, prompt: string): CreationArtifact {
  if (html) return { kind: "website", html };
  return { kind: "document", title: prompt, markdown: prompt };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project || project.currentVersionIndex < 0) notFound();

  const version = project.versions[project.currentVersionIndex];
  const artifact: CreationArtifact =
    version.artifact ?? resolveArtifact(version.html, project.prompt);

  let src: string;
  if (artifact.kind === "website") {
    src = `data:text/html;charset=utf-8,${encodeURIComponent(artifact.html)}`;
  } else if (artifact.kind === "document") {
    src = `data:text/html;charset=utf-8,${encodeURIComponent(
      documentToHtml(artifact.title, artifact.markdown)
    )}`;
  } else {
    // Aircraft concept: show the conceptual brief as a document, 3D lives in-app.
    src = `data:text/html;charset=utf-8,${encodeURIComponent(
      documentToHtml(artifact.title, aircraftConceptToMarkdown(artifact))
    )}`;
  }

  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <Link href="/" className={styles.brand}>
          RADIUS
        </Link>
        <div className={styles.meta}>
          <h1>{project.title}</h1>
          <p>{project.prompt}</p>
        </div>
        <a className={styles.export} href={`/api/projects/${project.id}/export`}>
          Export
        </a>
      </header>
      {artifact.kind === "aircraftConcept" ? (
        <div className={styles.split}>
          <iframe
            title={`${project.title} — 3D concept`}
            className={styles.frame}
            src={`data:text/html;charset=utf-8,${encodeURIComponent(
              aircraftPreviewHtml(artifact.geometry)
            )}`}
            sandbox="allow-scripts allow-same-origin"
          />
          <iframe
            title={`${project.title} — brief`}
            className={styles.frame}
            src={src}
            sandbox="allow-scripts"
          />
        </div>
      ) : (
        <iframe title={project.title} className={styles.frame} src={src} sandbox="allow-scripts" />
      )}
    </main>
  );
}
