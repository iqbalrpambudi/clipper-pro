# Implementation Plan
## Master Prompt & Specialized Prompt Architecture for Short-Form Video Script Generator

## 1. Overview

Implement a modular prompt architecture for generating professional short-form video scripts for:

- YouTube Shorts
- TikTok
- Instagram Reels

The system will separate global writing behavior from content-category-specific behavior.

Instead of maintaining one large prompt for every content type, the system will use:

```text
MASTER PROMPT
    +
SPECIALIZED PROMPT
    +
CONTENT PARAMETERS
    ↓
FINAL GENERATION PROMPT
    ↓
SCRIPT
    ↓
QUALITY EVALUATION
    ↓
OPTIONAL REWRITE
```

The architecture must be scalable, reusable, versionable, and suitable for automated video-generation pipelines.

---

# 2. Goals

## Primary Goals

1. Create one reusable Master Prompt containing global writing rules.
2. Create Specialized Prompts for individual content presets.
3. Allow presets to override or extend Master Prompt behavior.
4. Support configurable script parameters.
5. Maintain consistent professional writing quality.
6. Reduce repetitive AI-generated writing patterns.
7. Optimize scripts for short-form video retention.
8. Make prompt versions easy to update without affecting unrelated presets.
9. Support future automated quality scoring.
10. Ensure generated scripts are suitable for TTS/voice-over and video rendering.

---

# 3. Non-Goals

This implementation does not initially handle:

- Video editing
- Caption rendering
- TTS generation
- Automatic fact verification
- Video scene generation
- Thumbnail generation
- Publishing to social media

These can be implemented as separate pipeline stages.

---

# 4. Prompt Architecture

Use a layered prompt system.

```text
┌─────────────────────────────┐
│       MASTER PROMPT         │
│                             │
│ Role                        │
│ Writing principles          │
│ Retention                   │
│ Spoken language             │
│ Accuracy                    │
│ Anti-AI patterns            │
│ General structure           │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   SPECIALIZED PROMPT        │
│                             │
│ Content-specific strategy   │
│ Structure                   │
│ Hook strategy               │
│ Pacing                      │
│ Ending                      │
│ Category constraints        │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│     CONTENT PARAMETERS      │
│                             │
│ Topic                       │
│ Duration                    │
│ Audience                    │
│ Tone                        │
│ Intensity                   │
│ CTA                         │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│    FINAL GENERATION PROMPT  │
└──────────────┬──────────────┘
               │
               ▼
             SCRIPT
```

---

# 5. Directory Structure

Recommended project structure:

```text
prompts/
├── master/
│   ├── base.md
│   ├── retention.md
│   ├── language.md
│   ├── accuracy.md
│   ├── anti-ai.md
│   └── output.md
│
├── specialized/
│   ├── unique-fact.md
│   ├── storytelling.md
│   ├── education.md
│   ├── history.md
│   ├── science.md
│   ├── mystery.md
│   └── listicle.md
│
├── presets/
│   ├── unique-fact-curious.md
│   ├── unique-fact-shocking.md
│   ├── storytelling-dramatic.md
│   └── education-practical.md
│
├── schemas/
│   ├── script-input.json
│   ├── script-output.json
│   └── quality-score.json
│
└── versions/
    ├── v1/
    └── v2/
```

For an initial implementation, the master prompt can remain as a single file:

```text
prompts/master/base.md
```

The additional modules can be separated later if prompt size becomes difficult to maintain.

---

# 6. Master Prompt

File:

```text
prompts/master/base.md
```

The Master Prompt defines behavior that applies to every content category.

## Responsibilities

The Master Prompt must define:

### 6.1 Writer Identity

Example:

```text
You are a professional short-form video scriptwriter
specializing in TikTok, Instagram Reels, and YouTube Shorts.
```

### 6.2 Primary Objective

Prioritize:

1. Viewer retention
2. Curiosity
3. Clarity
4. Natural spoken language
5. Emotional engagement
6. Replayability
7. Comment/share potential

### 6.3 Spoken Language

Rules:

