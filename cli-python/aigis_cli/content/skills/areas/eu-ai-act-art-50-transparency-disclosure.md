---
id: eu-ai-act-art-50-transparency-disclosure
title: EU AI Act Article 50 — Transparency obligations for AI interaction and AI-generated content
controls:
  owasp: []
  nist: [MEASURE-3.3]
  iso42001: [Annex-A.8]
  eu_ai_act: [Art-50, Art-50(1), Art-50(2), Art-50(3), Art-50(4)]
min_risk_tier: all
system_traits: [uses-llm, accepts-user-input, generates-content]
jurisdiction: [eu]
---

EU AI Act Article 50 applies to **all AI systems** offered in the EU that interact with natural persons or generate content — not just high-risk systems. If your chatbot, image generator, voice assistant, emotion-recognition feature, or biometric categorization touches an EU user, this area applies. It also satisfies NIST MEASURE-3.3 (transparency about AI use) and ISO 42001 Annex A.8 (transparency).

## Common incomplete implementations

1. **AI disclosure buried in Terms of Service.** A line in the ToS says "we use AI to power our chatbot" — that's not Article 50 disclosure. Article 50(1) requires the system to inform users they're interacting with AI **at the point of interaction**, in a way that's clear to a reasonable person. ToS-buried disclosure is invisible.
2. **Deepfake / AI-generated content not labelled.** A generated image or video is presented without a marker. Article 50(4) requires deployers to disclose AI-generated/manipulated content (deepfakes), and Article 50(2) requires providers to "ensure that the outputs of the AI system are marked in a machine-readable format and detectable as artificially generated or manipulated."
3. **Emotion recognition or biometric categorization users not informed.** Article 50(3) requires informing users when these systems are processing them. A "smile-detection" feature in a kiosk that the user doesn't notice fails this.
4. **Disclosure language is jargon.** "This system uses LLM-driven NLU/NLG" — most users don't know what that means. Disclosure must be accessible. "You're chatting with an AI assistant" is the bar.
5. **Disclosure happens once at first contact, never repeated.** A user returns six months later, doesn't remember the original disclosure. Some surfaces (deepfake watermarks, content labels) require persistent marking, not one-time disclosure.
6. **Watermarks are easily stripped.** A visible watermark that any image-editor can crop out doesn't satisfy "machine-readable" + "detectable" requirements. Article 50(2) implies durability — see C2PA, watermark schemes.

## Implementation procedure

### Step 1 — Identify which Article 50 sub-clauses apply to your system

**What to do.** Walk this decision tree:

| Sub-clause | Applies if your system... | Owner | Article ref |
|---|---|---|---|
| (1) Inform user it's AI | ...directly interacts with natural persons (chatbots, voice assistants, AI agents responding to humans) | Provider | Art 50(1) |
| (2) Mark generated content as AI-generated | ...generates synthetic audio, image, video, or text content | Provider | Art 50(2) |
| (3) Inform user of emotion recognition or biometric categorization | ...detects emotion/affect, or classifies people biometrically (excluding biometric ID systems, which are higher-risk and covered separately) | Deployer | Art 50(3) |
| (4) Disclose deepfakes / AI-manipulated content | ...generates or manipulates audio, video, or image content that "appreciably resembles" existing persons, places, events | Deployer | Art 50(4) |

Some systems trigger multiple sub-clauses. A voice assistant that responds in a synthesized voice triggers (1) AND (2). An image generator that can produce realistic faces triggers (2) AND (4).

Document which sub-clauses apply and who is responsible (provider vs deployer — this matters for liability and audit).

**Why this matters.** Article 50 obligations differ by sub-clause. (1) and (2) are PROVIDER obligations; (3) and (4) are DEPLOYER obligations. Misattribution leads to neither party fulfilling them.

**Verification checkpoint.** A documented decision matrix shows for each Article 50 sub-clause whether your system triggers it and who fulfills the obligation. If the matrix is missing or marks every clause as "not applicable" without justification, this checkpoint fails.

### Step 2 — Implement Article 50(1) AI-interaction disclosure (if applicable) ⚠ CRITICAL

**What to do.** At the start of the interaction, the system informs the user they're interacting with AI. Implementation patterns:

- **Chatbot / messaging UI**: First message in a session reads "Hi! I'm an AI assistant..." OR a persistent bot avatar/badge with text "AI" near the input area. Both ideal.
- **Voice assistant**: First spoken response includes a phrase identifying the system as AI ("I'm an AI assistant") OR an audible chime/intro that has been documented as the AI marker.
- **Embedded AI in a larger surface** (e.g. AI summary in a search result page): visual marker adjacent to the AI-generated section ("AI summary" badge or icon).

The disclosure must be:
- **Visible** — not buried in expandable disclosures, footnotes, or settings panels
- **Persistent** — for long sessions, the marker remains. For a chat UI, the bot avatar/badge stays visible. For voice, the user is reminded periodically (every N minutes or on context change).
- **Plain language** — "AI" or "AI assistant" or "automated system." Avoid jargon.

**Exception**: Article 50(1) does NOT apply when "this is obvious from the perspective of a natural person who is reasonably well-informed, observant and circumspect, taking into account the circumstances and the context of use." A clearly-labelled AI demo with "AI Demo" in the page title may meet this bar. Document the obviousness rationale.

**Why this matters.** Without Article 50(1) compliance, every user interaction is a transparency violation under EU law. Penalties under Article 99 reach €15M or 3% of global revenue.

