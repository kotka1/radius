"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aircraftPreviewHtml } from "@/lib/cad/preview";
import { documentToHtml } from "@/lib/markdown";
import type {
  AgentEvent,
  CreationArtifact,
  PlanArtifact,
} from "@/lib/types";
import type { StagedAsset } from "./home-ask";
import { RadiusSpiralSpinner } from "./radius-spiral-spinner";
import styles from "./visual-stage.module.css";

type FeedItem = {
  id: string;
  role: string;
  message: string;
};

type Tab = "plan" | "preview" | "files";

type Props = {
  prompt: string;
  assets: StagedAsset[];
  onReset: () => void;
};

const FILES_BY_KIND: Record<CreationArtifact["kind"], string[]> = {
  website: ["index.html", "README.txt"],
  document: ["document.md", "README.txt"],
  aircraftConcept: [
    "plan.md",
    "requirements.md",
    "parts.json",
    "outsourcing.md",
    "geometry.json",
    "model.stl",
    "model.gltf",
    "README.txt",
  ],
};

export function VisualStage({ prompt, assets, onReset }: Props) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [html, setHtml] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [critique, setCritique] = useState<string[] | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tweakOpen, setTweakOpen] = useState(false);
  const [tweak, setTweak] = useState("");
  const [spiralLabel, setSpiralLabel] = useState("Thinking…");
  const [plan, setPlan] = useState<PlanArtifact | null>(null);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [artifact, setArtifact] = useState<CreationArtifact | null>(null);
  const [domainLabel, setDomainLabel] = useState<string>("");
  const [tab, setTab] = useState<Tab>("plan");
  const started = useRef(false);
  const planRef = useRef<PlanArtifact | null>(null);
  const artifactRef = useRef<CreationArtifact | null>(null);
  const feedEnd = useRef<HTMLDivElement>(null);

  const pushFeed = useCallback((role: string, message: string) => {
    setFeed((prev) => [
      ...prev,
      { id: `${Date.now()}-${prev.length}`, role, message },
    ]);
  }, []);

  const runGenerate = useCallback(
    async (opts?: {
      tweak?: string;
      currentHtml?: string;
      projectId?: string;
      approve?: boolean;
      plan?: PlanArtifact | null;
      artifact?: CreationArtifact | null;
    }) => {
      setBusy(true);
      setError(null);
      setCritique(null);
      setScore(null);
      if (opts?.approve) setAwaitingApproval(false);

      const planPayload =
        opts?.plan ?? planRef.current ?? undefined;
      const artifactPayload =
        opts?.artifact ?? artifactRef.current ?? undefined;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          projectId: opts?.projectId ?? projectId ?? undefined,
          tweak: opts?.tweak,
          currentHtml: opts?.currentHtml,
          approve: opts?.approve ?? false,
          // Always send plan/artifact so the server can rehydrate after
          // serverless cold starts (memory + /tmp do not survive).
          plan: planPayload ?? undefined,
          artifact: artifactPayload ?? undefined,
          assets: opts?.tweak || opts?.approve ? [] : assets,
        }),
      });

      if (!res.ok || !res.body) {
        setBusy(false);
        setError("Could not reach Radius agents.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          try {
            const event = JSON.parse(line.slice(5).trim()) as AgentEvent;
            handleEvent(event);
          } catch {
            /* ignore partial */
          }
        }
      }

      setBusy(false);

      function handleEvent(event: AgentEvent) {
        if (event.type === "route") {
          setSpiralLabel(event.label);
          setDomainLabel(event.domainLabel);
        } else if (event.type === "status") {
          pushFeed(event.role, event.message);
        } else if (event.type === "plan") {
          pushFeed("planner", `Plan: ${event.steps.join(" → ")}`);
        } else if (event.type === "planArtifact") {
          setPlan(event.plan);
          planRef.current = event.plan;
          setTab("plan");
        } else if (event.type === "awaitingApproval") {
          setAwaitingApproval(true);
          setTab("plan");
        } else if (event.type === "html") {
          setHtml(event.html);
          if (event.version >= 1) {
            setHistory((h) => {
              if (h[h.length - 1] === event.html) return h;
              return [...h, event.html];
            });
          }
        } else if (event.type === "artifact") {
          setArtifact(event.artifact);
          artifactRef.current = event.artifact;
          setTab("preview");
        } else if (event.type === "critique") {
          setCritique(event.notes);
          setScore(event.score);
          pushFeed("critic", event.notes[0] ?? "Review complete");
        } else if (event.type === "done") {
          setProjectId(event.projectId);
          if (event.phase === "build") {
            pushFeed("system", "Ready — Keep, undo, or tweak.");
          }
        } else if (event.type === "error") {
          setError(event.message);
          pushFeed("system", event.message);
        }
      }
    },
    [assets, projectId, prompt, pushFeed]
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void runGenerate();
  }, [runGenerate]);

  useEffect(() => {
    feedEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [feed]);

  const previewSrc = useMemo(() => {
    if (!artifact) return "about:blank";
    if (artifact.kind === "website") {
      return `data:text/html;charset=utf-8,${encodeURIComponent(
        html || artifact.html
      )}`;
    }
    if (artifact.kind === "document") {
      return `data:text/html;charset=utf-8,${encodeURIComponent(
        documentToHtml(artifact.title, artifact.markdown)
      )}`;
    }
    return "about:blank";
  }, [artifact, html]);

  const cadSrc = useMemo(() => {
    if (artifact?.kind !== "aircraftConcept") return "about:blank";
    return `data:text/html;charset=utf-8,${encodeURIComponent(
      aircraftPreviewHtml(artifact.geometry)
    )}`;
  }, [artifact]);

  const onUndo = () => {
    setHistory((h) => {
      if (h.length < 2) return h;
      const next = h.slice(0, -1);
      setHtml(next[next.length - 1] ?? "");
      pushFeed("system", "Reverted to the previous version.");
      return next;
    });
  };

  const onKeep = async () => {
    pushFeed("system", "Kept. Share or Export anytime.");
  };

  const onApprove = async () => {
    pushFeed("system", "Approved — building your deliverable…");
    await runGenerate({
      approve: true,
      projectId: projectId ?? undefined,
      currentHtml: html,
      plan: planRef.current,
      artifact: artifactRef.current,
    });
  };

  const onTweakSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = tweak.trim();
    if (!text || busy) return;
    setTweakOpen(false);
    setTweak("");
    pushFeed("system", `Revise: ${text}`);
    setAwaitingApproval(false);
    // Revising re-runs the plan phase with the note (works pre- or post-build).
    // Plan + artifact are sent so the server can rehydrate after cold starts.
    await runGenerate({
      tweak: text,
      currentHtml: html,
      projectId: projectId ?? undefined,
      plan: planRef.current,
      artifact: artifactRef.current,
    });
  };

  const hasBuild = artifact != null;

  return (
    <div className={styles.stage}>
      <header className={styles.top}>
        <button type="button" className={styles.brandBtn} onClick={onReset} title="New creation">
          <Image src="/brand/radius-white.png" alt="Radius" width={140} height={36} />
        </button>
        <p className={styles.prompt} title={prompt}>
          {domainLabel ? `${domainLabel} · ` : ""}
          {prompt}
        </p>
        <div className={styles.topActions}>
          {projectId && hasBuild && (
            <>
              <a className={styles.link} href={`/p/${projectId}`} target="_blank" rel="noreferrer">
                Share
              </a>
              <a className={styles.link} href={`/api/projects/${projectId}/export`}>
                Export
              </a>
            </>
          )}
        </div>
      </header>

      <div className={styles.grid}>
        <aside className={styles.feedPanel}>
          <h2>Agents</h2>
          {busy && (
            <div className={styles.spiralSlot}>
              <RadiusSpiralSpinner label={spiralLabel} size="sm" />
            </div>
          )}
          <ul className={styles.feed}>
            {feed.map((item) => (
              <li key={item.id}>
                <span className={styles.role}>{item.role}</span>
                <span>{item.message}</span>
              </li>
            ))}
            <div ref={feedEnd} />
          </ul>
          {critique && (
            <div className={styles.critique}>
              <strong>Review {score != null ? `· ${score}` : ""}</strong>
              <ul>
                {critique.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {error && <p className={styles.error}>{error}</p>}
        </aside>

        <section className={styles.previewPanel}>
          <div className={styles.previewChrome}>
            <div className={styles.tabs}>
              {(["plan", "preview", "files"] as Tab[]).map((t) => {
                const enabled =
                  t === "plan"
                    ? Boolean(plan)
                    : t === "preview"
                      ? hasBuild
                      : hasBuild;
                return (
                  <button
                    key={t}
                    type="button"
                    className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
                    disabled={!enabled}
                    onClick={() => setTab(t)}
                  >
                    {t === "plan" ? "Plan" : t === "preview" ? "Preview" : "Files"}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.previewBody}>
            {busy && !plan && !hasBuild && (
              <div className={styles.previewWaiting}>
                <RadiusSpiralSpinner label={spiralLabel} size="lg" />
              </div>
            )}

            {tab === "plan" && plan && (
              <PlanCard plan={plan} />
            )}

            {tab === "preview" && (
              <>
                {artifact?.kind === "aircraftConcept" ? (
                  <AircraftView artifact={artifact} cadSrc={cadSrc} />
                ) : hasBuild ? (
                  <iframe
                    title="Preview"
                    className={styles.iframe}
                    src={previewSrc}
                    sandbox="allow-scripts allow-same-origin"
                  />
                ) : (
                  <div className={styles.emptyHint}>
                    Approve the plan to build your deliverable.
                  </div>
                )}
              </>
            )}

            {tab === "files" && (
              <FilesView
                artifact={artifact}
                projectId={projectId}
              />
            )}
          </div>
        </section>
      </div>

      <footer className={styles.actions}>
        {awaitingApproval ? (
          <>
            <button
              type="button"
              className={styles.primary}
              disabled={busy || !plan}
              onClick={() => void onApprove()}
            >
              Approve &amp; build
            </button>
            <button type="button" disabled={busy} onClick={() => setTweakOpen((v) => !v)}>
              Revise plan
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={!hasBuild || busy} onClick={() => void onKeep()}>
              Keep
            </button>
            <button
              type="button"
              disabled={history.length < 2 || busy || artifact?.kind !== "website"}
              onClick={onUndo}
            >
              Undo
            </button>
            <button
              type="button"
              disabled={!hasBuild || busy}
              className={styles.primary}
              onClick={() => setTweakOpen((v) => !v)}
            >
              Tweak
            </button>
          </>
        )}
      </footer>

      {tweakOpen && (
        <form className={styles.tweak} onSubmit={(e) => void onTweakSubmit(e)}>
          <input
            autoFocus
            value={tweak}
            onChange={(e) => setTweak(e.target.value)}
            placeholder={
              awaitingApproval
                ? "Add: 2 seats, ~10m wingspan, electric…"
                : "Make it shorter and warmer…"
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button type="submit" disabled={!tweak.trim() || busy}>
            Apply
          </button>
        </form>
      )}
    </div>
  );
}

function PlanCard({ plan }: { plan: PlanArtifact }) {
  return (
    <div className={styles.planCard}>
      <span className={styles.planKicker}>{planDomainLabel(plan.domain)} plan</span>
      <h3>{plan.title}</h3>
      <p className={styles.planSummary}>{plan.summary}</p>

      <Section title="Steps">
        <ol>
          {plan.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </Section>

      {plan.deliverables.length > 0 && (
        <Section title="You'll get">
          <ul>
            {plan.deliverables.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </Section>
      )}

      {plan.questions.length > 0 && (
        <Section title="A few questions">
          <ul>
            {plan.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </Section>
      )}

      {plan.risks.length > 0 && (
        <Section title="Worth knowing">
          <ul>
            {plan.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Section>
      )}

      {plan.safetyNote && <p className={styles.safetyNote}>{plan.safetyNote}</p>}
    </div>
  );
}

function AircraftView({
  artifact,
  cadSrc,
}: {
  artifact: Extract<CreationArtifact, { kind: "aircraftConcept" }>;
  cadSrc: string;
}) {
  return (
    <div className={styles.aircraft}>
      <div className={styles.aircraftPreview}>
        <iframe
          title="Aircraft concept 3D preview"
          className={styles.iframe}
          src={cadSrc}
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
      <div className={styles.aircraftDetails}>
        <h3>{artifact.title}</h3>
        <p className={styles.planSummary}>{artifact.mission}</p>

        <Section title="Concept brief">
          <ul>
            <li>
              <strong>Size:</strong> {artifact.brief.size}
            </li>
            <li>
              <strong>Payload:</strong> {artifact.brief.payload}
            </li>
            <li>
              <strong>Range:</strong> {artifact.brief.range}
            </li>
            <li>
              <strong>Propulsion:</strong> {artifact.brief.propulsion}
            </li>
            {artifact.brief.crew && (
              <li>
                <strong>Crew:</strong> {artifact.brief.crew}
              </li>
            )}
          </ul>
        </Section>

        <Section title="Requirements">
          <ul>
            {artifact.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Section>

        <Section title="Architecture">
          <ul>
            {artifact.architecture.map((p) => (
              <li key={p.name}>
                <strong>{p.name}:</strong> {p.description}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Outsourcing brief">
          <p className={styles.planSummary}>{artifact.outsourcing.vendorBrief}</p>
          <ul>
            {artifact.outsourcing.questionsForEngineers.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </Section>

        <p className={styles.safetyNote}>{artifact.safetyNote}</p>
      </div>
    </div>
  );
}

function FilesView({
  artifact,
  projectId,
}: {
  artifact: CreationArtifact | null;
  projectId: string | null;
}) {
  if (!artifact) {
    return <div className={styles.emptyHint}>Files appear after your deliverable is built.</div>;
  }
  const files = FILES_BY_KIND[artifact.kind];
  return (
    <div className={styles.files}>
      <h3>Export package</h3>
      <p className={styles.planSummary}>
        Download everything below as a single ZIP.
      </p>
      <ul>
        {files.map((f) => (
          <li key={f}>
            <code>{f}</code>
          </li>
        ))}
      </ul>
      {projectId && (
        <a className={styles.downloadBtn} href={`/api/projects/${projectId}/export`}>
          Download ZIP
        </a>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <span className={styles.sectionTitle}>{title}</span>
      {children}
    </div>
  );
}

function planDomainLabel(domain: PlanArtifact["domain"]): string {
  switch (domain) {
    case "website":
      return "Website";
    case "document":
      return "Document";
    case "cadConcept":
      return "CAD concept";
    case "visualConcept":
      return "Visual concept";
    default:
      return "General";
  }
}
