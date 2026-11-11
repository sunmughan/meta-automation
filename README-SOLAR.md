# Solar Client Pipeline (branch solar-client-pipeline)

Custom Meta automation build for Amit Mathur, a solar dealer from Madhya Pradesh. Scope is MP only. Scaffold only. Nothing here posts, comments, likes, sends a DM or sends an SMS.

## What this branch is
Four pipelines for a solar products dealer who is a supplier, a middleman and a direct-from-manufacturer dealer with his own production house, selling mostly Reliance solar products:
1. Buyer Discovery: find people who need solar, pitch them on his behalf.
2. Pain-Point Hunting: find people complaining about solar problems, convert them into buyers.
3. Warranty Angle: use his 5-year replacement warranty as the reason to pick him.
4. Sarpanch Outreach: pitch Gram Panchayat Sarpanchs across MP and message them daily with offers through Google Messages for web, so one Sarpanch converts a whole village. Proof case: one Sarpanch pitch led to 35 home installs in that village.

Scope: B2B and B2C, urban and rural, MP only. Major cities (Indore, Bhopal, Jabalpur, Gwalior, Ujjain, Sagar, Dewas, Satna, Ratlam, Rewa) plus rural areas across all 55 districts, down to Gram Panchayat level. MP has about 23,000 Gram Panchayats.

## Files added on this branch
- `config/solar-pipelines.json`: pipeline configs, MP scope, SMS channel, engagement rules, compliance flag, safety defaults.
- `config/solar-search-queries.json`: discovery search seeds per pipeline.
- `knowledge/solar-client.md`: client business knowledge for the AI engine.
- `knowledge/solar-services.md`: products, buyer types, subsidy and price facts.
- `src/leads/solar-intent-classifier.js`: AI delegation wrapper with solar context.
- `src/engagement/solar-comment-generator.js`: AI delegation wrapper with warranty guardrails.
- `src/solar/solar-pipeline-runner.js`: scan, classify, dedup, draft, approve, record. DRY RUN only.
- `tests/solar-pipeline.test.js`: config and module checks, no network.

## SMS channel: Google Messages for web
- Open messages.google.com/web on the computer, pair Amit Android phone (Google Messages, profile, Device pairing, scan QR code or sign in with the Google account).
- The phone must stay on and connected. SMS sends through the phone carrier, from Amit real number.
- Manual 1-to-1 messages only, one offer per day per Sarpanch, maximum. The automation never sends SMS. A human sends from the web UI.

## Compliance flag: TRAI DLT
- Bulk commercial SMS in India needs DLT registration (Principal Entity ID, 6-character header with -P/-S/-T/-G suffix, registered content template, consent template). No DLT status is claimed for Amit.
- The Sarpanch SMS leg is manual 1-to-1 messaging from his own phone, not a bulk gateway. Keep volume human, personalise every message, honour opt-outs at once. If volume grows, move to a DLT-registered bulk route.

## Engagement rules
- Hot buyer: ask roof size, monthly bill, location, timeline, budget.
- Not an obvious buyer: still ask questions, engage, try to convert. Never drop a lead without engaging first.

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
- Amit phone number for the Google Messages web connection.
- His Sarpanch contact list, if he already has one.
- His social accounts and which one posts.
- Reliance product list he stocks and his price list.
- Written 5-year warranty terms.
- Whether he is a DISCOM-registered vendor under PM Surya Ghar.
- His approval: first batch of drafts reviewed by him before any live post.

Full R&D: `~/workspace/solar-meta-automation-rnd/solar-rnd-2026-11-11.md`
Flow diagram: `~/workspace/solar-meta-automation-rnd/solar-pipeline-flow.html`
