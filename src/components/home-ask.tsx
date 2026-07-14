"use client";

import Image from "next/image";
import styles from "./home-ask.module.css";

export type StagedAsset = {
  name: string;
  mimeType: string;
  dataBase64?: string;
  text?: string;
  kind?: "logo" | "image" | "brief" | "other";
};

type Props = {
  onStart: (prompt: string, assets: StagedAsset[]) => void;
};

async function fileToAsset(file: File): Promise<StagedAsset> {
  const mimeType = file.type || "application/octet-stream";
  if (
    mimeType.startsWith("text/") ||
    file.name.endsWith(".md") ||
    file.name.endsWith(".txt")
  ) {
    const text = await file.text();
    return { name: file.name, mimeType, text, kind: "brief" };
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const dataBase64 = btoa(binary);
  const kind = /logo/i.test(file.name) ? "logo" : mimeType.startsWith("image/") ? "image" : "other";
  return { name: file.name, mimeType, dataBase64, kind };
}

export function HomeAsk({ onStart }: Props) {
  return (
    <main className={styles.shell}>
      <div className={styles.glow} aria-hidden />
      <header className={styles.brand}>
        <Image
          src="/brand/radius-white.png"
          alt="Radius"
          width={280}
          height={72}
          priority
          className={styles.logo}
        />
      </header>

      <h1 className={styles.headline}>What website do you want?</h1>
      <p className={styles.sub}>
        Say it plainly. Watch agents build it live. Keep, undo, or tweak — nothing else to learn.
      </p>

      <AskForm
        onSubmit={async (prompt, files) => {
          const assets = await Promise.all(files.map(fileToAsset));
          onStart(prompt, assets);
        }}
      />
    </main>
  );
}

function AskForm({
  onSubmit,
}: {
  onSubmit: (prompt: string, files: File[]) => void | Promise<void>;
}) {
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const prompt = String(fd.get("prompt") ?? "").trim();
        const list = fd.getAll("files").filter((v): v is File => v instanceof File && v.size > 0);
        if (!prompt) return;
        void onSubmit(prompt, list);
      }}
    >
      <textarea
        name="prompt"
        className={styles.input}
        placeholder="A calm landing page for a ceramic studio in Helsinki…"
        rows={3}
        autoFocus
        required
      />
      <div className={styles.row}>
        <label className={styles.attach}>
          <input name="files" type="file" multiple accept="image/*,.pdf,.txt,.md" />
          <span>Add logo, photo, or brief</span>
        </label>
        <button type="submit" className={styles.go}>
          Build it
        </button>
      </div>
    </form>
  );
}