**Verification checkpoint.** Open the system as a fresh user in an EU-jurisdiction context. Within the first interaction, locate the AI disclosure — measure how visible it is. If a reasonable user would miss it, the implementation fails. The disclosure remains visible/audible throughout the session.

### Step 3 — Implement Article 50(2) AI-generated content marking (if applicable)

**What to do.** Generated content is marked in two ways:

1. **Machine-readable mark** — embedded in the file metadata or content itself such that automated systems can detect AI-generation. Recommended standards:
   - **Image / Video**: C2PA Content Credentials (industry standard), embedded in EXIF / XMP metadata
   - **Audio**: SynthID-style watermarks (or comparable), audible at no quality cost; or metadata flags
   - **Text**: less mature; emerging zero-width-character or statistical watermarks. At minimum, a metadata tag in the API response.

2. **Human-detectable marker** — for content presented to humans, a visible/audible label:
   - **Image**: visible "AI-generated" label OR C2PA badge
   - **Video**: same, plus on-screen label ideally
   - **Audio**: spoken identifier OR audible chime
   - **Text**: prefix like "AI-generated:" or a UI badge

Both layers matter: machine-readable for downstream verification; human-detectable for end-user awareness.

**Why this matters.** Article 50(2) explicitly requires machine-readability AND detectability. A visible watermark alone doesn't satisfy machine-readable; a metadata flag alone doesn't satisfy detectability.

**Verification checkpoint.** Generate a sample output. Use a third-party tool (e.g. C2PA validator, content credentials checker) to confirm the machine-readable mark is present and intact. Visually/audibly confirm the human-detectable marker is present and not easily removable by routine processing (cropping, transcoding).

### Step 4 — Implement Article 50(3) emotion-recognition / biometric-categorization disclosure (if applicable)

**What to do.** Before processing the user, inform them. Patterns:

- **Camera-based emotion detection**: a notice on screen ("This screen detects facial expressions") with a way to opt out or close the feature
- **Voice-based emotion detection**: spoken or text disclosure before recording starts
- **Inferred categorization** (gender, age range from voice/face): explicit notice + opt-out

If informed consent is the legal basis (it usually is for biometric data under GDPR Article 9 anyway), the user's affirmative action is required, not a passive notice.

**Why this matters.** Article 50(3) is straightforward but commonly missed because emotion recognition is often a "feature added later" and the disclosure isn't propagated. Penalties for biometric data misuse under GDPR are separate and additive to Article 50.

**Verification checkpoint.** Trigger the emotion-recognition or biometric-categorization feature as a fresh user. The disclosure appears before processing. There is an opt-out mechanism, and the user's affirmative consent is recorded if required by GDPR.

### Step 5 — Implement Article 50(4) deepfake disclosure (if applicable)

**What to do.** For any AI-generated/manipulated audio, video, or image that "appreciably resembles" real persons, places, or events, add a disclosure. Implementation:

- **Visible label** on the content surface ("AI-generated" or "AI-manipulated")
- **Machine-readable provenance** (C2PA or equivalent)
- For published / distributed content, the disclosure travels WITH the content (embedded in metadata, not just on the original publishing surface)

**Exceptions** (Article 50(4) second paragraph):
- Artistic, creative, satirical, fictional works: disclosure required but "in an appropriate manner that does not hamper the display or enjoyment of the work" (a label in metadata + on the platform, not necessarily watermarked into the frame)
- Law enforcement: separate authorization required, different rules

**Why this matters.** Article 50(4) is a primary transparency tool against AI-driven misinformation. Failing here is both a regulatory issue and a reputational one — the public reads platforms that don't label deepfakes as complicit.

**Verification checkpoint.** Generate a deepfake-eligible output. Confirm the visible label is present. Download the file; confirm the C2PA / metadata provenance is intact. Pass the file through routine processing (re-encoding, cropping); confirm the metadata persists OR document the durability limitation publicly.

### Step 6 — Document the implementation in the deployer transparency document (Article 13 cross-reference)

**What to do.** The deployer instructions document (`aigis get eu-ai-act-art-13-deployer-transparency`) Section "Foreseeable misuse warnings" includes a sub-section on Article 50 obligations: which sub-clauses apply, what disclosure mechanism the deployer uses, what the deployer must NOT modify (e.g. "do not remove the AI disclosure UI element"), what the deployer MAY customize (text wording in deployment region's language).

**Why this matters.** Article 50(1) and 50(2) are provider obligations, but the deployer can break them by altering the UI. Telling the deployer what's load-bearing prevents accidental removal during customization.

**Verification checkpoint.** The Article 13 deployer instructions have a dedicated Article 50 section. The section names which UI elements/code paths must NOT be modified by the deployer.

## Cross-framework satisfaction

Implementing this procedure also satisfies:
- **NIST AI RMF MEASURE-3.3**: "Measurable performance improvements... such as participatory methods, are integrated into the AI system development." (Includes user-facing transparency as participatory feedback signal.)
- **ISO/IEC 42001 Annex A.8**: Information for interested parties — end users are an interested party.

## Related patterns

- `eu-ai-act-art-13-deployer-transparency.md` — deployer instructions document (Step 6 cross-reference).
- `output-sanitization.md` — different concern: output safety vs. output disclosure. Both apply to AI-generated content.
- `explainability.md` — explainability is about WHY the AI decided X. Article 50 is about THAT it's an AI at all. Both apply for high-stakes EU systems.
