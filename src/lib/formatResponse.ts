import katex from "katex";

/**
 * Extract a keyword-dense card summary from an AI response.
 * Prioritizes extracted key terms over full sentences — no regurgitation.
 */
export function summarizeForCard(response: string, maxLen: number = 140): string {
  if (!response) return "";

  const keywords: string[] = [];

  // 1. Extract bold terms **...**
  const boldRegex = /\*\*(.+?)\*\*/g;
  let bm: RegExpExecArray | null;
  while ((bm = boldRegex.exec(response)) !== null) {
    const t = bm[1].trim();
    if (t.length >= 2 && t.length <= 24 && !keywords.includes(t)) {
      keywords.push(t);
    }
  }

  // 2. Extract headings ## Heading / ### Heading
  const headRegex = /^#{2,4}\s+(.+)$/gm;
  let hm: RegExpExecArray | null;
  while ((hm = headRegex.exec(response)) !== null) {
    const t = hm[1].trim();
    if (t.length >= 2 && t.length <= 30 && !keywords.includes(t)) {
      keywords.push(t);
    }
  }

  // 3. Extract definition-like patterns: "X是Y" / "X：Y" / "X refers to Y"
  const defRegex = /([一-鿿\w]{2,18})(?:指的是|是指|是|：|:)\s*([一-鿿\w]{2,18})/g;
  let dm: RegExpExecArray | null;
  while ((dm = defRegex.exec(response)) !== null) {
    const short = dm[1].length + dm[2].length < 16
      ? `${dm[1]}:${dm[2]}`
      : dm[1];
    if (short.length >= 3 && short.length <= 26 && !keywords.includes(short)) {
      keywords.push(short);
    }
  }

  // 4. Extract standalone important terms: 术语-like patterns
  const termRegex = /(?:期权|模型|定理|公式|方程|理论|定律|原理|算法|协议|架构|框架|方法|策略|函数|变量|指数|系数|因子)/g;
  let tm: RegExpExecArray | null;
  while ((tm = termRegex.exec(response)) !== null) {
    // Find the surrounding word (up to 10 chars before/after)
    const pos = tm.index;
    const before = response.substring(Math.max(0, pos - 10), pos);
    const after = response.substring(pos, Math.min(response.length, pos + 12));
    const context = (before + after).replace(/[*#\n]/g, "").trim();
    if (context.length >= 2 && context.length <= 28 && !keywords.includes(context)) {
      keywords.push(context);
    }
  }

  // Clean keywords: remove math artifacts and formula-only entries
  const clean = [...new Set(keywords)]
    .map((k) => k.replace(/^\$[^$]+\$$/, "").trim()) // strip pure math $...$
    .filter((k) => {
      if (k.length < 2 || k.length > 28) return false;
      // Skip raw formula fragments
      if (/^[_\^\\{}()[\]]+$/.test(k)) return false;
      if (/^\$.*\$$/.test(k)) return false; // still has $ → math-only
      return true;
    });

  // Prefer medium-length (4-16 chars) — most informative
  clean.sort((a, b) => {
    const sa = a.length >= 4 && a.length <= 16 ? 0 : 1;
    const sb = b.length >= 4 && b.length <= 16 ? 0 : 1;
    return sa - sb;
  });

  // Pack into maxLen, cap at 6 keywords for density
  if (clean.length > 0) {
    let result = "";
    for (let i = 0; i < Math.min(clean.length, 6); i++) {
      const candidate = result ? result + " · " + clean[i] : clean[i];
      if (candidate.length > maxLen) break;
      result = candidate;
    }
    if (result) return result;
  }

  // Fallback: first complete sentence only (not sentences)
  const plain = stripMarkdown(response);
  const firstSentence = plain.split(/[。！？.!?\n]/)[0]?.trim();
  if (firstSentence && firstSentence.length > 4) {
    if (firstSentence.length <= maxLen) return firstSentence;
    return firstSentence.substring(0, maxLen - 1).trim() + "…";
  }

  return plain.substring(0, maxLen).trim();
}

/**
 * Strip markdown to plain text suitable for Canvas2D rendering.
 * Math, code blocks, and images get replaced with short labels.
 *
 * Stage ordering invariants:
 * - Code fences are labeled first so `$`, `*`, `[` inside code can never
 *   match later math/emphasis/link stages.
 * - Display math $$...$$ must run before inline $...$ so a `$$` pair is not
 *   consumed as two inline delimiters.
 * - Images run before links because `![..](..)` contains a link-shaped tail.
 * - Bracket labels use [^\]] so a bare bracketed segment with no URL (e.g. a
 *   `[公式]` label emitted by an earlier stage) is never swallowed into a
 *   later link/image match.
 */
export function stripMarkdown(text: string): string {
  let out = text;

  // Stage 1 — heavy blocks → short labels
  out = out.replace(/```[\s\S]*?```/g, "[代码块]"); // fenced code blocks
  out = out.replace(/\$\$[\s\S]*?\$\$/g, "[公式]"); // display math $$...$$
  out = out.replace(/\$(.+?)\$/g, "[公式]"); // inline math $...$
  out = out.replace(/!\[[^\]\n]*\]\(.*?\)/g, "[图片]"); // images

  // Stage 2 — links: drop URL, keep text
  out = out.replace(/\[([^\]\n]+)\]\(.*?\)/g, "$1");

  // Stage 3 — inline emphasis: drop markers, keep text
  out = out.replace(/\*\*(.+?)\*\*/g, "$1");
  out = out.replace(/\*(.+?)\*/g, "$1");
  out = out.replace(/__(.+?)__/g, "$1");
  out = out.replace(/_(.+?)_/g, "$1");

  // Stage 4 — line-level markers
  out = out.replace(/^#{1,6}\s+/gm, ""); // headings
  out = out.replace(/^[\s]*[-*+]\s+/gm, "• "); // unordered list markers
  out = out.replace(/^\d+\.\s+/gm, ""); // ordered list markers
  out = out.replace(/^>\s?/gm, ""); // blockquote markers

  // Stage 5 — remaining inline code backticks
  out = out.replace(/`(.+?)`/g, "$1");

  // Stage 6 — cleanup: rules, blank runs, raw HTML tags
  out = out.replace(/^[-*_]{3,}\s*$/gm, "");
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(/<[^>]*>/g, "");

  return out.trim();
}

/**
 * Convert markdown to simple HTML for the inspector sidebar.
 * Supports: paragraphs, bold, italic, inline code, fenced code blocks,
 * inline math ($...$), display math ($$...$$), unordered lists, headings.
 *
 * Stage ordering invariants:
 * - Entity escaping runs first, with code/math bodies placeholder-protected
 *   so they reach their dedicated renderers verbatim (they escape their own
 *   content or delegate to KaTeX).
 * - Code fences must be replaced before math, and math before inline code,
 *   so `$` inside a fence or backticks inside math are never re-parsed.
 * - Bold (**) must run before italic (*) so a `**` pair is not consumed as
 *   two italic delimiters.
 * - Block-level stages (headings, lists, quotes, rules) run after inline
 *   stages; the paragraph split is last and skips already-HTML blocks.
 */
export function renderMarkdownToHTML(text: string): string {
  if (!text) return "";

  // Stage 1 — escape & < > everywhere except inside code blocks and math
  let html = escapeHTMLPreserving(text);

  // Stage 2 — fenced code blocks ```lang\n...\n``` → <pre><code>...</code></pre>.
  // The body is already entity-escaped by escapeHTMLPreserving (see its
  // SECURITY INVARIANT), so it must NOT be escaped again here.
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    return `<pre class="bg-[#F0EBE0] rounded-lg p-3 my-2 overflow-x-auto text-[12px] leading-relaxed" style="font-family:var(--font-mono)"><code>${code.trim()}</code></pre>`;
  });

  // Stage 3 — display math $$...$$ (before inline $ so `$$` is one block)
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_m, math) => {
    return `<div class="my-2 rounded-lg px-3 py-2 text-[13px] text-center overflow-x-auto" style="background:rgba(116,122,85,0.08);color:var(--accent-bark);font-family:var(--font-serif)">${renderMath(math.trim(), true)}</div>`;
  });

  // Stage 4 — inline math $...$
  html = html.replace(/\$(.+?)\$/g, (_m, math) => {
    return `<span class="px-0.5 rounded" style="background:rgba(116,122,85,0.06);color:var(--accent-bark);font-family:var(--font-serif)">${renderMath(math.trim(), false)}</span>`;
  });

  // Stage 5 — inline code `...`. Body already entity-escaped in Stage 1.
  html = html.replace(/`(.+?)`/g, (_m, code) => {
    return `<code class="rounded px-1 py-0.5 text-[12px]" style="background:var(--border-warm);color:var(--accent-bark);font-family:var(--font-mono)">${code}</code>`;
  });

  // Stage 6 — bold **...** / __...__ (must precede italic)
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");

  // Stage 7 — italic *...* / _..._ (but not inside words)
  html = html.replace(/\b\*(.+?)\*\b/g, "<em>$1</em>");
  html = html.replace(/\b_(.+?)_\b/g, "<em>$1</em>");

  // Stage 8 — headings
  html = html.replace(/^#### (.+)$/gm, '<h4 class="text-[13px] font-semibold mt-3 mb-1" style="color:var(--accent-bark)">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-[14px] font-semibold mt-3 mb-1" style="color:var(--accent-bark)">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-[15px] font-semibold mt-3 mb-1" style="color:var(--accent-bark);font-family:var(--font-serif)">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-[16px] font-semibold mt-3 mb-1" style="color:var(--accent-bark);font-family:var(--font-serif)">$1</h1>');

  // Stage 9 — unordered lists: collect consecutive list items
  html = html.replace(/((?:^[\s]*[-*+]\s+.+(?:\n|$))+)/gm, (match) => {
    const items = match
      .split(/\n/)
      .filter((line) => /^[\s]*[-*+]\s+/.test(line))
      .map((line) => `<li class="text-[13px] ml-4 list-disc" style="color:var(--text-charcoal)">${line.replace(/^[\s]*[-*+]\s+/, "")}</li>`)
      .join("");
    return `<ul class="my-1">${items}</ul>`;
  });

  // Stage 10 — ordered lists
  html = html.replace(/((?:^\d+\.\s+.+(?:\n|$))+)/gm, (match) => {
    const items = match
      .split(/\n/)
      .filter((line) => /^\d+\.\s+/.test(line))
      .map((line) => `<li class="text-[13px] ml-4 list-decimal" style="color:var(--text-charcoal)">${line.replace(/^\d+\.\s+/, "")}</li>`)
      .join("");
    return `<ol class="my-1">${items}</ol>`;
  });

  // Stage 11 — blockquotes
  html = html.replace(/^>\s?(.+)$/gm, '<blockquote class="border-l-2 pl-3 my-1 text-[13px] italic" style="border-color:var(--accent-sage);color:var(--text-muted)">$1</blockquote>');

  // Stage 12 — horizontal rules
  html = html.replace(/^[-*_]{3,}\s*$/gm, '<hr class="my-2" style="border-color:var(--border-warm)">');

  // Stage 13 — paragraph split on double newlines (must be last)
  html = html
    .split(/\n\n+/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      // Skip blocks that already contain HTML tags
      if (/^<(pre|ul|ol|h[1-4]|blockquote|hr|div)/.test(trimmed)) return trimmed;
      // Wrap plain text in paragraph
      const withBreaks = trimmed.replace(/\n/g, "<br>");
      return `<p class="text-[13px] leading-relaxed" style="color:var(--text-charcoal)">${withBreaks}</p>`;
    })
    .filter(Boolean)
    .join("\n");

  return html;
}

