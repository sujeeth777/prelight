# Prelight

### Before you change an AI factory, Prelight proves whether the change is safe.

Prelight is an AI infrastructure change-safety system that evaluates proposed changes to NVIDIA-powered AI workloads **before they reach production**.

Instead of waiting for an infrastructure change to cause an incident, Prelight researches the change, designs a controlled experiment, measures the real workload, compares the proposed configuration against a known baseline, and produces a **SAFE / WARN / BLOCK** decision with a rollout recommendation.

## The Problem

AI infrastructure changes can look harmless while affecting inference latency, throughput, resource usage, reliability, or operational behavior.

Traditional monitoring answers:

> "Is something broken?"

Prelight asks a different question:

> **"Will this proposed change be safe before we deploy it?"**

## How Prelight Works

```text
PROPOSED CHANGE
       ↓
CHANGE ANALYSIS
       ↓
EXTERNAL RESEARCH
       ↓
EXPERIMENT PLAN
       ↓
CONTROLLED BASELINE
       ↓
CANDIDATE EXPERIMENT
       ↓
MEASURED COMPARISON
       ↓
SAFETY DECISION
       ↓
ROLLOUT PLAN
```

The core workflow is:

**CHANGE → PREDICT → RESEARCH → EXPERIMENT → PROVE → ROLLOUT**

## Example

A proposed inference configuration changes:

```text
max_tokens: 300 → 500
```

Prelight does not simply assume the change is safe.

It:

1. analyzes the proposed configuration change;
2. researches relevant inference-performance considerations;
3. establishes a controlled baseline;
4. executes the candidate configuration against the real inference service;
5. measures TTFT, latency, throughput, and errors;
6. compares the candidate against the baseline;
7. applies explicit safety thresholds;
8. produces a final decision;
9. generates a rollout recommendation.

For the current validation scenario, the measured candidate showed significant latency regression, resulting in:

```text
DECISION: BLOCK
ACTION: DO_NOT_ROLLOUT
```

## NVIDIA + Nebius

Prelight uses NVIDIA and Nebius as part of its actual runtime workflow rather than as superficial integrations.

### NVIDIA

Prelight uses **NVIDIA Nemotron** as its reasoning model.

Nemotron is used for tasks including:

- change reasoning;
- research interpretation;
- experiment planning;
- evidence interpretation;
- decision support.

### Nebius

Prelight uses **Nebius Token Factory** to access the NVIDIA Nemotron model through its inference API.

The controlled experiments execute real inference requests against the Nebius-hosted NVIDIA model and collect measured performance data.

This makes the validation loop an actual experiment rather than a simulated benchmark.

## Technology Stack

### AI

- NVIDIA Nemotron
- Nebius Token Factory
- Tavily for external technical research

### Backend

- Python
- FastAPI
- OpenAI-compatible Nebius API
- Controlled inference experiments

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS

### Validation

- TTFT
- P50 / P95 latency
- Output throughput
- Error rate
- Baseline vs candidate comparison
- Explicit safety thresholds

## Architecture

```text
                    ┌─────────────────────┐
                    │       USER          │
                    │ Proposed Change     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    PRELIGHT API     │
                    └──────────┬──────────┘
                               │
                ┌──────────────┼──────────────┐
                ▼              ▼              ▼
        ┌──────────────┐ ┌─────────────┐ ┌──────────────┐
        │    Change    │ │   Tavily    │ │  Nemotron    │
        │   Analyzer   │ │  Research   │ │   Reasoning  │
        └──────┬───────┘ └──────┬──────┘ └──────┬───────┘
               │                │               │
               └────────────────┼───────────────┘
                                ▼
                     ┌────────────────────┐
                     │ Experiment Planner │
                     └──────────┬─────────┘
                                │
                                ▼
                     ┌────────────────────┐
                     │ Nebius Token       │
                     │ Factory            │
                     │ NVIDIA Nemotron    │
                     └──────────┬─────────┘
                                │
                                ▼
                     ┌────────────────────┐
                     │ Experiment Metrics │
                     │ TTFT / Latency     │
                     │ Throughput / Errors│
                     └──────────┬─────────┘
                                │
                                ▼
                     ┌────────────────────┐
                     │ Comparison Engine  │
                     └──────────┬─────────┘
                                │
                                ▼
                     ┌────────────────────┐
                     │ Safety Decision    │
                     │ SAFE / WARN / BLOCK│
                     └──────────┬─────────┘
                                │
                                ▼
                     ┌────────────────────┐
                     │ Rollout Planner    │
                     └────────────────────┘
```

## Repository Structure

```text
Prelight/
│
├── backend/
│   ├── api.py
│   ├── change_analyzer.py
│   ├── comparison_engine.py
│   ├── decision_engine.py
│   ├── nebius_test.py
│   ├── nemotron_planner.py
│   ├── pr_check.py
│   ├── prelight_pipeline.py
│   ├── research_agent.py
│   └── research_reasoner.py
│
├── configs/
│   └── change.json
│
├── experiments/
│   ├── runner.py
│   ├── candidate_runner.py
│   └── results/
│
├── frontend/
│   └── app/
│       ├── page.tsx            # landing page
│       └── dashboard/          # control-plane UI (one module per page)
│
├── .github/workflows/          # Prelight PR safety check
├── tests/
│
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

## Running Prelight Locally

### 1. Clone the repository

```bash
git clone <YOUR_REPOSITORY_URL>
cd Prelight
```

### 2. Create a Python environment

Windows:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### 3. Install backend dependencies

```powershell
pip install openai python-dotenv tavily-python fastapi uvicorn
```

### 4. Configure environment variables

Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

Add your own API keys:

```env
NEBIUS_API_KEY=your_nebius_api_key
TAVILY_API_KEY=your_tavily_api_key
```

**Never commit `.env` to Git.**

### 5. Start the backend

From the project root:

```powershell
uvicorn backend.api:app --reload
```

The API will be available at:

```text
http://127.0.0.1:8000
```

API documentation:

```text
http://127.0.0.1:8000/docs
```

### 6. Start the frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

The landing page is at `http://localhost:3000` and the control plane is at
`http://localhost:3000/dashboard`.