- Indonesian
- conversational
- natural
- concise
- easy to pronounce
- suitable for TTS
- avoid overly formal language
- avoid article-like writing

### 6.4 Retention

Define general retention principles:

```text
HOOK
→ CURIOSITY
→ INFORMATION
→ ESCALATION
→ PAYOFF
→ INTERACTION
```

Every section should contribute either:

- information
- curiosity
- emotional tension
- surprise
- consequence
- payoff

### 6.5 Hook Rules

The first sentence must:

- immediately introduce tension or curiosity
- be concise
- avoid generic introductions
- avoid explaining everything
- create a reason to continue watching

Avoid:

```text
"Halo guys..."
"Pada video kali ini..."
"Tahukah kamu..."
"Kali ini kita akan membahas..."
```

unless contextually justified.

### 6.6 Anti-AI Writing

Prevent repetitive AI patterns.

Rules:

- vary sentence length
- vary hook structures
- vary transitions
- avoid excessive "ternyata"
- avoid excessive "yang menarik"
- avoid repetitive CTA
- avoid formulaic storytelling
- avoid unnecessary filler

The generated script should not feel like it was generated from a visible template.

### 6.7 Accuracy

Never invent:

- statistics
- names
- dates
- quotes
- scientific claims
- historical events

Avoid absolute claims unless supported by the provided information.

### 6.8 Output

Default output:

```text
Only return the final script.
Do not explain the writing process.
Do not include stage directions.
Do not include brackets.
```

---

# 7. Specialized Prompt

Specialized Prompts extend the Master Prompt.

They should NOT repeat global rules unless an intentional override is required.

Example:

```text
Master Prompt
+
Unique Fact Specialized Prompt
+
Input
```

The Specialized Prompt should focus on:

- category-specific storytelling
- content structure
- pacing
- hook mechanism
- information ordering
- CTA strategy

---

# 8. Preset 01 — Unique Fact

File:

```text
prompts/specialized/unique-fact.md
```

## Objective

Generate surprising factual content that feels like one continuous story rather than a list of facts.

## Structure

```text
HOOK
↓
CURIOSITY
↓
FACT
↓
EXPLANATION
↓
ESCALATION
↓
MOST SURPRISING FACT
↓
QUESTION
```

## Rules

- Use 2–4 important facts.
- Do not explicitly label them "Fakta pertama", "Fakta kedua".
- Start with the most curiosity-inducing aspect.
- Save the strongest payoff for later.
- Connect facts naturally.
- Explain why each fact matters.
- Do not sacrifice factual accuracy for shock value.

## CTA

Prefer:

```text
opinion question
experience question
prediction question
```

rather than:

```text
like/comment/subscribe
```

---

# 9. Preset 02 — Viral Storytelling

File:

```text
prompts/specialized/storytelling.md
```

## Objective

Create dramatic short-form stories with escalating tension.

## Structure

```text
HOOK
↓
SETUP
↓
CONFLICT
↓
ESCALATION
↓
TURNING POINT
↓
PAYOFF
↓
MESSAGE
↓
INTERACTION
```

## Rules

- Start as close to the interesting event as possible.
- Avoid lengthy background information.
- Introduce conflict quickly.
- Increase tension progressively.
- Reveal information gradually.
- Use a clear turning point.
- Deliver a satisfying payoff.
- Do not create artificial drama if the source material does not support it.

---

# 10. Preset 03 — Education / Practical Tips

File:

```text
prompts/specialized/education.md
```

## Objective

Provide practical information quickly while maintaining retention.

## Structure

```text
PROBLEM
↓
PROMISE
↓
SOLUTION
↓
STEP 1
↓
STEP 2
↓
STEP 3
↓
COMMON MISTAKE
↓
RESULT
↓
CTA
```

## Rules

- Start with a relatable problem.
- Do not start with a textbook definition.
- Give actionable information.
- Prioritize the highest-value tip.
- Include an example when useful.
- Mention a common mistake when relevant.
- Avoid unnecessary theory.

## CTA

Prefer:

```text
"Save video ini..."
```

for reference-oriented content.

Use:

```text
"Share ke..."
```

when the information is useful to others.

