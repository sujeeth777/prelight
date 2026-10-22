import json
import os
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from tavily import TavilyClient


# ------------------------------------------------------------
# Paths
# ------------------------------------------------------------

ROOT_DIR = Path(__file__).resolve().parent.parent
CHANGE_FILE = ROOT_DIR / "configs" / "change.json"
ANALYSIS_FILE = ROOT_DIR / "experiments" / "change_analysis.json"
OUTPUT_FILE = ROOT_DIR / "experiments" / "research_evidence.json"


# ------------------------------------------------------------
# Environment
# ------------------------------------------------------------

load_dotenv(ROOT_DIR / ".env")

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

if not TAVILY_API_KEY:
    raise RuntimeError(
        "TAVILY_API_KEY was not found.\n"
        "Make sure your .env file contains:\n\n"
        "TAVILY_API_KEY=your_key_here"
    )


SEARCH_ATTEMPTS = 3


# ------------------------------------------------------------
# Load project data
# ------------------------------------------------------------

def load_json(path: Path):
    if not path.exists():
        raise FileNotFoundError(f"Required file not found: {path}")

    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


# ------------------------------------------------------------
# Build research queries
# ------------------------------------------------------------

PARAMETER_QUERIES = {
    "max_tokens": [
        "LLM inference max_tokens output length impact on latency and throughput",
        "longer generation output tokens effect on time to first token and tail latency",
    ],
    "temperature": [
        "LLM sampling temperature effect on output length, latency and reproducibility",
        "temperature sampling effect on generation behavior in LLM inference serving",
    ],
    "top_p": [
        "LLM top_p nucleus sampling effect on output length and inference latency",
        "nucleus sampling top_p effect on response variability and generation cost",
    ],
    "model": [
        "{current} versus {proposed} inference latency throughput comparison",
        "switching LLM model effect on time to first token, latency and cost per token",
    ],
}


def build_queries(change: dict, analysis: dict):
    """Build research queries from the parameters that actually changed."""
    current_state = change.get("current_state", {})
    proposed_state = change.get("proposed_state", {})
    model = proposed_state.get("model", current_state.get("model"))

    changed = [
        item.get("parameter")
        for item in analysis.get("changes", [])
        if isinstance(item, dict)
    ] or [
        key
        for key in sorted(set(current_state) | set(proposed_state))
        if current_state.get(key) != proposed_state.get(key)
    ]

    queries = [
        f"NVIDIA Nemotron inference performance TTFT latency throughput {model}"
    ]

    for parameter in changed:
        for template in PARAMETER_QUERIES.get(parameter, []):
            queries.append(
                "NVIDIA "
                + template.format(
                    current=current_state.get("model"),
                    proposed=proposed_state.get("model"),
                )
            )

    if len(queries) == 1:
        queries += [
            "NVIDIA inference serving generation configuration impact on latency",
            "NVIDIA NIM inference metrics TTFT latency throughput generation performance",
        ]

    for risk in analysis.get("risk_factors", [])[:1]:
        queries.append(f"NVIDIA AI inference {risk}")

    return list(dict.fromkeys(queries))[:6]


# ------------------------------------------------------------
# Run Tavily research
# ------------------------------------------------------------

def run_research(queries):
    client = TavilyClient(api_key=TAVILY_API_KEY)

    evidence = []

    print("\n==========================================")
    print("        PRELIGHT - TAVILY RESEARCH")
    print("==========================================")

    for index, query in enumerate(queries, start=1):
        print(f"\nResearch query {index}/{len(queries)}")
        print(f"> {query}")

        try:
            response = None
            last_error = None
            for attempt in range(1, SEARCH_ATTEMPTS + 1):
                try:
                    response = client.search(
                        query=query,
                        search_depth="advanced",
                        max_results=5,
                        include_answer=True,
                        include_raw_content=False,
                    )
                    break
                except Exception as retry_exc:  # noqa: BLE001
                    last_error = retry_exc
                    print(f"  Attempt {attempt}/{SEARCH_ATTEMPTS} failed: {retry_exc}")
                    if attempt < SEARCH_ATTEMPTS:
                        time.sleep(2 * attempt)
            if response is None:
                raise last_error  # type: ignore[misc]

            answer = response.get("answer")

            results = []

            for result in response.get("results", []):
                results.append(
                    {
                        "title": result.get("title"),
                        "url": result.get("url"),
                        "content": result.get("content"),
                        "score": result.get("score"),
                    }
                )

            evidence.append(
                {
                    "query": query,
                    "answer": answer,
                    "results": results,
                }
            )

            print(f"  Sources found: {len(results)}")

        except Exception as exc:
            print(f"  Research failed: {exc}")

            evidence.append(
                {
                    "query": query,
                    "answer": None,
                    "results": [],
                    "error": str(exc),
                }
            )

    return evidence


