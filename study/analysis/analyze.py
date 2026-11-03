#!/usr/bin/env python3
"""Exploratory paired summaries for validated local pilot exports; no inferential tests."""

import argparse
import csv
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ANSWER_KEY = json.loads((ROOT / "answer-key.json").read_text(encoding="utf-8"))["answerKey"]


def validate_session(session):
    required = {
        "schemaVersion",
        "protocolVersion",
        "participantId",
        "sessionId",
        "sourceCommit",
        "stimulusSeed",
        "stimulusVersion",
        "counterbalanceGroup",
        "status",
        "assignedOrder",
        "responses",
        "usability",
    }
    if not isinstance(session, dict) or not required.issubset(session):
        raise ValueError("Session is missing required schema fields.")
    if session["schemaVersion"] != 1 or session["protocolVersion"] != "draft-1":
        raise ValueError("Unsupported response schema or protocol version.")
    if session["status"] not in {"in_progress", "complete"}:
        raise ValueError("Invalid session status.")
    if (
        not isinstance(session["assignedOrder"], list)
        or len(session["assignedOrder"]) != 10
        or not all(isinstance(trial_id, str) for trial_id in session["assignedOrder"])
        or len(set(session["assignedOrder"])) != 10
    ):
        raise ValueError("Assigned trial order must contain ten unique trial IDs.")
    usability = session["usability"]
    if not isinstance(usability, dict) or not {
        "evidenceClarity",
        "conditionPreference",
        "easierCondition",
    }.issubset(usability):
        raise ValueError("Session is missing required usability responses.")
    if usability["evidenceClarity"] is not None and (
        type(usability["evidenceClarity"]) is not int
        or not 1 <= usability["evidenceClarity"] <= 5
    ):
        raise ValueError("Evidence clarity must be a rating from one to five.")
    if usability["conditionPreference"] not in {None, "baseline", "recommended", "no-preference"}:
        raise ValueError("Invalid condition preference.")
    if usability["easierCondition"] not in {None, "baseline", "recommended", "no-difference"}:
        raise ValueError("Invalid easier-condition response.")
    if not isinstance(session["responses"], list) or len(session["responses"]) > 10:
        raise ValueError("Session responses must be a list of at most ten trials.")
    seen = set()
    for index, trial in enumerate(session["responses"]):
        trial_fields = {
            "trialId",
            "trialIndex",
            "scenarioFamily",
            "taskVariant",
            "condition",
            "answerKind",
            "answerId",
            "confidence",
            "perceivedDifficulty",
            "activeTrialTimeMs",
            "visibilityInterruptions",
        }
        if not isinstance(trial, dict) or not trial_fields.issubset(trial):
            raise ValueError("Trial is missing required schema fields.")
        if trial["trialIndex"] != index or trial["trialId"] != session["assignedOrder"][index]:
            raise ValueError("Trial responses do not follow the assigned trial order.")
        if trial["condition"] not in {"baseline", "recommended"}:
            raise ValueError("Invalid trial condition.")
        if (
            type(trial["confidence"]) is not int
            or not 1 <= trial["confidence"] <= 5
            or type(trial["perceivedDifficulty"]) is not int
            or not 1 <= trial["perceivedDifficulty"] <= 5
        ):
            raise ValueError("Confidence and perceived difficulty must be ratings from one to five.")
        if (
            type(trial["activeTrialTimeMs"]) is not int
            or trial["activeTrialTimeMs"] < 0
            or type(trial["visibilityInterruptions"]) is not int
            or trial["visibilityInterruptions"] < 0
        ):
            raise ValueError("Trial time and visibility interruptions must be nonnegative integers.")
        if trial["scenarioFamily"] not in ANSWER_KEY or trial["taskVariant"] not in {"A", "B"}:
            raise ValueError("Unknown scenario family or task variant.")
        if trial["answerKind"] == "unknown":
            if trial["answerId"] is not None:
                raise ValueError("Explicit unknown responses must keep answerId null.")
        elif trial["answerKind"] == "choice":
            if not isinstance(trial["answerId"], str):
                raise ValueError("Choice responses require an answerId.")
        else:
            raise ValueError("Invalid answer kind.")
        pair_key = (trial["scenarioFamily"], trial["condition"])
        if pair_key in seen:
            raise ValueError("A session contains more than one trial per family and condition.")
        seen.add(pair_key)
    if session["status"] == "complete" and (
        len(session["responses"]) != 10
        or any(
            usability[field] is None
            for field in ("evidenceClarity", "conditionPreference", "easierCondition")
        )
    ):
        raise ValueError("A completed session must contain ten trials and all usability responses.")
    return session


