# Tree Chat Page 4–9 Scene and Prospect Design

**Status:** Approved by the user on 2026-08-09

## Goal

Keep the accepted mature-tree asset and page-snap presentation while making Page 4–8 transitions responsive, synchronizing each camera composition with its copy, freeing Page 9 from snap trapping, and replacing the limitation narrative with an application-prospect story grounded in the competition design document.

## Interaction architecture

The browser has one snap owner. Pages 1–8 use native CSS scroll snapping; the JavaScript nearest-page smooth-scroll fallback is removed. When Page 9 approaches the viewport, a root class disables snapping so the final section can grow naturally and the bottom workbench CTA remains reachable at both 1920×1080 and shorter desktop viewports.

Page 4–8 continue to reuse one sticky Canvas and one tree. A pure scroll-state helper derives both continuous camera progress and the discrete copy chapter from the actual document offsets of the five scene stops. Camera and copy therefore share one coordinate system instead of mixing fixed 1080px stops with `storyHeight - innerHeight`.

The WebGL scene renders on demand. LandingPage updates a render-request ref only after it has updated the shared progress ref. The tree no longer performs perpetual idle sway, the camera does not add a second lagging interpolation layer, dynamic shadows are removed, and DPR is capped at 1.25. The tree geometry and approved visual asset remain unchanged.

## Page 4–8 composition and copy

| Page | Camera composition | Copy |
|---|---|---|
| 4 | Complete centered tree | **让复杂思考长成一棵树** — parent/child paths preserve depth, sibling branches preserve comparison, and the structure supports exploration followed by organization. |
| 5 | Branch close-up in the left two-fifths; low-risk editorial rail retained | **每一根枝条，都是可继续的思路** — Branch, Graft, Prune, and Leaf. |
| 6 | Bole close-up on the right | **让规划成为主线，让历史保留年轮** — Auxo and Rings. |
| 7 | Root close-up in the lower quarter with a softened trunk trace on the right | **让资料扎根，让成果被收获** — Nutrient and Harvest. |
| 8 | Top-down canopy with the feature orbit | **从局部回答，回到全局知识地图** — recap the complete Tree Chat workflow. |

Copy changes only when the scroll position reaches the matching real scene stop. During travel, the current chapter remains readable while the camera moves toward the next composition.

## Page 9 application prospect

The chapter label and kicker become “应用前景 / Prospect”. The limitation cards and all negative wording about API keys, browser-only storage, and cross-device sync are removed from the landing page.

The headline is:

> 让每一次提问都有位置，让每一次探索都有路径

Four prospect cards tell the competition story without claiming unimplemented deployment:

1. **深度学习** — organize definitions, derivations, examples, misconceptions, and personal notes into a reusable learning path.
2. **研究与方案** — connect source material, questions, comparisons, project branches, and exported outcomes.
3. **公共治理** — use the documented flood evacuation and resettlement scenario to explain structured emergency-plan exploration and review.
4. **负责任智能** — move AI from answer generation toward cognitive-path organization while preserving human judgment, traceable exploration, and digital literacy.

A concise case line may mention the flood-response planning and Heimlich-maneuver learning demonstrations. Multi-agent collaboration, cross-device teamwork, and multimodal retrieval remain future vision and must not be stated as current production capabilities.

## Accessibility and reduced motion

The current semantic headings, navigation status, focus behavior, and reduced-motion behavior remain. Reduced motion uses direct camera placement and native non-smooth scrolling. Page 9 remains part of the nine-chapter navigation even though it is not a snap target while the tail is active.

## Acceptance criteria

- Page 1–8 retain native snap stops without JavaScript smooth-scroll competition.
- At every Page 4–8 stop, the camera key and displayed story have the same index for 1920×1080 and 1920×900 viewports.
- The WebGL canvas is demand-rendered, has no dynamic shadow pass, caps DPR at 1.25, and performs no perpetual tree sway.
- Page 9 can be freely scrolled to the bottom CTA; after 1.5 seconds the document does not jump back to the section top.
- Page 9 contains only application prospect, advantage, public-value, and responsible-AI messaging.
- Lint, TypeScript, unit tests, production build, and desktop browser QA pass.
