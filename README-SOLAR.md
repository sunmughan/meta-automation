# Solar Client Pipeline (branch solar-client-pipeline)

Custom Meta automation build for one Indian solar dealer. Scaffold only. Nothing here posts, comments, likes or sends a DM.

## What this branch is
Three pipelines for a solar products dealer who is a supplier, a middleman and a direct-from-manufacturer dealer with his own production house, selling mostly Reliance solar products:
1. Buyer Discovery: find people who need solar, pitch them on his behalf.
2. Pain-Point Hunting: find people complaining about solar problems, convert them into buyers.
3. Warranty Angle: use his 5-year replacement warranty as the reason to pick him.

## Files added on this branch
- `config/solar-pipelines.json`: pipeline configs, sources, targets, safety defaults.
- `config/solar-search-queries.json`: discovery search seeds per pipeline.
- `knowledge/solar-client.md`: client business knowledge for the AI engine.
- `knowledge/solar-services.md`: products, buyer types, subsidy and price facts.
- `src/leads/solar-intent-classifier.js`: AI delegation wrapper with solar context.
- `src/engagement/solar-comment-generator.js`: AI delegation wrapper with warranty guardrails.
- `src/solar/solar-pipeline-runner.js`: scan, classify, dedup, draft, approve, record. DRY RUN only.
- `tests/solar-pipeline.test.js`: config and module checks, no network.

## Safety
- `dryRun: true` and `livePosting: false` in `config/solar-pipelines.json`.
- `SolarPipelineRunner.postLive()` throws until a human approval gate is built.
- Classification is live Antigravity Gemini AI reasoning, same as the main repo. No keyword lists.
- Warranty wording stays general until the client confirms coverage in writing.
- Never claim the client is Reliance or an official Reliance partner.

## Run the checks
```
node tests/solar-pipeline.test.js
```

## Still needed before anything goes live
- Client name, business name, city and service area.
- His social accounts and which one posts.
- Reliance product list he stocks and his price list.
- Written 5-year warranty terms.
- Whether he is a DISCOM-registered vendor under PM Surya Ghar.
- His approval: first batch of drafts reviewed by him before any live post.

Full R&D: `~/workspace/solar-meta-automation-rnd/solar-rnd-2026-11-11.md`
Flow diagram: `~/workspace/solar-meta-automation-rnd/solar-pipeline-flow.html`
