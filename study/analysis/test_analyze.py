import unittest

from analyze import analyze, validate_session


def session(complete=True):
    families = ["corroboration", "conflict", "uncertain", "quality", "anomaly"]
    answers = {
        "corroboration": ("same-items", "four-sources"),
        "conflict": ("unknown-not-zero", "six-vs-four"),
        "uncertain": ("four-hours", "observation-not-receipt"),
        "quality": ("not-verified", "unresolved-range"),
        "anomaly": ("no-proof", "frequency-and-coverage"),
    }
    responses = []
    for index, family in enumerate(families):
        for condition, variant in (("baseline", "A"), ("recommended", "B")):
            responses.append(
                {
                    "trialId": f"{family}-{variant}-{condition}",
                    "scenarioFamily": family,
                    "taskVariant": variant,
                    "condition": condition,
                    "answerKind": "choice",
                    "answerId": answers[family][variant == "B"],
                    "confidence": 4,
                    "perceivedDifficulty": 2,
                    "activeTrialTimeMs": 1000 + index * 100,
                    "visibilityInterruptions": 0,
                }
            )
    return {
        "schemaVersion": 1,
        "protocolVersion": "draft-1",
        "participantId": "P-test",
        "sessionId": "S-test",
        "sourceCommit": "test",
        "stimulusSeed": 271828,
        "stimulusVersion": "cedar-watch-generator-1",
        "counterbalanceGroup": 0,
        "status": "complete" if complete else "in_progress",
        "assignedOrder": [row["trialId"] for row in responses],
        "responses": responses,
        "usability": {
            "evidenceClarity": 4 if complete else None,
            "conditionPreference": "recommended" if complete else None,
            "easierCondition": "recommended" if complete else None,
        },
    }


class AnalysisTests(unittest.TestCase):
    def test_summarizes_paired_condition_differences(self):
        result = analyze([validate_session(session())])
        self.assertEqual(result["conditionSummaries"]["baseline"]["accuracyAmongScoredChoices"], 1)
        self.assertEqual(
            result["pairedDifferenceMeans"]["activeTrialTimeMsRecommendedMinusBaseline"], 0
        )
        self.assertEqual(len(result["pairedBySessionAndScenario"]), 5)
        self.assertIn("exploratory", result["analysisType"])

    def test_explicit_unknown_is_not_scored_as_incorrect(self):
        record = session()
        record["responses"][0]["answerKind"] = "unknown"
        record["responses"][0]["answerId"] = None
        result = analyze([validate_session(record)])
        self.assertEqual(result["conditionSummaries"]["baseline"]["explicitUnknownCount"], 1)
        self.assertEqual(
            result["conditionSummaries"]["baseline"]["scoredChoiceCount"], 4
        )
        self.assertIsNone(
            result["pairedBySessionAndScenario"][0][
                "accuracyDifferenceRecommendedMinusBaseline"
            ]
        )

    def test_flags_incomplete_sessions_and_rejects_duplicate_condition_trials(self):
        incomplete = session(complete=False)
        incomplete["responses"] = incomplete["responses"][:1]
        result = analyze([validate_session(incomplete)])
        self.assertEqual(result["incompleteSessions"][0]["responseCount"], 1)

        invalid = session()
        invalid["responses"].append(dict(invalid["responses"][0]))
        with self.assertRaises(ValueError):
            validate_session(invalid)


if __name__ == "__main__":
    unittest.main()
