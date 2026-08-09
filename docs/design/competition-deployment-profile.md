# Competition deployment profile

## Decision

Tree Chat uses one codebase and one Cloudflare Worker for two presentation profiles:

| Profile | Host | Landing-page identity | Search indexing |
| --- | --- | --- | --- |
| `public` | existing `*.workers.dev` address | GitHub repository and MIT license links are visible | `index, follow` |
| `competition` | competition root custom domain | repository, author, and license attribution are absent | `noindex, nofollow` |

The feature workspace at `/app`, API routes, storage model, and product behavior remain shared. The profile seam changes presentation only; it must not create a second source tree, build, or deployment.

## Implemented seam

The current working tree resolves the root landing page at request time:

- `src/lib/siteProfile.ts` owns `SiteProfileId`, `LandingPresentation`, host normalization, and profile selection.
- `app/page.tsx` reads the request `Host` through Next.js `headers()`, passes the two configured hosts to `resolveLandingPresentation`, supplies the result to `LandingPage`, and derives robots metadata from the same result.
- `src/components/landing/LandingPage.tsx` receives the resolved presentation. It conditionally renders repository and license links and substitutes the competition-safe canopy fact.
- `src/lib/siteProfile.test.ts` covers exact public-host selection, competition fallback, malformed and missing hosts, trailing DNS dots, ports, and colliding configuration.

This is a server request boundary. Do not move profile selection to browser-side hostname checks or a build-time public variable: that would make the first HTML response ambiguous and would expose the decision logic and attribution data to the shared client bundle.

## Exact Host rule: fail closed

The resolver grants the public presentation only when the normalized request Host is exactly equal to the normalized `TREECHAT_PUBLIC_HOST`.

Normalization is deliberately narrow:

1. trim and lowercase;
2. remove a final numeric port;
3. remove one trailing DNS dot;
4. reject empty values, URL syntax, whitespace, `/`, `@`, `?`, `#`, and characters outside letters, digits, dots, and hyphens;
5. compare the complete remaining hostname, never a substring or suffix.

Every other case returns `competition`: the configured competition host, an unknown host, a malformed or missing Host header, or a missing public-host setting. A value such as `public.example.workers.dev.evil.test` therefore cannot select `public`.

`TREECHAT_COMPETITION_HOST` records the intended custom domain and participates in the collision guard. It is not a second allow-list: fail-closed behavior means all non-public hosts remain anonymous. If both configured hosts normalize to the same value, the resolver throws instead of serving a potentially mislabelled page.

## Runtime configuration

Configure these values on the single production Worker:

| Variable | Kind | Required value |
| --- | --- | --- |
| `TREECHAT_PUBLIC_HOST` | plain server environment variable | exact existing workers.dev hostname, without scheme, path, or trailing slash |
| `TREECHAT_COMPETITION_HOST` | plain server environment variable | exact competition root-domain hostname |
| `DEEPSEEK_API_KEY` | encrypted Worker secret | server-side DeepSeek key used by `/api/chat`, `/api/structure`, and `/api/auxo` |

None of these values should use a `NEXT_PUBLIC_` prefix. Do not commit the API key or place it in client-visible configuration. Confirm the exact Worker environment before setting variables; Wrangler environment variables are non-inheritable when named environments are introduced.

## Cloudflare topology

Recommended topology:

```text
existing workers.dev hostname (public) ----\
                                           > one Worker -> one Next.js build -> shared /app and API routes
competition root custom domain -----------/
```

Keep the existing workers.dev address enabled and bind the competition root domain as a Custom Domain on the same Worker. This preserves the public URL, avoids two releases drifting apart, and gives both hosts the same server secret and runtime behavior. The only request-dependent branch is the landing presentation.

Do not add OpenNext, Wrangler packages, or a guessed `wrangler.jsonc` in this change. The repository currently has no OpenNext/Wrangler dependency or configuration, while the existing Worker name, account, build command, output path, route bindings, and deployment owner are not recorded locally. Guessing `name` or routes can create a different Worker, change the workers.dev address, or replace production bindings. OpenNext's Cloudflare guide also does not support native Windows builds; establish the real deployment path first, then reproduce it in WSL or Linux CI if OpenNext is needed.