Use:

```text
"Kalau kamu..."
```

for experience/opinion-based discussion.

---

# 11. Future Specialized Presets

The architecture should support additional presets.

Recommended future categories:

```text
history
science
technology
finance
psychology
mystery
conspiracy
biography
crime
business
productivity
life-hacks
facts-about-country
facts-about-animal
space
AI
```

Each category should define only its unique writing behavior.

---

# 12. Content Parameters

Define a standardized input schema.

File:

```text
prompts/schemas/script-input.json
```

Recommended schema:

```json
{
  "topic": "string",
  "category": "unique_fact",
  "duration": 30,
  "tone": "curious",
  "audience": "general",
  "intensity": "high",
  "cta": "comment",
  "language": "id-ID",
  "source_context": "string"
}
```

---

# 13. Parameter Definitions

## topic

Main content subject.

Example:

```text
Kenapa gurita punya tiga jantung?
```

## category

Preset identifier.

Example:

```text
unique_fact
storytelling
education
```

## duration

Target video duration in seconds.

Recommended presets:

```text
15
20
30
45
60
```

## tone

Allowed values:

```text
curious
dramatic
funny
serious
mysterious
inspiring
energetic
```

## audience

Examples:

```text
general
teenagers
young-adults
professionals
beginners
```

## intensity

```text
low
medium
high
```

Controls:

- emotional intensity
- pacing
- sentence punchiness
- hook strength

## CTA

Examples:

```text
comment
save
share
follow
none
```

---

# 14. Duration-Aware Writing

The prompt generator must convert duration into an approximate word target.

Suggested defaults:

| Duration | Target Words |
|---:|---:|
| 15 sec | 35–45 |
| 20 sec | 45–55 |
| 30 sec | 65–80 |
| 45 sec | 95–115 |
| 60 sec | 125–150 |

The model should prioritize meaning and retention over hitting an exact word count.

If the topic cannot be adequately explained within the requested duration, remove low-value information instead of compressing every sentence excessively.

---

# 15. Prompt Composer

Implement a Prompt Composer responsible for assembling the final prompt.

Pseudo-code:

```ts
function buildPrompt(input: ScriptInput) {
  const masterPrompt = loadMasterPrompt();

  const specializedPrompt =
    loadSpecializedPrompt(input.category);

  const parameters = buildParameterInstructions(input);

  return [
    masterPrompt,
    specializedPrompt,
    parameters
  ].join("\n\n");
}
```

Final prompt:

```text
MASTER PROMPT

+

SPECIALIZED PROMPT

+

CONTENT PARAMETERS
```

---

# 16. Parameter Instruction Generator

Example:

```ts
function buildParameterInstructions(input) {
  return `
TOPIC:
${input.topic}

TARGET DURATION:
${input.duration} seconds

TARGET AUDIENCE:
${input.audience}

TONE:
${input.tone}

INTENSITY:
${input.intensity}

CTA:
${input.cta}

LANGUAGE:
${input.language}
`;
}
```

---

# 17. Preset Configuration

Instead of hardcoding every prompt combination, define preset metadata.

Example:

```json
{
  "id": "unique-fact-curious",
  "category": "unique_fact",
  "tone": "curious",
  "intensity": "medium",
  "cta": "comment",
  "duration": 30
}
```

Another:

```json
{
  "id": "storytelling-dramatic",
  "category": "storytelling",
  "tone": "dramatic",
  "intensity": "high",
  "cta": "comment",
  "duration": 45
}
```

This allows the UI to expose presets such as:

```text
┌────────────────────────────┐
│ Script Preset              │
│                            │
│ ○ Fakta Unik               │
│ ○ Storytelling Dramatis    │
│ ○ Edukasi Praktis          │
│                            │
│ Duration                   │
│ [30 seconds ▼]             │
│                            │
│ Tone                       │
│ [Curious ▼]                │
└────────────────────────────┘
```

---

# 18. Output Schema

For future automation, avoid relying entirely on plain text.

Recommended structured output:

```json
{
  "title": "string",
  "hook": "string",
  "script": "string",
  "estimated_duration": 30,
  "word_count": 75,
  "cta": "string"
}
```

