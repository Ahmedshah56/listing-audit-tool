# Listing Audit Tool

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Try%20it-brightgreen)](https://listing-audit-tool-ahmeds-projects-227aabc2.vercel.app)
[![React](https://img.shields.io/badge/React-18-61DAFB)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF)](https://vite.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An expert Amazon product listing SEO auditor. Paste in a title, five bullet points, a description and backend search terms — get a 0–100 score, a letter grade, per-section breakdowns and a prioritized fix list in seconds.

**Try it live: https://listing-audit-tool-ahmeds-projects-227aabc2.vercel.app** — no sign-up, nothing leaves your browser.

I built this for my freelance work auditing Amazon listings. The rules it checks are the same ones I apply by hand on client listings: title length and keyword discipline, bullet quality, description depth and search-term hygiene. It also generates a clean Markdown audit report you can paste straight into an outreach email.

## Who this helps

- **Amazon sellers** who want an honest score on a listing before spending on ads
- **Freelance listing specialists** who need a client-ready audit report in minutes, not hours
- **Brand managers** checking whether a listing follows Amazon's own style rules

### Sample audit: what a fix looks like

A typical weak listing scores around **41/100 (F)**:

- Title is 86 characters and repeats the main keyword four times
- Two of the five bullet slots are empty, and one bullet is specs only
- Description is under 200 characters
- Search terms contain commas and repeat words already in the title, wasting bytes

After applying the tool's fix list, the same listing scores **88/100 (B)**: a 172-character title with the brand first and no repetition, five benefit-led bullets that echo the title keywords, a 600+ character description, and clean space-separated search terms inside the 250-byte limit. Every point of that jump comes from changes a seller can make in one editing session.

## Features

- **Live scoring** — every keystroke re-runs the audit; character and byte counters give instant feedback
- **Animated score gauge** with an A–F grade and plain-English verdict
- **Four scored sections** (Title 30, Bullets 30, Description 20, Search Terms 20), each with PASS / WARNING / FAIL badges and per-check explanations
- **Prioritized fix list** — every issue ships with the exact fix, e.g. how many characters to add and where the keywords should go
- **Keyword frequency table** across title + bullets, so repetition and gaps are visible at a glance
- **One-click Markdown report** — "Copy audit report" puts a full client-ready report on the clipboard
- **Sample listing** — one click loads a realistic demo product to explore the tool
- **100% client-side** — no backend, no tracking, nothing leaves the browser

## The audit rules

**Title (30 pts)**
- 150–200 characters is the sweet spot; under 120 or over 200 loses points
- Same keyword 3+ times = repetition flag (no ranking benefit, reads as spam)
- Banned promo phrases flagged: "best seller", "#1", "free shipping", "on sale", leading "new"
- ALL-CAPS words flagged (Amazon style guide discourages them)
- Brand name should lead the title

**Bullet points (30 pts)**
- All 5 slots should be filled; each bullet max 500 characters
- Under 100 characters = thin content warning
- Specs-only bullets get flagged — each bullet should lead with a benefit
- Bullets should echo 1–2 title keywords to reinforce relevance

**Description (20 pts)**
- 500+ characters recommended for long-tail coverage
- Same word 6+ times = keyword stuffing warning

**Search terms (20 pts)**
- Hard 250-byte limit (measured in bytes, like Amazon does)
- Commas flagged — Amazon wants space-separated terms
- Duplicate words and words already in the title flagged as wasted bytes

**Grading:** 90+ A · 80+ B · 70+ C · 60+ D · below 60 F

## Tech stack

- React 18 + Vite 6
- Plain CSS design system (no UI framework, no Tailwind)
- Zero runtime dependencies beyond React — the scoring engine (`src/audit.js`) is pure JavaScript with no imports, so it can be reused anywhere (Node scripts, browser extensions, serverless functions)

## Run it locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Build for production

```bash
npm run build
```

The static output lands in `dist/` — deploy it anywhere static hosting works.

## Deploy

**Netlify** — drag the `dist/` folder into [app.netlify.com/drop](https://app.netlify.com/drop), or connect the repo and set build command `npm run build`, publish directory `dist`.

**Vercel** — `vercel` from the project root, or import the repo; the defaults (build `npm run build`, output `dist`) work as-is.

## Project structure

```
listing-audit-tool/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx      # React entry point
│   ├── App.jsx       # UI: form, gauge, sections, recommendations, export
│   ├── audit.js      # Pure scoring engine + Markdown report builder
│   ├── sample.js     # Demo listing (fictional brand)
│   └── styles.css    # Design system
└── README.md
```

## Disclaimer

Independent tool built for listing audits. Not affiliated with or endorsed by Amazon.
