import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.prelight_pipeline import run_pipeline


BASE_DIR = Path(__file__).resolve().parent.parent
EXPERIMENTS_DIR = BASE_DIR / "experiments"
RESULTS_DIR = EXPERIMENTS_DIR / "results"


app = FastAPI(
    title="Prelight API",
    description="Prelight AI infrastructure change-safety control plane",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ValidationRequest(BaseModel):
    max_tokens: int | None = None


def load_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default

    try:
        with open(path, "r", encoding="utf-8") as file:
            return json.load(file)
    except Exception:
        return default


def write_json(path: Path, payload: dict) -> None:
    with open(path, "w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2)
        file.write("\n")


def update_proposed_max_tokens(max_tokens: int | None) -> None:
    if max_tokens is None:
        return

    if max_tokens < 1:
        raise ValueError("max_tokens must be greater than 0")

    change_path = BASE_DIR / "configs" / "change.json"
    change = load_json(change_path, {})

    if not isinstance(change, dict):
        raise ValueError("Change config file is invalid")

    proposed = change.get("proposed_state")
    if not isinstance(proposed, dict):
        proposed = {}

    proposed["max_tokens"] = int(max_tokens)
    change["proposed_state"] = proposed
    write_json(change_path, change)


def get_change() -> dict:
    return load_json(
        BASE_DIR / "configs" / "change.json",
        {},
    )


def get_change_analysis() -> dict:
    return load_json(
        EXPERIMENTS_DIR / "change_analysis.json",
        {},
    )


def get_research_data() -> dict:
    data = load_json(
        EXPERIMENTS_DIR / "research_evidence.json",
        {},
    )

    if not isinstance(data, dict):
        return {}

    return data


def get_research_sources() -> list[dict]:
    data = get_research_data()

    evidence_groups = data.get("evidence", [])

    if not isinstance(evidence_groups, list):
        return []

    sources: list[dict] = []

    for group in evidence_groups:
        if not isinstance(group, dict):
            continue

        query = group.get("query", "")
        results = group.get("results", [])

        if not isinstance(results, list):
            continue

        for result in results:
            if not isinstance(result, dict):
                continue

            sources.append(
                {
                    "query": query,
                    "title": result.get("title", ""),
                    "url": result.get("url", ""),
                    "content": result.get("content", ""),
                    "score": result.get("score"),
                }
            )

    return sources


def get_research_queries() -> list[str]:
    data = get_research_data()

    queries = data.get("queries", [])

    if not isinstance(queries, list):
        return []

    cleaned: list[str] = []

    for query in queries:
        if isinstance(query, str):
            cleaned.append(query)
        elif isinstance(query, dict):
            value = query.get("query")

            if isinstance(value, str):
                cleaned.append(value)

    return cleaned


def get_research_assessment() -> dict:
    data = get_research_data()

    summary = data.get("summary", {})

    if not isinstance(summary, dict):
        summary = {}

    queries = get_research_queries()
    sources = get_research_sources()

    return {
        "available": bool(data),
        "queries_used": len(queries),
        "sources_used": len(sources),
        "summary": summary.get("summary", ""),
        "risk_mechanism": summary.get("risk_mechanism", ""),
        "research_conclusion": summary.get(
            "research_conclusion",
            "",
        ),
    }


def get_research_response() -> dict:
    data = get_research_data()

    queries = get_research_queries()
    sources = get_research_sources()
    assessment = get_research_assessment()

    return {
        "available": bool(data),
        "query_count": len(queries),
        "source_count": len(sources),
        "queries": queries,
        "sources": sources,
        "assessment": assessment,
    }


def get_decision() -> dict:
    return load_json(
        RESULTS_DIR / "latest_decision.json",
        {},
    )


def get_rollout() -> dict:
    return normalize_rollout(
        load_json(
            RESULTS_DIR / "rollout_plan.json",
            {},
        )
    )


def normalize_risk_policy(policy: Any) -> dict:
    if not isinstance(policy, dict):
        return {
            "warn_percent": 0,
            "block_percent": 0,
            "warn_threshold_percent": 0,
            "block_threshold_percent": 0,
        }

    warn_value = policy.get(
        "warn_percent",
        policy.get(
            "warn_threshold_percent",
            policy.get("warn", 0),
        ),
    )
    block_value = policy.get(
        "block_percent",
        policy.get(
            "block_threshold_percent",
            policy.get("block", 0),
        ),
    )

    def to_float(value: Any, default: float = 0.0) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    warn_percent = to_float(warn_value)
    block_percent = to_float(block_value)

    return {
        "warn_percent": warn_percent,
        "block_percent": block_percent,
        "warn_threshold_percent": warn_percent,
        "block_threshold_percent": block_percent,
    }


def normalize_change(change: Any) -> dict:
    if not isinstance(change, dict):
        return {}

    normalized = dict(change)
    normalized["risk_policy"] = normalize_risk_policy(
        change.get("risk_policy")
    )

    return normalized


def normalize_decision(raw_decision: Any) -> dict:
    if not isinstance(raw_decision, dict):
        return {}

    decision_block = raw_decision.get("decision")
    if not isinstance(decision_block, dict):
        decision_block = {}

    normalized = dict(decision_block)

    for key in ("status", "reason", "recommendation"):
        if key not in normalized and key in raw_decision:
            normalized[key] = raw_decision[key]

    normalized["baseline_metrics"] = raw_decision.get("baseline", {})
    normalized["candidate_metrics"] = raw_decision.get("candidate", {})
    normalized["comparison"] = raw_decision.get("comparison", {})
    normalized["triggered_rules"] = raw_decision.get("triggered_rules", [])
    normalized["evidence_chain"] = raw_decision.get("evidence_chain", [])

    external_research = raw_decision.get("external_research")

    if isinstance(external_research, dict):
        cleaned_external = dict(external_research)
        cleaned_external.pop("raw_response", None)
        cleaned_external.pop("reasoning", None)
        cleaned_external.pop("thinking", None)
        normalized["external_research"] = cleaned_external

    return normalized


def normalize_rollout(raw_rollout: Any) -> dict:
    if not isinstance(raw_rollout, dict):
        return {}

    normalized = dict(raw_rollout)
    normalized["steps"] = normalized.get("steps", [])
    if not isinstance(normalized["steps"], list):
        normalized["steps"] = []

    measured_regressions = normalized.get("measured_regressions", [])
    if isinstance(measured_regressions, dict):
        normalized["measured_regressions"] = [
            {
                "description": (
                    f"{key.replace('_', ' ').title()}: {value}"
                )
            }
            for key, value in measured_regressions.items()
        ]
    elif not isinstance(measured_regressions, list):
        normalized["measured_regressions"] = []

    normalized["policy"] = normalized.get(
        "policy",
        normalized.get("rollout_policy", ""),
    )

    return normalized


def get_clean_decision(decision: dict) -> dict:
    return normalize_decision(decision)


@app.get("/")
def root():
    return {
        "name": "Prelight",
        "status": "operational",
        "version": "1.0.0",
    }


@app.get("/api/change")
def api_change():
    return normalize_change(get_change())


@app.get("/api/analysis")
def api_analysis():
    return get_change_analysis()


@app.get("/api/research")
def api_research():
    return get_research_response()


@app.get("/api/decision")
def api_decision():
    return get_clean_decision(get_decision())


@app.get("/api/rollout")
def api_rollout():
    return get_rollout()


@app.post("/api/validate")
def api_validate(request: ValidationRequest):
    try:
        update_proposed_max_tokens(request.max_tokens)
        result = run_pipeline()
        return {
            "success": True,
            "message": "Prelight validation completed.",
            "result": result,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - surfaced to API caller
        raise HTTPException(
            status_code=500,
            detail=f"Prelight validation failed: {exc}",
        ) from exc


@app.get("/api/state")
def api_state():
    change = normalize_change(get_change())
    analysis = get_change_analysis()
    research = get_research_response()
    research_assessment = get_research_assessment()
    decision = get_clean_decision(get_decision())
    rollout = get_rollout()

    return {
        "change": change,
        "analysis": {
            "risk_level": analysis.get("risk_level", "UNKNOWN"),
            "change_summary": analysis.get("title", "")
            or analysis.get("description", ""),
            "risk_factors": analysis.get("risk_factors", []),
            "requires_experiment": bool(
                analysis.get("requires_experiment", False)
            ),
        },
        "research": {
            "available": research["available"],
            "query_count": research["query_count"],
            "source_count": research["source_count"],
        },
        "research_assessment": research_assessment,
        "decision": decision,
        "rollout": rollout,
    }
