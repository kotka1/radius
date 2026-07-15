/**
 * Minimal, dependency-free Markdown → HTML renderer.
 * Escapes first, then applies a small, safe subset (headings, bold, italic,
 * inline code, links, ordered/unordered lists, paragraphs). Enough to render
 * document and plan artifacts in the Visual Stage without pulling in a parser.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(text: string): string {
  return text
    .replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
    )
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

/** Render trusted-ish markdown (already escaped) into a small HTML subset. */
export function renderMarkdown(md: string): string {
  const lines = escapeHtml(md).split(/\r?\n/);
  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }

  closeList();
  return out.join("\n");
}

/** Wrap rendered markdown in a self-contained, styled HTML document. */
export function documentToHtml(title: string, markdown: string): string {
  const body = renderMarkdown(markdown);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Outfit", system-ui, sans-serif;
    color: #16181d;
    background: #f6f5f2;
    line-height: 1.6;
  }
  .doc { max-width: 760px; margin: 0 auto; padding: clamp(28px, 6vw, 72px) clamp(20px, 5vw, 40px); }
  h1, h2, h3, h4 { font-family: "Fraunces", Georgia, serif; line-height: 1.15; letter-spacing: -0.01em; }
  h1 { font-size: clamp(2rem, 5vw, 3rem); margin: 0 0 0.4em; }
  h2 { font-size: 1.6rem; margin: 1.6em 0 0.4em; }
  h3 { font-size: 1.25rem; margin: 1.4em 0 0.3em; }
  p { margin: 0 0 1em; }
  ul, ol { margin: 0 0 1em; padding-left: 1.4em; }
  li { margin: 0.25em 0; }
  code { background: #eceae4; padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.9em; }
  strong { font-weight: 600; }
  a { color: #8a6d2f; }
</style>
</head>
<body>
  <article class="doc">
    ${body}
  </article>
</body>
</html>`;
}
