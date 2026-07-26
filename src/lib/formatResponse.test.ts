import { describe, expect, test } from "vitest";
import { renderMarkdownToHTML, stripMarkdown, summarizeForCard } from "./formatResponse";

describe("response formatting", () => {
  test("summarizeForCard prefers compact semantic keywords before sentence fallback", () => {
    const response = "## 核心结论\n\n**期权定价** 是 金融模型。布莱克斯科尔斯模型用于估值。";

    const summary = summarizeForCard(response, 40);

    expect(summary).toContain("期权定价");
    expect(summary).not.toContain("用于估值");
  });

  test("summarizeForCard falls back to the first plain sentence", () => {
    expect(summarizeForCard("这是一个没有关键词的完整句子。第二句不该出现。", 40)).toBe(
      "这是一个没有关键词的完整句子",
    );
  });

  test("stripMarkdown replaces heavy artifacts and keeps readable text", () => {
    const plain = stripMarkdown(
      "# 标题\n\n```ts\nconst x = 1\n```\n\n公式 $$x^2$$ 和 `code`，![图](a.png)，[链接](https://x.test)",
    );

    expect(plain).toContain("标题");
    expect(plain).toContain("[代码块]");
    expect(plain).toContain("[公式]");
    expect(plain).toContain("code");
    expect(plain).toContain("[图片]");
    expect(plain).toContain("链接");
    expect(plain).not.toContain("https://x.test");
  });

  test("renderMarkdownToHTML escapes user HTML while rendering markdown affordances", () => {
    const html = renderMarkdownToHTML(
      "# 标题\n\n<script>alert(1)</script>\n\n- **重点**\n\n`<tag>`\n\n$$x^2$$",
    );

    expect(html).toContain("<h1");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("<strong>重点</strong>");
    expect(html).toContain("&lt;tag&gt;");
    expect(html).toContain("katex");
  });

  test("renderMarkdownToHTML escapes malformed code fences that Stage 2 does not render (XSS guard)", () => {
    // Single-line fence: no newline after the marker, so it is never turned
    // into a <pre> block. It must still be HTML-escaped, not passed through raw.
    const single = renderMarkdownToHTML("```<img src=x onerror=alert(1)>```");
    expect(single).not.toContain("<img");
    expect(single).toContain("&lt;img");

    // Non-word info string (`c++`) also never matches the Stage 2 fence regex.
    const weirdLang = renderMarkdownToHTML("```c++\n<svg onload=alert(1)>\n```");
    expect(weirdLang).not.toContain("<svg");
    expect(weirdLang).toContain("&lt;svg");

    // A well-formed fenced block still renders as <pre><code> unchanged.
    const valid = renderMarkdownToHTML("```ts\nconst x = 1;\n```");
    expect(valid).toContain("<pre");
    expect(valid).toContain("const x = 1;");
  });
});