# ------------------------------------------------------------
# Extract useful evidence
# ------------------------------------------------------------

def build_summary(change, analysis, evidence):
    source_count = sum(
        len(item.get("results", []))
        for item in evidence
    )

    answers = []

    for item in evidence:
        answer = item.get("answer")

        if answer:
            answers.append(answer)

    return {
        "research_purpose": (
            "Determine whether external technical evidence supports "
            "the identified risks of the proposed infrastructure change."
        ),
        "change_id": change.get("change_id"),
        "risk_level": analysis.get("risk_level"),
        "source_count": source_count,
        "research_answers": answers,
        "research_queries": [
            item.get("query")
            for item in evidence
        ],
    }


# ------------------------------------------------------------
# Save research artifact
# ------------------------------------------------------------

def save_results(change, analysis, queries, evidence):
    artifact = {
        "artifact": "prelight_research_evidence",
        "version": "1.0",
        "generated_at": datetime.now().isoformat(),

        "change": {
            "change_id": change.get("change_id"),
            "title": change.get("title"),
            "component": change.get("component"),
            "description": change.get("description"),
            "current_state": change.get("current_state"),
            "proposed_state": change.get("proposed_state"),
        },

        "analysis": {
            "risk_level": analysis.get("risk_level"),
            "risk_factors": analysis.get("risk_factors", []),
            "experiment_required": analysis.get(
                "experiment_required",
                True
            ),
        },

        "queries": queries,

        "evidence": evidence,

        "summary": build_summary(
            change,
            analysis,
            evidence,
        ),
    }

    OUTPUT_FILE.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with open(
        OUTPUT_FILE,
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            artifact,
            file,
            indent=2,
            ensure_ascii=False,
        )

    return artifact


# ------------------------------------------------------------
# Main
# ------------------------------------------------------------

def main():
    print("Loading Prelight change information...")

    change = load_json(CHANGE_FILE)
    analysis = load_json(ANALYSIS_FILE)

    print(f"Change ID: {change.get('change_id')}")
    print(f"Risk level: {analysis.get('risk_level')}")

    queries = build_queries(
        change,
        analysis,
    )

    evidence = run_research(queries)

    artifact = save_results(
        change,
        analysis,
        queries,
        evidence,
    )

    sources = artifact["summary"]["source_count"]
    errors = [item["error"] for item in evidence if item.get("error")]
    if sources == 0:
        print("\n!!! WARNING: Tavily returned 0 sources. !!!")
        for error in errors[:3]:
            print(f"    Tavily error: {error}")
        print("    Check TAVILY_API_KEY, your Tavily quota and network access.")
        print("    The decision will rely on measurements only.")
        if os.getenv("PRELIGHT_REQUIRE_RESEARCH") == "1":
            raise RuntimeError(
                "Research returned no sources and PRELIGHT_REQUIRE_RESEARCH=1."
            )

    print("\n==========================================")
    print("        RESEARCH COMPLETE")
    print("==========================================")
    print(
        f"Change ID: {artifact['change']['change_id']}"
    )
    print(
        f"Sources collected: "
        f"{artifact['summary']['source_count']}"
    )
    print(
        f"Research artifact:\n{OUTPUT_FILE}"
    )
    print("==========================================")


if __name__ == "__main__":
    main()