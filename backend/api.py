import json
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.paired_validation import MIN_PAIRED_ROUNDS, build_paired_decision
from backend.prelight_pipeline import paired_round_orders, run_pipeline


DEFAULT_BOUNDARY_VALUES = [300, 350, 400, 500]
MAX_BOUNDARY_VALUES = 12
EXPERIMENT_LOCK = Lock()
EXPERIMENT_STATUS_LOCK = Lock()
ACTIVE_EXPERIMENT: dict | None = None


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
        origin.strip()
        for origin in os.environ.get(
            "PRELIGHT_CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000",
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class ValidationRequest(BaseModel):
    max_tokens: int | None = Field(default=None, ge=1, le=4096)
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    top_p: float | None = Field(default=None, gt=0.0, le=1.0)
    model: str | None = Field(
        default=None, pattern=r"^nvidia/[A-Za-z0-9._-]{1,80}$"
    )


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


def update_proposed_state(
    max_tokens: int | None,
    temperature: float | None = None,
    top_p: float | None = None,
    model: str | None = None,
) -> None:
    if all(v is None for v in (max_tokens, temperature, top_p, model)):
        return

    if max_tokens is not None and max_tokens < 1:
        raise ValueError("max_tokens must be greater than 0")

    change_path = BASE_DIR / "configs" / "change.json"
    change = load_json(change_path, {})

    if not isinstance(change, dict):
        raise ValueError("Change config file is invalid")

    proposed = change.get("proposed_state")
    if not isinstance(proposed, dict):
        proposed = {}

    if max_tokens is not None:
        proposed["max_tokens"] = int(max_tokens)
    if temperature is not None:
        proposed["temperature"] = float(temperature)
    if top_p is not None:
        proposed["top_p"] = float(top_p)
    if model is not None:
        proposed["model"] = model
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
    assessment_data = load_json(
        EXPERIMENTS_DIR / "research_assessment.json",
        {},
    )
    if not isinstance(assessment_data, dict):
        assessment_data = {}

    summary = data.get("summary", {})

    if not isinstance(summary, dict):
        summary = {}

    assessment_text = assessment_data.get("assessment", "")
    assessment_fields = parse_research_assessment(
        assessment_text if isinstance(assessment_text, str) else ""
    )

    queries = get_research_queries()
    sources = get_research_sources()

    return {
        "available": bool(data) or bool(assessment_fields),
        "queries_used": len(queries),
        "sources_used": len(sources),
        "summary": assessment_fields.get(
            "SUPPORTED_RISKS",
            summary.get("summary") or summary.get("research_purpose", ""),
        ),
        "risk_mechanism": assessment_fields.get(
            "RISK_MECHANISM",
            summary.get("risk_mechanism", ""),
        ),
        "research_conclusion": assessment_fields.get(
            "CONCLUSION",
            summary.get("research_conclusion", ""),
        ),
        "evidence_strength": assessment_fields.get("EVIDENCE_STRENGTH", ""),
        "metrics": assessment_fields.get("METRICS", ""),
        "experiment": assessment_fields.get("EXPERIMENT", ""),
    }


def parse_research_assessment(text: str) -> dict[str, str]:
    field_names = (
        "EVIDENCE_STRENGTH",
        "RISK_MECHANISM",
        "SUPPORTED_RISKS",
        "METRICS",
        "EXPERIMENT",
        "CONCLUSION",
    )
    field_pattern = "|".join(field_names)
    fields = {}

    for field_name in field_names:
        match = re.search(
            rf"(?ims)^\s*{field_name}\s*:\s*(.*?)(?=^\s*(?:{field_pattern})\s*:|\Z)",
            text,
        )
        if match:
            value = " ".join(match.group(1).split())
            if value:
                fields[field_name] = value

    return fields


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
    normalized["uncertainty"] = raw_decision.get("uncertainty", {})
    normalized["experiment"] = raw_decision.get("experiment", {})
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


def begin_experiment(operation: str) -> bool:
    global ACTIVE_EXPERIMENT

    if not EXPERIMENT_LOCK.acquire(blocking=False):
        return False

    with EXPERIMENT_STATUS_LOCK:
        ACTIVE_EXPERIMENT = {
            "running": True,
            "operation": operation,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }
    return True


def end_experiment() -> None:
    global ACTIVE_EXPERIMENT

    with EXPERIMENT_STATUS_LOCK:
        ACTIVE_EXPERIMENT = None
    EXPERIMENT_LOCK.release()


def summarize_boundary(decisions: list[dict]) -> dict:
    if not decisions:
        return {
            "safe_operating_boundary": None,
            "status": "UNKNOWN",
            "summary": "No boundary data was produced.",
            "results": [],
        }

    safe_candidates: list[dict] = []
    for entry in decisions:
        status = str(
            (entry.get("status") or entry.get("decision", {}).get("status") or "UNKNOWN")
        ).upper()

        max_tokens = entry.get("max_tokens")
        if max_tokens is None:
            max_tokens = (
                entry.get("configuration", {}).get("max_tokens")
                if isinstance(entry.get("configuration"), dict)
                else None
            )

        if max_tokens is None:
            continue

        safe_candidates.append(
            {
                "max_tokens": int(max_tokens),
                "status": status,
                "analysis": entry,
            }
        )

    safe_candidates.sort(key=lambda item: item["max_tokens"])

    certified_safe = [
        candidate
        for candidate in safe_candidates
        if candidate["status"] == "SAFE"
    ]
    highest_safe = certified_safe[-1] if certified_safe else None
    boundary_value = highest_safe["max_tokens"] if highest_safe else None
    if highest_safe:
        boundary_status = "SAFE"
        boundary_summary = (
            f"The highest tested configuration classified SAFE was "
            f"{boundary_value} tokens. Higher tested values were not certified safe."
        )
    else:
        statuses = {candidate["status"] for candidate in safe_candidates}
        boundary_status = "WARN" if "WARN" in statuses else (
            "BLOCK" if statuses == {"BLOCK"} else "UNKNOWN"
        )
        boundary_summary = (
            "No tested configuration was certified SAFE. "
            f"Best available evidence status: {boundary_status}."
        )

    return {
        "safe_operating_boundary": boundary_value,
        "status": boundary_status,
        "summary": boundary_summary,
        "results": [
            {
                "max_tokens": candidate["max_tokens"],
                "status": candidate["status"],
                "analysis": candidate["analysis"],
            }
            for candidate in safe_candidates
        ],
    }


def noise_floor_from(result: dict | None) -> float | None:
    """Largest absolute paired change seen when a config is compared to
    itself (A/A). Regressions smaller than this cannot be told from noise."""
    if not isinstance(result, dict):
        return None
    comparison = result.get("comparison") or {}
    values = [
        abs(float(v))
        for k, v in comparison.items()
        if k.endswith("_change_percent") and isinstance(v, (int, float))
    ]
    return round(max(values), 2) if values else None


def get_aa_control() -> dict:
    payload = load_json(RESULTS_DIR / "aa_control.json", {})
    if not isinstance(payload, dict) or not payload.get("results"):
        return {"available": False, "noise_floor_percent": None}
    result = payload["results"][0]
    return {
        "available": True,
        "max_tokens": result.get("max_tokens"),
        "status": result.get("status"),
        "noise_floor_percent": noise_floor_from(result),
        "comparison": result.get("comparison", {}),
    }


def get_boundary_report() -> dict:
    boundary_file = RESULTS_DIR / "boundary_explorer.json"
    if not boundary_file.exists():
        return {
            "tested_values": DEFAULT_BOUNDARY_VALUES,
            "safe_operating_boundary": None,
            "summary": "No boundary scan has been run yet.",
            "status": "UNKNOWN",
            "results": [],
        }

    payload = load_json(boundary_file, {})
    if not isinstance(payload, dict):
        payload = {}

    results = payload.get("results", [])
    if not isinstance(results, list):
        results = []

    # Always derive the boundary from the results so the summary, status and
    # table can never disagree; flag scans that predate paired validation.
    report = summarize_boundary(results)
    stale = bool(results) and not any(
        isinstance(r, dict) and r.get("uncertainty") for r in results
    )
    current = (get_change().get("current_state") or {}).get("max_tokens")
    aa = get_aa_control()
    if aa["noise_floor_percent"] is None:
        aa_entry = next(
            (r for r in results if r.get("max_tokens") == current), None
        )
        aa["noise_floor_percent"] = noise_floor_from(aa_entry)
        aa["source"] = "boundary_scan" if aa_entry else None

    return {
        "tested_values": payload.get("tested_values", DEFAULT_BOUNDARY_VALUES),
        "safe_operating_boundary": report["safe_operating_boundary"],
        "summary": report["summary"],
        "status": report["status"],
        "results": results,
        "stale": stale,
        "noise_floor_percent": aa["noise_floor_percent"],
        "aa_control": aa,
    }


def _run_python_script(
    script_path: Path,
    environment: dict[str, str] | None = None,
) -> None:
    process_environment = os.environ.copy()
    if environment:
        process_environment.update(environment)

    result = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=str(BASE_DIR),
        env=process_environment,
        capture_output=False,
    )

    if result.returncode != 0:
        raise RuntimeError(f"Script failed: {script_path}")


