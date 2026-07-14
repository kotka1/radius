"use client";

import { useState } from "react";
import { HomeAsk, type StagedAsset } from "@/components/home-ask";
import { VisualStage } from "@/components/visual-stage";

export default function HomePage() {
  const [session, setSession] = useState<{
    prompt: string;
    assets: StagedAsset[];
  } | null>(null);

  if (!session) {
    return (
      <HomeAsk
        onStart={(prompt, assets) => setSession({ prompt, assets })}
      />
    );
  }

  return (
    <VisualStage
      key={session.prompt + session.assets.map((a) => a.name).join()}
      prompt={session.prompt}
      assets={session.assets}
      onReset={() => setSession(null)}
    />
  );
}