Before changing deployment tooling, obtain a read-only export or screenshot of the current Cloudflare Worker settings and record:

- account and Worker name;
- current workers.dev hostname and whether it is enabled;
- current build command and artifact/output directory;
- Git integration or manual/CI deploy owner;
- variables, secrets, compatibility date/flags, routes, Custom Domains, and cache rules.

## Release acceptance

The competition domain is not ready merely because its rendered footer hides the links. One build serves both hosts, so acceptance must cover HTML, referenced JavaScript, and cache isolation.

Use the real HTTPS addresses and run the checks against the deployed production artifact.

### 1. Identity matrix

For both `/` responses, capture status, final URL, response headers, and decoded HTML.

- Public Host: `data-site-profile="public"`; repository and MIT license links are present; robots permit indexing.
- Competition Host: `data-site-profile="competition"`; repository and license links are absent; robots disallow indexing.
- Both hosts: `/app` and the required API routes remain reachable and behaviorally identical apart from normal authentication/rate-limit state.

Treat these as forbidden signatures on the competition Host:

- `hancewang77` and `hancewang77-hl`;
- `github.com/hancewang77-hl/tree-chat`;
- the exact public workers.dev hostname;
- the exact public attribution labels `GitHub` and `MIT License`.

After HTML entity decoding, scan author names, repository URLs, and hostnames case-insensitively; scan the two attribution labels with their exact casing. A match blocks release until it is either removed or documented as a proven false positive. Generic third-party dependency URLs such as a framework's own lowercase `github.com` source or license link are not Tree Chat identity, but their package name, URL, and matching chunk must be recorded before they are accepted as false positives.

### 2. Shared JavaScript scan

Extract every same-origin `/_next/static/*.js` URL referenced by the competition HTML, download the decoded response body, and scan it for the same forbidden signatures. Include dynamically referenced chunks discovered from Next.js manifests when present. Check source maps too if production serves them.

This scan is mandatory because a string can be hidden in rendered competition markup yet remain inside a shared client chunk. Static assets are intentionally shared across profiles; they must therefore contain no author- or repository-identifying material that violates the competition submission rules.

### 3. Cache cross-talk

Request the two hosts repeatedly in both orders, using fresh connections and again through the normal CDN cache:

1. public -> competition -> public;
2. competition -> public -> competition;
3. repeat each sequence after a warm-cache request and from a second region or network when available.

At every step, assert the expected `data-site-profile`, robots value, links, and forbidden-signature result. The identities must never swap. Until this passes, do not add an HTML cache rule. If HTML is cached later, its cache key must include the hostname. Shared immutable `/_next/static` caching is acceptable only after the JavaScript scan passes.

Record the deployment identifier, timestamp, both hostnames, response headers, and scan output with the competition submission evidence.

## Deferred main-branch commit

Do not merge or cherry-pick main-only commit `aea2d9f` in this release. Its Leaf/Harvest behavior changes are unrelated to the host-profile and deployment seam, and mixing them into the competition release would expand the regression surface while this branch already contains dedicated landing and competition work. Reconcile that commit as a separate parity task after the dual-Host deployment is stable and accepted.

## Known risks

- Presentation anonymity does not hide DNS ownership, Cloudflare account metadata, certificate transparency records, repository history, or network/API observability. Confirm the competition's actual anonymity rules before submission.
- Both hosts share one Worker secret, quota, rate limiter process, and failure domain. This is intentional for one-codebase operation but must be included in capacity and incident planning.
- A custom Cloudflare cache rule or upstream proxy that ignores Host can defeat request-time presentation selection. The cross-talk test is a release gate.
- The current seam is landing-page scoped. Any future author or repository attribution added to `/app`, API errors, manifests, metadata, assets, or client bundles must be covered by the competition scan.

## References

- [OpenNext Cloudflare: Get started](https://opennext.js.org/cloudflare/get-started)
- [OpenNext Cloudflare: Environment variables](https://opennext.js.org/cloudflare/howtos/env-vars)
- [Cloudflare Workers: Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare Workers: Environments](https://developers.cloudflare.com/workers/wrangler/environments/)
