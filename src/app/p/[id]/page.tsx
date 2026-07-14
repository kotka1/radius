import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/persist";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project || project.currentVersionIndex < 0) notFound();

  const version = project.versions[project.currentVersionIndex];
  const src = `data:text/html;charset=utf-8,${encodeURIComponent(version.html)}`;

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
          Export ZIP
        </a>
      </header>
      <iframe title={project.title} className={styles.frame} src={src} sandbox="allow-scripts" />
    </main>
  );
}