def run_boundary_explorer(
    candidate_values: list[int] | None = None, persist: bool = True
) -> dict:
    requested_values = sorted(set(candidate_values or DEFAULT_BOUNDARY_VALUES))
    if not requested_values:
        requested_values = list(DEFAULT_BOUNDARY_VALUES)
    if any(value < 1 or value > 4096 for value in requested_values):
        raise ValueError("Boundary values must be between 1 and 4096 tokens.")
    if len(requested_values) > MAX_BOUNDARY_VALUES:
        raise ValueError(
            f"A boundary scan can test at most {MAX_BOUNDARY_VALUES} values."
        )

    change_path = BASE_DIR / "configs" / "change.json"
    change = load_json(change_path, {})
    if not isinstance(change, dict):
        raise ValueError("Change config file is invalid")

    boundary_results: list[dict] = []
    analysis = load_json(EXPERIMENTS_DIR / "change_analysis.json", {})
    research = load_json(EXPERIMENTS_DIR / "research_assessment.json", {})
    original_proposed_state = change.get("proposed_state", {})
    if not isinstance(original_proposed_state, dict):
        original_proposed_state = {}
    results_dir = RESULTS_DIR
    results_dir.mkdir(parents=True, exist_ok=True)

    try:
        for max_tokens in requested_values:
            change["proposed_state"] = {
                **original_proposed_state,
                "max_tokens": int(max_tokens),
            }
            write_json(change_path, change)

            pairs = []
            change_prefix = str(change.get("change_id", "UNKNOWN")).replace("-", "")
            for round_number, order in enumerate(
                paired_round_orders(),
                start=1,
            ):
                pair_id = f"boundary-{uuid.uuid4().hex[:12]}-round-{round_number:02d}"
                pair = {
                    "pair_id": pair_id,
                    "order": order,
                    "baseline_file": f"baseline_{pair_id}.json",
                    "candidate_file": f"candidate_{change_prefix}_{pair_id}.json",
                }
                roles = (
                    ("baseline", "candidate")
                    if order == "baseline_first"
                    else ("candidate", "baseline")
                )

                for role in roles:
                    script_name = (
                        "runner.py" if role == "baseline" else "candidate_runner.py"
                    )
                    script_path = BASE_DIR / "experiments" / script_name
                    result_path = results_dir / pair[f"{role}_file"]
                    try:
                        _run_python_script(
                            script_path,
                            {"PRELIGHT_PAIR_ID": pair_id},
                        )
                        pair[f"{role}_run"] = load_json(result_path)
                    except Exception as exc:
                        pair["stage_error"] = f"{role} stage failed: {exc}"
                        break

                pairs.append(pair)
                if pair.get("stage_error"):
                    break

            decision = build_paired_decision(
                change,
                analysis if isinstance(analysis, dict) else {},
                research if isinstance(research, dict) else {},
                pairs,
            )
            decision_block = decision["decision"]
            if any(pair.get("stage_error") for pair in pairs):
                decision_block["status"] = "BLOCK"
                decision_block["reason"] = (
                    "A boundary experiment stage failed; evidence is incomplete."
                )
                decision_block["recommendation"] = (
                    "Do not treat this configuration as safe; repeat the paired scan."
                )
                decision["triggered_rules"].extend(
                    pair["stage_error"]
                    for pair in pairs
                    if pair.get("stage_error")
                )

            candidate_result = {
                "max_tokens": int(max_tokens),
                "status": decision_block["status"],
                "decision": decision_block,
                "comparison": decision["comparison"],
                "baseline": decision["baseline"],
                "candidate": decision["candidate"],
                "uncertainty": decision["uncertainty"],
                "experiment": decision["experiment"],
                "triggered_rules": decision["triggered_rules"],
                "policy": decision["policy"],
            }
            boundary_results.append(candidate_result)

        report = summarize_boundary(boundary_results)
        boundary_status = report["status"]
        boundary_summary = report["summary"]
        record = {
            "tested_values": requested_values,
            "safe_operating_boundary": report["safe_operating_boundary"],
            "status": boundary_status,
            "summary": boundary_summary,
            "results": boundary_results,
        }
        if persist:
            write_json(RESULTS_DIR / "boundary_explorer.json", record)
        return record
    finally:
        change["proposed_state"] = original_proposed_state
        write_json(change_path, change)


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


