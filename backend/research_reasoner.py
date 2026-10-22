import json
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI


# ============================================================
# PRELIGHT - RESEARCH REASONER
# ============================================================

ROOT = Path(__file__).resolve().parent.parent

CHANGE_FILE = ROOT / "configs" / "change.json"
ANALYSIS_FILE = ROOT / "experiments" / "change_analysis.json"
RESEARCH_FILE = ROOT / "experiments" / "research_evidence.json"

ASSESSMENT_FILE = ROOT / "experiments" / "research_assessment.json"
RAW_FILE = ROOT / "experiments" / "research_reasoning_raw.txt"


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv(ROOT / ".env")

api_key = os.getenv("NEBIUS_API_KEY")

if not api_key:
    raise RuntimeError(
        "NEBIUS_API_KEY was not found in .env"
    )

client = OpenAI(
    api_key=api_key,
    base_url="https://api.tokenfactory.nebius.com/v1/",
)

MODEL = os.environ.get("PRELIGHT_REASONING_MODEL", "nvidia/Nemotron-3_5-Lightning")


# ============================================================
# HELPERS
# ============================================================

def load_json(path):
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def clean_text(value, limit=500):
    if value is None:
        return ""

    text = " ".join(str(value).split())

    if len(text) > limit:
        return text[:limit] + "..."

    return text


def find_research_entries(data):
    """
    Find Tavily query objects regardless of the exact
    top-level structure used in research_evidence.json.
    """

    entries = []

    def walk(value):
        if isinstance(value, dict):

            if (
                "query" in value
                and (
                    "answer" in value
                    or "sources" in value
                    or "results" in value
                )
            ):
                entries.append(value)

            for child in value.values():
                walk(child)

        elif isinstance(value, list):

            for item in value:
                walk(item)

    walk(data)

    return entries


def get_sources(entry):
    sources = entry.get("sources")

    if isinstance(sources, list):
        return sources

    results = entry.get("results")

    if isinstance(results, list):
        return results

    return []


def build_compact_evidence(entries):
    """
    Only send concise research evidence to Nemotron.
    """

    sections = []

    for index, entry in enumerate(entries, start=1):

        query = clean_text(
            entry.get("query", ""),
            250,
        )

        answer = clean_text(
            entry.get("answer", ""),
            600,
        )

        section = [
            f"RESEARCH {index}",
            f"Query: {query}",
        ]

        if answer:
            section.append(
                f"Tavily answer: {answer}"
            )

        sources = get_sources(entry)

        for source in sources[:2]:

            if not isinstance(source, dict):
                continue

            title = clean_text(
                source.get("title", ""),
                150,
            )

            content = clean_text(
                source.get("content", ""),
                350,
            )

            section.append(
                f"Source: {title}"
            )

            section.append(
                f"Evidence: {content}"
            )

        sections.append(
            "\n".join(section)
        )

    return "\n\n".join(sections)


# ============================================================
# LOAD PROJECT DATA
# ============================================================

print("Loading Prelight research evidence...")

change = load_json(CHANGE_FILE)
analysis = load_json(ANALYSIS_FILE)
research = load_json(RESEARCH_FILE)

change_id = change.get(
    "change_id",
    "UNKNOWN",
)

risk_level = analysis.get(
    "risk_level",
    "UNKNOWN",
)

research_entries = find_research_entries(
    research
)

source_count = sum(
    len(get_sources(entry))
    for entry in research_entries
)

print(f"Change ID: {change_id}")
print(
    f"Research queries found: "
    f"{len(research_entries)}"
)
print(
    f"Research sources found: "
    f"{source_count}"
)


if not research_entries:
    raise RuntimeError(
        "No Tavily research entries were found."
    )


evidence = build_compact_evidence(
    research_entries
)