If the application already separates scenes, use:

```json
{
  "title": "string",
  "sections": [
    {
      "type": "hook",
      "text": "string"
    },
    {
      "type": "content",
      "text": "string"
    },
    {
      "type": "payoff",
      "text": "string"
    },
    {
      "type": "cta",
      "text": "string"
    }
  ]
}
```

This will be useful later for automatic:

- scene generation
- caption segmentation
- TTS
- B-roll generation
- timeline generation
- video rendering

---

# 19. Quality Evaluation Layer

After the initial implementation is stable, add a second LLM evaluation step.

Pipeline:

```text
INPUT
 ↓
PROMPT COMPOSER
 ↓
SCRIPT GENERATOR
 ↓
QUALITY EVALUATOR
 ↓
PASS?
 ├── YES → FINAL SCRIPT
 └── NO  → REWRITE
```

Evaluate the script using:

| Metric | Score |
|---|---:|
| Hook Strength | 0–10 |
| Curiosity | 0–10 |
| Retention | 0–10 |
| Naturalness | 0–10 |
| Information Density | 0–10 |
| Pacing | 0–10 |
| Payoff | 0–10 |
| CTA Quality | 0–10 |
| AI-Likeness | 0–10 |

Recommended minimum:

```text
Overall >= 8
```

For individual critical metrics:

```text
Hook >= 8
Naturalness >= 8
Payoff >= 7
```

---

# 20. Quality Evaluation Prompt

Evaluator should NOT rewrite immediately.

First return:

```json
{
  "scores": {
    "hook": 8,
    "curiosity": 9,
    "retention": 8,
    "naturalness": 7,
    "pacing": 8,
    "payoff": 7,
    "cta": 8
  },
  "overall": 8.0,
  "issues": [
    "Middle section contains unnecessary explanation",
    "CTA feels slightly generic"
  ],
  "should_rewrite": true
}
```

If:

```text
overall < 8
```

send the script back for revision.

---

# 21. Rewrite Strategy

Do not regenerate the entire script blindly.

Provide the evaluator feedback to the rewriting step.

Example:

```text
Original Script:
...

Quality Feedback:
- Hook is strong.
- Middle section is too explanatory.
- Ending CTA is generic.

Rewrite the script while preserving:
- factual information
- original topic
- strongest hook
- strongest payoff

Improve:
- pacing
- naturalness
- CTA
```

This reduces unnecessary changes to already-good sections.

---

# 22. Prompt Versioning

Every Master and Specialized Prompt must have a version.

Example:

```text
master-v1.0
unique-fact-v1.0
storytelling-v1.0
education-v1.0
```

When changing important behavior:

```text
master-v1.1
```

Do not silently modify production prompts.

Maintain a changelog:

```text
v1.1
- Improved anti-AI rules
- Added duration-aware writing
- Reduced repetitive CTA
```

---

# 23. Testing Strategy

Create a fixed benchmark dataset.

Example:

```text
TEST-001
Topic: Kenapa gurita punya tiga jantung?
Category: unique_fact

TEST-002
Topic: Kisah pendaki yang selamat setelah tersesat
Category: storytelling

TEST-003
Topic: Cara membuat password yang lebih aman
Category: education
```

Each prompt version must be tested against the same dataset.

---

# 24. A/B Prompt Testing

Test:

```text
Master v1.0 + Unique Fact v1.0
```

against:

```text
Master v1.1 + Unique Fact v1.1
```

Compare:

- hook quality
- average word count
- repetition
- naturalness
- retention potential
- factual accuracy
- CTA quality

Do not judge prompts using only one generated example.

Use at least:

```text
10–30 topics per category
```

for meaningful comparison.

---

# 25. Acceptance Criteria

## Master Prompt

Must:

- work across all categories
- produce natural Indonesian
- avoid generic intros
- produce spoken-language scripts
- support duration parameters
- avoid repetitive patterns
- maintain factual integrity

## Specialized Prompt

Must:

- produce category-specific structure
- not duplicate unnecessary Master rules
- have category-specific hook strategy
- have category-specific pacing
- have category-specific CTA strategy

