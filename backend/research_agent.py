import json
import os
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

def build_queries(change: dict, analysis: dict):
    proposed_state = change.get("proposed_state", {})
    current_state = change.get("current_state", {})

    model = proposed_state.get("model", current_state.get("model"))
    max_tokens = proposed_state.get("max_tokens")
    temperature = proposed_state.get("temperature")

    queries = [
        (
            f"NVIDIA LLM inference max_tokens generation length "
            f"latency TTFT throughput GPU inference performance {model}"
        ),
        (
            f"NVIDIA inference serving longer generation output tokens "
            f"impact latency throughput GPU utilization"
        ),
        (
            f"NVIDIA Nemotron inference performance generation length "
            f"TTFT latency throughput"
        ),
        (
            f"NVIDIA NIM inference metrics TTFT latency throughput "
            f"output tokens generation performance"
        ),
    ]

    risk_factors = analysis.get("risk_factors", [])

    for risk in risk_factors[:2]:
        queries.append(
            f"NVIDIA AI inference {risk}"
        )

    return queries[:6]


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
            response = client.search(
                query=query,
                search_depth="advanced",
                max_results=5,
                include_answer=True,
                include_raw_content=False,
            )

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