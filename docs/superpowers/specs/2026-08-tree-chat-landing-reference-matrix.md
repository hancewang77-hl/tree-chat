# Tree Chat Landing — Reference Matrix

This matrix records implementation principles, not copied visual assets or
brand material. The product brief remains the source of truth for content,
section order, and the tree metaphor.

## External quality lenses

The review also used the public guidance from [Taste Skill](https://github.com/Leonxlnx/taste-skill)
(`design-taste-frontend`, v2 experimental) and [Impeccable](https://github.com/pbakaus/impeccable)
(Skill 4.0.4; CLI package 3.5.0 at the reviewed upstream revision). These are
heuristics, not additional product requirements: the Plan and the explicit
1920×1080 scope win whenever a rule conflicts with the brief.

| Lens | Adopted for this landing | Intentionally waived or bounded |
| --- | --- | --- |
| Taste Skill | Audit the existing IA before redesigning; fix typography, spacing, hierarchy, and overflow before adding effects; keep a single palette/token vocabulary; give every motion a narrative or state reason; use refs for continuous scroll and keep a fresh screenshot preflight | Its mobile-first branches, anti-centered-hero preference, and blanket ban on chapter labels do not apply to this brief; the SVG branch mark and R3F tree remain documented concept assets until final art review |
| Impeccable | Treat the page as a Persuade/landing surface with one dominant focus per frame; prefer proximity and hairline structure over nested cards; check contrast, focus, ARIA, browser surfaces, reduced motion, and rendered evidence; avoid bounce/elastic and generic repeated reveal motion | Responsive/adapt and multi-viewport checks are a deliberate scope waiver for this review build; Plan-backed paper texture, chapter wayfinding, and large centered hero type are retained |

| Surface | Reference pattern | Applied principle | Deliberately not copied |
| --- | --- | --- | --- |
| Header | Editorial landing pages with transparent-to-solid headers | Keep the brand and one primary CTA available while scroll changes contrast | No third-party logo, label, or exact header styling |
| Progress | Long-form storytelling pages | Show one compact chapter status rather than a clickable mega-menu | No forced page snapping or hidden navigation |
| Hero | Product showcase hero layouts | Pair one dominant statement with a primary “进入功能页” CTA and a secondary exploration CTA | No stock hero image, generic AI orb, or purple gradient |
| Feature copy | Product storytelling callouts | Let short facts appear beside the visual scene, with the full explanation readable without hover | No icon-only explanation or hover-only interaction |
| Desktop review canvas | 1920×1080 editorial composition | Keep each landing chapter on a fixed 1080px canvas, with chapter-specific tree, mask, copy, and fact positions | No mobile/tablet breakpoint branches, squeezed desktop canvas, or horizontal overflow |
| Page 3 tree topology | Root-to-branch-to-leaf diagram | Use three explicit levels: one question root, two branch nodes, and four answer leaves; every edge is a one-way parent-child link | No shared terminal node, branch rejoin, ancestor return, or visual ring/cycle |
| Accessibility fallback | Reduced-motion and resilient document flow | Preserve keyboard focus, ARIA labels, no-script copy, and a static tree when WebGL is unavailable | No interaction that is required only on a specific device class |
| Footer | Open-source product footers | Show only verified repository and MIT License facts | No invented team, registration, contact, or usage metrics |

## Motion reference

- `animejs` 4.5.0 is used for Landing DOM/SVG choreography. The package
  exports used by this implementation were smoke-tested locally, the exact
  version is locked in both manifests, and an authorized query to the npm
  registry confirmed that `4.5.0` is currently published under the `latest`
  dist-tag at implementation time.
- R3F remains the only owner of the 3D render loop and camera interpolation.
- The landing page uses transform/opacity-based motion and a reduced-motion
  fallback; no animation blocks reading or navigation.

## Asset note

The LOGO image referenced by the source Markdown was not present beside the
document. The current implementation therefore contains an original,
replaceable inline SVG concept. It is not presented as the final brand asset.
The hex values, material treatment, and camera timings in this implementation
remain provisional tokens until the planned ImageGen keyframe review can be
performed with an available image-generation tool.
