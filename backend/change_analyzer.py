import json
from pathlib import Path


CHANGE_FILE = (
    Path(__file__).parent.parent
    / "configs"
    / "change.json"
)


def load_change():
    if not CHANGE_FILE.exists():
        raise FileNotFoundError(
            f"Change file not found: {CHANGE_FILE}"
        )

    with open(
        CHANGE_FILE,
        "r",
        encoding="utf-8",
    ) as file:
        return json.load(file)


def analyze_change(change):
    current = change["current_state"]
    proposed = change["proposed_state"]

    differences = []

    for key in sorted(
        set(current.keys()) | set(proposed.keys())
    ):
        current_value = current.get(key)
        proposed_value = proposed.get(key)

        if current_value != proposed_value:
            differences.append(
                {
                    "parameter": key,
                    "current": current_value,
                    "proposed": proposed_value,
                }
            )

    risk_factors = []

    for difference in differences:
        parameter = difference["parameter"]

        if parameter == "max_tokens":
            if (
                isinstance(difference["current"], int)
                and isinstance(difference["proposed"], int)
                and difference["proposed"]
                > difference["current"]
            ):
                risk_factors.append(
                    "Increasing max_tokens may increase "
                    "generation latency and resource usage."
                )

        elif parameter == "temperature":
            risk_factors.append(
                "Changing temperature can alter model "
                "output behavior and reproducibility."
            )

        elif parameter == "model":
            risk_factors.append(
                "Changing the model may significantly "
                "alter latency, throughput, and behavior."
            )

        else:
            risk_factors.append(
                f"Parameter '{parameter}' changed and "
                "requires experimental validation."
            )

    if not differences:
        risk_level = "LOW"
    elif len(differences) == 1:
        risk_level = "MEDIUM"
    else:
        risk_level = "HIGH"

    return {
        "change_id": change["change_id"],
        "title": change["title"],
        "component": change["component"],
        "target": change["target"],
        "risk_level": risk_level,
        "changes": differences,
        "risk_factors": risk_factors,
        "requires_experiment": bool(differences),
    }


def main():
    change = load_change()

    analysis = analyze_change(change)

    print("=" * 64)
    print("                 PRELIGHT")
    print("             CHANGE ANALYZER")
    print("=" * 64)
    print()

    print(
        f"Change ID:  {analysis['change_id']}"
    )

    print(
        f"Title:      {analysis['title']}"
    )

    print(
        f"Component:  {analysis['component']}"
    )

    print(
        f"Risk level: {analysis['risk_level']}"
    )

    print()

    print("PROPOSED CHANGES")
    print("-" * 64)

    for change in analysis["changes"]:
        print(
            f"{change['parameter']}: "
            f"{change['current']} -> "
            f"{change['proposed']}"
        )

    print()

    print("RISK FACTORS")
    print("-" * 64)

    for risk in analysis["risk_factors"]:
        print(f"- {risk}")

    print()

    print(
        f"Experiment required: "
        f"{analysis['requires_experiment']}"
    )

    print()
    print("=" * 64)

    output_file = (
        Path(__file__).parent.parent
        / "experiments"
        / "change_analysis.json"
    )

    with open(
        output_file,
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            analysis,
            file,
            indent=2,
        )

    print(
        f"Analysis saved to: {output_file}"
    )


if __name__ == "__main__":
    main()