def load_json(path):
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 1:
        raise ValueError("Unsupported JSON export schema.")
    sessions = payload.get("sessions")
    if not isinstance(sessions, list):
        raise ValueError("JSON export must contain a sessions array.")
    return [validate_session(session) for session in sessions]


def load_csv(path):
    sessions = {}
    with path.open(newline="", encoding="utf-8-sig") as file:
        for row in csv.DictReader(file):
            key = row.get("sessionId")
            if not key:
                raise ValueError("CSV row is missing sessionId.")
            session = sessions.setdefault(
                key,
                {
                    "schemaVersion": int(row["schemaVersion"]),
                    "protocolVersion": row["protocolVersion"],
                    "participantId": row["participantId"],
                    "sessionId": key,
                    "sourceCommit": row["sourceCommit"],
                    "stimulusSeed": int(row["stimulusSeed"]),
                    "stimulusVersion": row["stimulusVersion"],
                    "counterbalanceGroup": int(row["counterbalanceGroup"]),
                    "status": row["sessionStatus"],
                    "assignedOrder": json.loads(row["assignedOrder"]),
                    "responses": [],
                    "usability": {
                        "evidenceClarity": int(row["evidenceClarity"]) if row["evidenceClarity"] else None,
                        "conditionPreference": row["conditionPreference"] or None,
                        "easierCondition": row["easierCondition"] or None,
                    },
                },
            )
            if not row.get("trialId"):
                continue
            trial = {
                "trialId": row["trialId"],
                "trialIndex": int(row["trialIndex"]),
                "scenarioFamily": row["scenarioFamily"],
                "taskVariant": row["taskVariant"],
                "condition": row["condition"],
                "answerKind": row["answerKind"],
                "answerId": row["answerId"] or None,
                "confidence": int(row["confidence"]),
                "perceivedDifficulty": int(row["perceivedDifficulty"]),
                "activeTrialTimeMs": int(row["activeTrialTimeMs"]),
                "visibilityInterruptions": int(row["visibilityInterruptions"]),
            }
            session["responses"].append(trial)
    return [validate_session(session) for session in sessions.values()]


def trial_accuracy(trial):
    if trial["answerKind"] == "unknown":
        return None
    expected = ANSWER_KEY[trial["scenarioFamily"]][trial["taskVariant"]]
    return int(trial["answerId"] == expected)


def mean(values):
    return statistics.fmean(values) if values else None