## Generator

Must:

- dynamically select specialized prompt
- inject content parameters
- support prompt versioning
- support future presets
- produce predictable structured output

---

# 26. Implementation Phases

## Phase 1 — Prompt Foundation

Tasks:

- Create Master Prompt
- Define global writing rules
- Define retention rules
- Define anti-AI rules
- Define accuracy rules
- Define output rules

Deliverable:

```text
prompts/master/base.md
```

---

## Phase 2 — Specialized Prompts

Create:

```text
unique-fact.md
storytelling.md
education.md
```

Validate each category against 10+ topics.

Deliverable:

```text
prompts/specialized/
```

---

## Phase 3 — Parameter System

Implement:

```text
topic
category
duration
tone
audience
intensity
cta
language
```

Create input schema.

Deliverable:

```text
script-input.json
```

---

## Phase 4 — Prompt Composer

Implement dynamic composition:

```text
Master
+
Specialized
+
Parameters
```

Add prompt version support.

---

## Phase 5 — Structured Output

Implement JSON output.

Validate:

- schema
- word count
- duration
- required fields

---

## Phase 6 — Benchmark

Create benchmark topics.

Run:

```text
10–30 topics/category
```

Measure quality.

---

## Phase 7 — Quality Evaluator

Implement:

```text
Generate
→ Evaluate
→ Rewrite if necessary
```

Add scoring thresholds.

---

## Phase 8 — Production Integration

Integrate the prompt engine with:

```text
Topic Input
 ↓
Preset Selection
 ↓
Prompt Composer
 ↓
LLM
 ↓
Quality Evaluation
 ↓
Final Script
 ↓
Scene/Caption/TTS Pipeline
```

---

# 27. Recommended MVP

Do NOT implement everything at once.

For MVP, implement only:

```text
MASTER PROMPT
    +
3 SPECIALIZED PROMPTS
    +
7 PARAMETERS
    +
PROMPT COMPOSER
    +
STRUCTURED OUTPUT
```

Specifically:

```text
1. Master Prompt
2. Unique Fact
3. Storytelling
4. Education
5. Topic
6. Duration
7. Tone
8. Audience
9. Intensity
10. CTA
11. JSON output
```

Do the Quality Evaluator in Phase 2.

---

# 28. Final Architecture

The desired final system:

```text
                       ┌─────────────────┐
                       │   USER TOPIC    │
                       └────────┬────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ PRESET SELECTOR │
                       └────────┬────────┘
                                │
               ┌────────────────┴────────────────┐
               │                                 │
               ▼                                 ▼
       ┌───────────────┐                 ┌────────────────┐
       │ MASTER PROMPT │                 │ SPECIALIZED    │
       │               │                 │ PROMPT         │
       │ Global rules  │                 │ Category rules │
       └───────┬───────┘                 └───────┬────────┘
               │                                 │
               └────────────────┬────────────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │ CONTENT PARAMETERS  │
                     │                     │
                     │ duration            │
                     │ tone                │
                     │ audience            │
                     │ intensity           │
                     │ CTA                 │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │  PROMPT COMPOSER    │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │   SCRIPT GENERATOR  │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │ QUALITY EVALUATOR   │
                     └──────────┬──────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                  PASS                    FAIL
                    │                       │
                    ▼                       ▼
              FINAL SCRIPT              REWRITE
                                            │
                                            └──→ EVALUATOR
```

---

# 29. Success Criteria

The implementation is considered successful when:

- New content categories can be added without modifying the Master Prompt.
- Prompt behavior can be versioned independently.
- The same topic can generate different styles through presets.
- Scripts sound natural when converted to TTS.
- Scripts do not consistently use identical hooks or CTAs.
- Scripts fit the requested duration.
- Scripts have clear hooks and payoffs.
- Generated output can directly feed the video-generation pipeline.
- Prompt quality can be measured using a repeatable benchmark.

The key principle is:

> **Master Prompt defines how the AI writes. Specialized Prompt defines how the AI thinks about a specific type of content. Preset defines the style and parameters.**