@app.get("/api/experiment/status")
def api_experiment_status():
    with EXPERIMENT_STATUS_LOCK:
        if ACTIVE_EXPERIMENT is None:
            return {
                "running": False,
                "operation": None,
                "started_at": None,
            }
        return dict(ACTIVE_EXPERIMENT)


@app.post("/api/validate")
def api_validate(request: ValidationRequest):
    if not begin_experiment("validation"):
        raise HTTPException(
            status_code=409,
            detail="Another experiment is already running.",
        )

    try:
        try:
            update_proposed_state(
                request.max_tokens,
                request.temperature,
                request.top_p,
                request.model,
            )
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
    finally:
        end_experiment()


class BoundaryRequest(BaseModel):
    values: list[int] | None = Field(default=None, max_length=MAX_BOUNDARY_VALUES)


@app.post("/api/boundary")
def api_boundary(request: BoundaryRequest):
    if not begin_experiment("boundary_scan"):
        raise HTTPException(
            status_code=409,
            detail="Another experiment is already running.",
        )

    try:
        try:
            report = run_boundary_explorer(request.values)
            return {
                "success": True,
                "message": "Prelight safe-boundary scan completed.",
                "boundary": report,
            }
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:  # pragma: no cover - surfaced to API caller
            raise HTTPException(
                status_code=500,
                detail=f"Safe-boundary scan failed: {exc}",
            ) from exc
    finally:
        end_experiment()


@app.post("/api/aa-control")
def api_aa_control():
    """A/A control: run the current config against itself to measure noise."""
    if not begin_experiment("aa_control"):
        raise HTTPException(
            status_code=409, detail="Another experiment is already running."
        )
    try:
        current = (get_change().get("current_state") or {}).get("max_tokens")
        if not isinstance(current, int):
            raise HTTPException(status_code=400, detail="No current max_tokens.")
        record = run_boundary_explorer([current], persist=False)
        write_json(RESULTS_DIR / "aa_control.json", record)
        return {"success": True, "aa_control": get_aa_control()}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=500, detail=f"A/A control failed: {exc}"
        ) from exc
    finally:
        end_experiment()


@app.get("/api/state")
def api_state():
    change = normalize_change(get_change())
    analysis = get_change_analysis()
    research = get_research_response()
    research_assessment = get_research_assessment()
    decision = get_clean_decision(get_decision())
    rollout = get_rollout()
    boundary = get_boundary_report()

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
        "boundary": boundary,
    }