def analyze(sessions):
    condition_trials = defaultdict(list)
    incomplete = []
    paired = []
    for session in sessions:
        if session["status"] != "complete" or len(session["responses"]) != 10:
            incomplete.append(
                {
                    "sessionId": session["sessionId"],
                    "responseCount": len(session["responses"]),
                    "reason": "session incomplete or fewer than ten trials",
                }
            )
        by_family = defaultdict(dict)
        for trial in session["responses"]:
            value = {
                "accuracy": trial_accuracy(trial),
                "activeTrialTimeMs": trial["activeTrialTimeMs"],
                "confidence": trial["confidence"],
                "perceivedDifficulty": trial["perceivedDifficulty"],
            }
            condition_trials[trial["condition"]].append(value)
            by_family[trial["scenarioFamily"]][trial["condition"]] = value
        for family, conditions in by_family.items():
            baseline = conditions.get("baseline")
            recommended = conditions.get("recommended")
            if not baseline or not recommended:
                paired.append(
                    {
                        "participantId": session["participantId"],
                        "scenarioFamily": family,
                        "pairComplete": False,
                        "accuracyDifferenceRecommendedMinusBaseline": None,
                        "activeTimeDifferenceMsRecommendedMinusBaseline": None,
                        "confidenceDifferenceRecommendedMinusBaseline": None,
                    }
                )
                continue
            paired.append(
                {
                    "participantId": session["participantId"],
                    "scenarioFamily": family,
                    "pairComplete": True,
                    "accuracyDifferenceRecommendedMinusBaseline": (
                        None
                        if baseline["accuracy"] is None or recommended["accuracy"] is None
                        else recommended["accuracy"] - baseline["accuracy"]
                    ),
                    "activeTimeDifferenceMsRecommendedMinusBaseline": (
                        recommended["activeTrialTimeMs"] - baseline["activeTrialTimeMs"]
                    ),
                    "confidenceDifferenceRecommendedMinusBaseline": (
                        recommended["confidence"] - baseline["confidence"]
                    ),
                }
            )

    summaries = {}
    for condition, values in condition_trials.items():
        scored = [trial["accuracy"] for trial in values if trial["accuracy"] is not None]
        summaries[condition] = {
            "trialCount": len(values),
            "scoredChoiceCount": len(scored),
            "explicitUnknownCount": sum(trial["accuracy"] is None for trial in values),
            "accuracyAmongScoredChoices": mean(scored),
            "meanActiveTrialTimeMs": mean([trial["activeTrialTimeMs"] for trial in values]),
            "meanConfidence": mean([trial["confidence"] for trial in values]),
            "meanPerceivedDifficulty": mean([trial["perceivedDifficulty"] for trial in values]),
        }
    complete_accuracy_pairs = [
        row["accuracyDifferenceRecommendedMinusBaseline"]
        for row in paired
        if row["accuracyDifferenceRecommendedMinusBaseline"] is not None
    ]
    complete_time_pairs = [
        row["activeTimeDifferenceMsRecommendedMinusBaseline"]
        for row in paired
        if row["activeTimeDifferenceMsRecommendedMinusBaseline"] is not None
    ]
    complete_confidence_pairs = [
        row["confidenceDifferenceRecommendedMinusBaseline"]
        for row in paired
        if row["confidenceDifferenceRecommendedMinusBaseline"] is not None
    ]
    return {
        "analysisType": "exploratory descriptive summaries only",
        "sessions": len(sessions),
        "incompleteSessions": incomplete,
        "conditionSummaries": summaries,
        "pairedDifferenceMeans": {
            "accuracyRecommendedMinusBaselineAmongScoredPairs": mean(complete_accuracy_pairs),
            "activeTrialTimeMsRecommendedMinusBaseline": mean(complete_time_pairs),
            "confidenceRecommendedMinusBaseline": mean(complete_confidence_pairs),
            "completeAccuracyPairs": len(complete_accuracy_pairs),
            "completeTimePairs": len(complete_time_pairs),
            "completeConfidencePairs": len(complete_confidence_pairs),
        },
        "pairedBySessionAndScenario": paired,
        "inferenceNote": (
            "No confirmatory inference, equivalence claim, or statistical power claim is supported "
            "by this draft pilot. Explicit unknown responses are retained and excluded from "
            "choice-accuracy denominators."
        ),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path, help="validated JSON or CSV export")
    parser.add_argument("--output", type=Path, help="write the summary to this file")
    args = parser.parse_args()
    try:
        sessions = load_json(args.export) if args.export.suffix.lower() == ".json" else load_csv(args.export)
        result = json.dumps(analyze(sessions), indent=2, ensure_ascii=False)
        if args.output:
            args.output.write_text(result + "\n", encoding="utf-8")
        else:
            print(result)
    except (OSError, ValueError, json.JSONDecodeError, KeyError) as error:
        print(f"Invalid export: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
