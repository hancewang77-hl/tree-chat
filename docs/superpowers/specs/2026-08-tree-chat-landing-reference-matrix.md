# Tree Chat Landing — Reference Matrix

This matrix records implementation principles, not copied visual assets or
brand material. The product brief remains the source of truth for content,
section order, and the tree metaphor.

| Surface | Reference pattern | Applied principle | Deliberately not copied |
| --- | --- | --- | --- |
| Header | Editorial landing pages with transparent-to-solid headers | Keep the brand and one primary CTA available while scroll changes contrast | No third-party logo, label, or exact header styling |
| Progress | Long-form storytelling pages | Show one compact chapter status rather than a clickable mega-menu | No forced page snapping or hidden navigation |
| Hero | Product showcase hero layouts | Pair one dominant statement with a primary “进入功能页” CTA and a secondary exploration CTA | No stock hero image, generic AI orb, or purple gradient |
| Feature copy | Product storytelling callouts | Let short facts appear beside the visual scene, with the full explanation readable without hover | No icon-only explanation or hover-only interaction |
| Responsive layout | Mobile-first editorial grids | Collapse columns, preserve reading order, reduce 3D complexity, and keep CTA targets at least 44px | No horizontal scrolling or desktop canvas squeezed into a phone |
| Mobile CTA and spacing | Compact mobile product headers | Keep the entry CTA fixed in the header, reduce secondary information, and preserve generous edge spacing | No copied bottom bar, app-store badge, or proprietary mobile navigation |
| Mobile information folding | Responsive feature showcases | Stack facts in reading order and simplify the canopy model below 900px without hiding core copy | No hover-only cards, carousels, or collapsed copy required to understand the product |
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
