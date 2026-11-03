# Maintaining the cc-bro guides

Edit the matching Markdown files in `en/` and `zh/`. Keep each topic’s file name stable; it is also its URL slug (installation is the Docs landing page). Start each topic with one H1, a blank line and a short introduction. Link to other topics by their local Markdown file names: the builder converts those links to the corresponding website routes. To add or reorder a topic, update the grouped navigation in `build.mjs` and both language directories together.

Write release notes once in the root [CHANGELOG.md](../CHANGELOG.md), newest first. Each `## X.Y.Z` entry has a `### English` and a `### 简体中文` section. Use fourth-level headings for subsections. Include breaking changes and concrete upgrade steps when relevant. The newest version must match the root package.json. Do not date a release before it ships.

With Node.js 24+:

```sh
npm ci --prefix docs-site
npm run build --prefix docs-site
python3 -m http.server 8080 --bind 127.0.0.1 --directory docs-site/dist
```

Open the local server at `/docs/` or `/changelog/`; Chinese pages live at `/zh/docs/` and `/zh/changelog/`. These pages work without JavaScript. The standalone build contains the reference pages and their assets; the main website build adds the homepage. Use a clean output directory for release builds.