To point the dashboard at a backend running elsewhere, create
`frontend/.env.local` and set:

```env
NEXT_PUBLIC_PRELIGHT_API_URL=http://127.0.0.1:8000
```

The boundary explorer runs five paired baseline/candidate rounds for each
tested token value, matching the standard validation policy. A scan can test
up to 12 values from 1 to 4096 tokens and may use substantially more inference
requests than a single validation.

## Safety Decision

Prelight currently evaluates measured changes using explicit policy thresholds.

Example policy:

```text
Latency regression > 10%  → WARN
Latency regression > 20%  → BLOCK

Error rate ≥ 1%           → WARN
Error rate ≥ 5%           → BLOCK
```

The decision engine combines measured experiment results with the configured safety policy to produce a deterministic rollout decision.

Each **Validate Change** run executes five paired baseline/candidate rounds
against the same workload. The first arm is randomized, then the order
alternates between rounds to reduce order and provider-drift bias. Results are
paired by round and checked for matching model, workload fingerprint, and
request IDs.

Prelight calculates two-sided 95% Student's *t* confidence intervals for the
paired percentage changes in mean and P95 TTFT and latency. A result is SAFE
only when every interval's upper bound is at or below the warning threshold.
An interval that crosses the warning threshold produces WARN. Fewer than five
complete pairs, any failed request, or invalid/mismatched evidence produces
BLOCK.

The current workload has nine prompts, so a full validation makes up to 90
benchmark inference requests, in addition to change analysis and research.
Runs take longer and consume more Nebius and Tavily credits than a single
candidate experiment. Per-round artifacts and the confidence ranges are
available in the results directory and dashboard.

## Design Principle

Prelight is intentionally different from a traditional monitoring or incident-response system.

Traditional approach:

```text
CHANGE
  ↓
DEPLOY
  ↓
SOMETHING BREAKS
  ↓
INVESTIGATE
  ↓
FIX
```

Prelight:

```text
PROPOSE CHANGE
      ↓
INVESTIGATE
      ↓
EXPERIMENT
      ↓
MEASURE
      ↓
PROVE
      ↓
DEPLOY ONLY IF SAFE
```

The goal is to move infrastructure safety **before deployment rather than after failure**.

## Hackathon

Built for the **Nebius × NVIDIA Global AI Hackathon 2026**.

Track:

**Best Apps and Agents**

The project uses:

- Nebius Token Factory
- NVIDIA Nemotron
- Nebius AI infrastructure
- Tavily research
- real inference experiments

## License

This project is open source under the license included in this repository.
## A/A noise control

Hosted inference timings vary from run to run. Prelight measures that noise by
running the current configuration against itself (`POST /api/aa-control`, or the
**Run A/A control** button on the Experiments page). The resulting noise floor is
drawn on the charts, and any regression smaller than it is labelled *within A/A
noise* rather than treated as a finding.

## Change types

The dashboard validates four kinds of change, each checked server-side:

| Parameter | Range | Notes |
|---|---|---|
| `max_tokens` | 1–4096 | Output length cap |
| `temperature` | 0–2 | Sampling randomness |
| `top_p` | >0–1 | Optional; blank keeps the provider default |
| `model` | `nvidia/…` id | A different id runs a **model swap** |

The baseline run uses `current_state` from `configs/change.json` and the candidate
uses `proposed_state`, so any of these can be compared. For a model swap, paired
validation stays fail-closed: each side must use exactly the model the change
declares, otherwise the run is an evidence error and resolves to BLOCK.

The reasoning model used for planning and research can be changed with
`PRELIGHT_REASONING_MODEL` (for example a larger Nemotron for reasoning while the
workload under test stays on a smaller one).

## Pull-request safety check

`.github/workflows/prelight.yml` runs Prelight whenever a pull request changes
`configs/change.json`, posts the verdict as a PR comment, and fails the check on
BLOCK. Add `NEBIUS_API_KEY` and `TAVILY_API_KEY` as repository secrets. Preview
the comment locally without any API calls:

```powershell
python -m backend.pr_check --replay
```

## Models and services used

| Service | Used for |
|---|---|
| NVIDIA Nemotron on Nebius Token Factory | Change reasoning, experiment planning, research interpretation, and the inference workload being measured |
| Tavily | External research on the failure mechanism of each proposed change |
| FastAPI + Next.js | Control-plane API and dashboard |

## Feedback on Nebius Token Factory and NVIDIA tools

<!-- Fill in from your own experience before submitting. Devpost requires it,
and there is a Most Valuable Feedback prize. Cover: latency variance between
runs, rate limits, model availability, and what would make paired benchmarking
easier. -->

## What was built during the hackathon submission period

<!-- Confirm against your commit dates before submitting. -->

- Landing page and responsive, accessible control-plane dashboard
- A/A noise control, noise-aware thresholds, confidence-interval and boundary-curve charts
- `temperature`, `top_p` and model-swap change types, with server-side validation and a baseline that follows `current_state`
- GitHub Action PR safety check
- Consistent safe-boundary reporting, with stale scans flagged