if source_count == 0:
    print(
        "\n!!! No external sources were collected. Skipping the "
        "Nemotron research assessment instead of inventing one. !!!\n"
    )
    raw_output = (
        "EVIDENCE_STRENGTH:\nNONE\n\n"
        "RISK_MECHANISM:\nNo external research was available.\n\n"
        "SUPPORTED_RISKS:\nNone established by external sources.\n\n"
        "METRICS:\nMean and P95 TTFT, mean and P95 latency, error rate.\n\n"
        "EXPERIMENT:\nRun the paired baseline/candidate experiment.\n\n"
        "CONCLUSION:\nNo external evidence was collected. "
        "The decision must rest on the measured experiment alone."
    )
    RAW_FILE.write_text(raw_output, encoding="utf-8")
    with ASSESSMENT_FILE.open("w", encoding="utf-8") as file:
        json.dump(
            {
                "change_id": change_id,
                "model": None,
                "risk_level": risk_level,
                "research_queries_used": len(research_entries),
                "research_sources_used": 0,
                "assessment": raw_output,
                "role": (
                    "External research assessment only. "
                    "Does not override deterministic experiment safety rules."
                ),
            },
            file,
            indent=2,
        )
    raise SystemExit(0)


# ============================================================
# NEMOTRON REASONING
# ============================================================

current_state = change.get(
    "current_state",
    {}
)

proposed_state = change.get(
    "proposed_state",
    {}

)

risk_factors = analysis.get(
    "risk_factors",
    []
)


prompt = f"""
You are Prelight's external research assessment engine.

Assess ONLY whether the supplied research supports the
risk mechanism of the proposed infrastructure change.

Do not make a SAFE/WARN/BLOCK decision.

Do not describe your reasoning process.

Return ONLY these six fields:

EVIDENCE_STRENGTH:
One word: STRONG, MODERATE, or WEAK.

RISK_MECHANISM:
One short sentence.

SUPPORTED_RISKS:
One short sentence containing the main supported risks.

METRICS:
One short sentence listing the most important metrics to validate.

EXPERIMENT:
One short sentence describing the controlled experiment required.

CONCLUSION:
Exactly two short sentences.

==================================================
CHANGE
==================================================

Change:
{change.get("title", "")}

Component:
{change.get("component", "")}

Risk level:
{risk_level}

Current:
{json.dumps(current_state)}

Proposed:
{json.dumps(proposed_state)}

Known risk factors:
{json.dumps(risk_factors)}

==================================================
EXTERNAL RESEARCH
==================================================

{evidence}

==================================================
IMPORTANT
==================================================

Research is supporting evidence, not proof.

The final Prelight safety decision must be based on
actual experiment measurements.

Keep the response concise.
"""


print("\nSending compact research assessment to Nemotron...\n")


response = client.chat.completions.create(
    model=MODEL,
    messages=[
        {
            "role": "system",
            "content": (
                "You are a concise technical research "
                "assessment engine. Never output a "
                "thinking process."
            ),
        },
        {
            "role": "user",
            "content": prompt,
        },
    ],
    max_tokens=500,
    temperature=0.0,
)


raw_output = (
    response.choices[0].message.content
    or ""
).strip()


# ============================================================
# SAVE RAW RESPONSE
# ============================================================

RAW_FILE.write_text(
    raw_output,
    encoding="utf-8",
)


# ============================================================
# STRUCTURED PRELIGHT ASSESSMENT
# ============================================================

assessment = {
    "change_id": change_id,
    "model": MODEL,
    "risk_level": risk_level,
    "research_queries_used": len(
        research_entries
    ),
    "research_sources_used": source_count,
    "assessment": raw_output,
    "role": (
        "External research assessment only. "
        "Does not override deterministic "
        "experiment safety rules."
    ),
}


with ASSESSMENT_FILE.open(
    "w",
    encoding="utf-8",
) as file:

    json.dump(
        assessment,
        file,
        indent=2,
    )


# ============================================================
# OUTPUT
# ============================================================

print("==========================================")
print("        PRELIGHT - RESEARCH ASSESSMENT")
print("==========================================")
print(raw_output)
print("==========================================")
print()
print("Research queries used:")
print(len(research_entries))
print()
print("Research sources used:")
print(source_count)
print()
print("Assessment saved to:")
print(ASSESSMENT_FILE)
print()
print("Raw response saved to:")
print(RAW_FILE)
print("==========================================")