function escapeHTMLEntities(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHTMLPreserving(text: string): string {
  // We escape text but skip content inside ```code```, $$math$$, $math$, and
  // `inline code`. Placeholders use \x00 sentinels, which cannot occur in the
  // source text, so restoration is exact.
  //
  // SECURITY INVARIANT: code bodies (fenced and inline) are entity-escaped HERE,
  // at protection time, not in the render stages. A later stage's regex can pair
  // delimiters differently than the protection regex did (e.g. a single-line
  // ```<img onerror=…>``` or the inline-code lazy match on ```<x>```), which
  // previously left raw HTML between the rendered <code> spans and reached
  // dangerouslySetInnerHTML unescaped. Escaping at protection guarantees no raw
  // < > survives regardless of how the render regexes match. Math is left
  // verbatim on purpose: KaTeX escapes its own input (trust:false). Because the
  // bodies are pre-escaped, Stage 2 and Stage 5 must NOT escape again.
  const protectedBlocks: string[] = [];
  const protect = (block: string) => {
    protectedBlocks.push(block);
    return `\x00PROTECT${protectedBlocks.length - 1}\x00`;
  };

  let result = text
    .replace(/```[\s\S]*?```/g, (m) => protect(escapeHTMLEntities(m)))
    .replace(/\$\$[\s\S]*?\$\$/g, (m) => protect(m))
    .replace(/\$.+?\$/g, (m) => protect(m))
    .replace(/`[^`]+`/g, (m) => protect(escapeHTMLEntities(m)));

  result = escapeHTMLEntities(result);

  // Restore protected blocks
  result = result.replace(/\x00PROTECT(\d+)\x00/g, (_m, i) => protectedBlocks[+i]);

  return result;
}

function renderMath(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    // Fallback: escape HTML and keep as-is
    return latex
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
