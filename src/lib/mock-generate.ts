/**
 * High-quality mock site generator for when no API keys are configured.
 * Proves the Visual Stage end-to-end without external LLMs.
 */

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function brandFromPrompt(prompt: string): { name: string; tagline: string; hue: number } {
  const words = prompt.trim().split(/\s+/).filter(Boolean);
  const name =
    words
      .find((w) => /^[A-Z][a-z]+/.test(w) && w.length > 2) ||
    words[0]?.replace(/[^a-zA-Z0-9]/g, "") ||
    "Radius";
  const tagline =
    prompt.length > 80 ? `${prompt.slice(0, 77)}…` : prompt || "Built with Radius";
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) hash = (hash * 31 + prompt.charCodeAt(i)) >>> 0;
  return { name: name.slice(0, 24), tagline, hue: hash % 360 };
}

export function mockPlan(prompt: string, tweak?: string): string[] {
  const base = [
    "Understand what the site should feel like",
    "Compose a full-bleed hero with the brand signal first",
    "Add one purpose section and a clear close",
    "Polish typography, motion, and mobile layout",
  ];
  if (tweak?.trim()) {
    return [
      `Apply tweak: ${tweak.trim().slice(0, 80)}`,
      "Preserve what already works",
      "Refresh the live preview",
    ];
  }
  if (/shop|store|buy/i.test(prompt)) {
    return [
      "Frame a product-led hero",
      "Show the offer without card clutter",
      "Add a simple purchase path",
      "Check mobile readability",
    ];
  }
  return base;
}

export function mockCritique(html: string): { notes: string[]; score: number } {
  const notes: string[] = [];
  let score = 78;
  if (!/<h1/i.test(html)) {
    notes.push("Add a stronger primary headline in the hero.");
    score -= 8;
  }
  if (!/viewport/i.test(html)) {
    notes.push("Ensure a mobile viewport meta tag.");
    score -= 5;
  }
  if ((html.match(/button|cta|href/gi) || []).length < 2) {
    notes.push("Make the call to action more obvious.");
    score -= 4;
  }
  if (notes.length === 0) {
    notes.push("Hero reads as one composition. Mobile stack looks solid.");
    notes.push("Keep / Undo / Tweak available if you want another pass.");
    score = 88;
  }
  return { notes, score: Math.max(55, Math.min(95, score)) };
}

export function mockHtml(args: {
  prompt: string;
  tweak?: string;
  currentHtml?: string;
}): string {
  if (args.tweak && args.currentHtml) {
    // Light revision: inject a visible note bar so the stage clearly updated
    const note = escapeHtml(args.tweak);
    if (args.currentHtml.includes("data-radius-tweak")) {
      return args.currentHtml.replace(
        /data-radius-tweak="[^"]*"/,
        `data-radius-tweak="${note}"`
      ).replace(
        /<!-- radius-tweak:[\s\S]*?-->/,
        `<!-- radius-tweak: ${note} -->`
      );
    }
    return args.currentHtml.replace(
      /<body([^>]*)>/i,
      `<body$1><!-- radius-tweak: ${note} --><div data-radius-tweak="${note}" style="position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;padding:12px 16px;border-radius:12px;background:rgba(10,10,12,.88);color:#f4f4f6;font:500 13px/1.4 system-ui;backdrop-filter:blur(8px);border:1px solid rgba(201,165,74,.35)">Updated: ${note}</div>`
    );
  }

  const brand = brandFromPrompt(args.prompt);
  const name = escapeHtml(brand.name);
  const tagline = escapeHtml(brand.tagline);
  const hue = brand.hue;
  const accent = `hsl(${hue} 42% 52%)`;
  const accentSoft = `hsl(${hue} 35% 18%)`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<style>
  :root {
    --bg: #071018;
    --fg: #f3f1ea;
    --muted: #a8b0bc;
    --accent: ${accent};
    --accent-soft: ${accentSoft};
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    font-family: "Outfit", system-ui, sans-serif;
    color: var(--fg);
    background: var(--bg);
    line-height: 1.5;
  }
  .hero {
    min-height: 100vh;
    display: grid;
    align-content: end;
    padding: clamp(24px, 5vw, 64px);
    position: relative;
    overflow: hidden;
    background:
      radial-gradient(1200px 600px at 70% 10%, var(--accent-soft), transparent 55%),
      linear-gradient(160deg, #0a1520 0%, #071018 45%, #12100c 100%),
      url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E");
  }
  .hero::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(7,16,24,.92) 10%, transparent 55%);
    pointer-events: none;
  }
  .brand {
    position: relative;
    z-index: 1;
    font-size: .75rem;
    letter-spacing: .28em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 18px;
    opacity: 0;
    animation: rise .9s .1s ease forwards;
  }
  h1 {
    position: relative;
    z-index: 1;
    font-family: "Fraunces", Georgia, serif;
    font-weight: 560;
    font-size: clamp(2.6rem, 8vw, 5.4rem);
    line-height: 1.02;
    max-width: 11ch;
    letter-spacing: -.03em;
    opacity: 0;
    animation: rise 1s .2s ease forwards;
  }
  .lede {
    position: relative;
    z-index: 1;
    margin-top: 22px;
    max-width: 36ch;
    color: var(--muted);
    font-weight: 300;
    font-size: 1.125rem;
    opacity: 0;
    animation: rise 1s .35s ease forwards;
  }
  .cta {
    position: relative;
    z-index: 1;
    margin-top: 36px;
    display: inline-flex;
    gap: 12px;
    opacity: 0;
    animation: rise 1s .5s ease forwards;
  }
  .cta a {
    text-decoration: none;
    color: #081018;
    background: var(--fg);
    padding: 14px 22px;
    border-radius: 999px;
    font-weight: 500;
    font-size: .95rem;
  }
  .cta a.ghost {
    color: var(--fg);
    background: transparent;
    border: 1px solid rgba(243,241,234,.28);
  }
  section {
    padding: clamp(64px, 10vw, 120px) clamp(24px, 5vw, 64px);
    max-width: 1100px;
    margin: 0 auto;
  }
  section h2 {
    font-family: "Fraunces", Georgia, serif;
    font-size: clamp(1.8rem, 4vw, 2.8rem);
    letter-spacing: -.02em;
    margin-bottom: 16px;
  }
  section p { color: var(--muted); max-width: 52ch; font-size: 1.05rem; }
  .close {
    text-align: left;
    border-top: 1px solid rgba(243,241,234,.1);
  }
  .close a {
    display: inline-block;
    margin-top: 28px;
    color: var(--bg);
    background: var(--accent);
    text-decoration: none;
    padding: 14px 24px;
    border-radius: 999px;
    font-weight: 500;
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(18px); }
    to { opacity: 1; transform: none; }
  }
  @media (max-width: 640px) {
    h1 { max-width: 100%; }
  }
</style>
</head>
<body>
  <header class="hero">
    <div class="brand">${name}</div>
    <h1>${name}</h1>
    <p class="lede">${tagline}</p>
    <div class="cta">
      <a href="#start">Get started</a>
      <a class="ghost" href="#about">Learn more</a>
    </div>
  </header>
  <section id="about">
    <h2>Made for how you actually work</h2>
    <p>${escapeHtml(
      args.prompt.slice(0, 280) ||
        "A clear first impression, one strong story, and a path forward — generated so you can watch it take shape."
    )}</p>
  </section>
  <section class="close" id="start">
    <h2>Ready when you are</h2>
    <p>One composition. One clear next step. Nothing extra in the first viewport.</p>
    <a href="mailto:hello@example.com">Say hello</a>
  </section>
</body>
</html>`;
}
