# Third-party notices and license exclusions

The project licenses apply only to rights held by the project and its contributors. They do not relicense third-party material.

## Linked and summarized sources

Knowledge entries include titles, publishers, publication dates, links, short factual summaries, and original analysis of external sources. Copyright in the source articles, announcements, papers, images, names, and marks remains with the respective rights holders. Follow the original link for the authoritative material and its terms.

## Test fixtures

Files under `scripts/fixtures/` contain bounded RSS/XML metadata used only to test parsing, limits, provenance, deduplication, and editorial safety behavior. Third-party titles and excerpts inside those fixtures are excluded from both the Apache-2.0 and CC BY 4.0 grants.

## Regulatory filing emblem

`public/beian-police.png` is used only beside the required public-security filing link. It is excluded from the project licenses; no ownership or trademark right is asserted.

## Vendored browser component

`public/fieldbook/index.html` embeds a browser bundle derived from
[`@chenglou/pretext`](https://github.com/chenglou/pretext), a JavaScript/TypeScript
text measurement and layout library. This bundled portion remains under its MIT
License and is not covered by this project's Apache-2.0 or CC BY 4.0 grants.

```text
MIT License

Copyright (c) 2026 Pretext contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Package-managed runtime dependencies

Other runtime and development dependencies are installed from `package-lock.json`
rather than copied into the repository. Their own licenses remain controlling,
including React, ReactDOM, Vite, TypeScript, Vitest, and related transitive packages.

Direct dependency inventory for the extraction baseline:

| Package | Version | Declared license |
|---|---:|---|
| React | 18.3.1 | MIT |
| ReactDOM | 18.3.1 | MIT |
| @types/react | 18.3.12 | MIT |
| @types/react-dom | 18.3.1 | MIT |
| @vitejs/plugin-react | 6.0.3 | MIT |
| TypeScript | 5.6.3 | Apache-2.0 |
| Vite | 8.1.4 | MIT |
| Vitest | 4.1.10 | MIT |

Transitive dependency versions and integrity hashes are fixed by `package-lock.json`. Consumers must retain the notices required by those packages' own license files.
