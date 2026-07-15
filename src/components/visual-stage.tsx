"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/types";
import type { StagedAsset } from "./home-ask";
import { RadiusSpiralSpinner } from "./radius-spiral-spinner";
import styles from "./visual-stage.module.css";

type FeedItem = {
  id: string;
  role: string;
  message: string;
};

type Props = {
  prompt: string;
  assets: StagedAsset[];
  onReset: () => void;
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
  const started = useRef(false);
  const feedEnd = useRef<HTMLDivElement>(null);

  const pushFeed = useCallback((role: string, message: string) => {
    setFeed((prev) => [
      ...prev,
      { id: `${Date.now()}-${prev.length}`, role, message },
    ]);
  }, []);

  const runGenerate = useCallback(
    async (opts?: { tweak?: string; currentHtml?: string; projectId?: string }) => {
      setBusy(true);
      setError(null);
      setCritique(null);
      setScore(null);

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          projectId: opts?.projectId ?? projectId ?? undefined,
          tweak: opts?.tweak,
          currentHtml: opts?.currentHtml,
          assets: opts?.tweak ? [] : assets,
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
        } else if (event.type === "status") {
          pushFeed(event.role, event.message);
        } else if (event.type === "plan") {
          pushFeed("planner", `Plan: ${event.steps.join(" → ")}`);
        } else if (event.type === "html") {
          setHtml(event.html);
          if (event.version >= 1) {
            setHistory((h) => {
              if (h[h.length - 1] === event.html) return h;
              return [...h, event.html];
            });
          }
        } else if (event.type === "critique") {
          setCritique(event.notes);
          setScore(event.score);
          pushFeed("critic", event.notes[0] ?? "Review complete");
        } else if (event.type === "done") {
          setProjectId(event.projectId);
          pushFeed("system", "Ready — Keep it, undo, or tweak.");
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
    if (!html) return "about:blank";
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  }, [html]);

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
    pushFeed("system", "Kept. Your site is saved — Share or Export anytime.");
    // Version already persisted on generation; Keep is the affirmation + RL signal hook.
  };

  const onTweakSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = tweak.trim();
    if (!text || busy) return;
    setTweakOpen(false);
    setTweak("");
    pushFeed("system", `Tweak: ${text}`);
    await runGenerate({
      tweak: text,
      currentHtml: html,
      projectId: projectId ?? undefined,
    });
  };

  return (
    <div className={styles.stage}>
      <header className={styles.top}>
        <button type="button" className={styles.brandBtn} onClick={onReset} title="New site">
          <Image src="/brand/radius-white.png" alt="Radius" width={140} height={36} />
        </button>
        <p className={styles.prompt} title={prompt}>
          {prompt}
        </p>
        <div className={styles.topActions}>
          {projectId && (
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
            <span />
            <span />
            <span />
            <em>Live preview</em>
          </div>
          <div className={styles.previewBody}>
            {busy && !html && (
              <div className={styles.previewWaiting}>
                <RadiusSpiralSpinner label={spiralLabel} size="lg" />
              </div>
            )}
            <iframe
              title="Live preview"
              className={styles.iframe}
              src={previewSrc}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </section>
      </div>

      <footer className={styles.actions}>
        <button type="button" disabled={!html || busy} onClick={() => void onKeep()}>
          Keep
        </button>
        <button type="button" disabled={history.length < 2 || busy} onClick={onUndo}>
          Undo
        </button>
        <button
          type="button"
          disabled={!html || busy}
          className={styles.primary}
          onClick={() => setTweakOpen((v) => !v)}
        >
          Tweak
        </button>
      </footer>

      {tweakOpen && (
        <form className={styles.tweak} onSubmit={(e) => void onTweakSubmit(e)}>
          <input
            autoFocus
            value={tweak}
            onChange={(e) => setTweak(e.target.value)}
            placeholder="Make the hero darker and shorter…"
          />
          <button type="submit" disabled={!tweak.trim() || busy}>
            Apply
          </button>
        </form>
      )}
    </div>
  );
}
