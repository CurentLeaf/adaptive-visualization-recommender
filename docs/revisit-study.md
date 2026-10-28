# Using the participant view with reVISit

The default page is the participant workspace with one assigned technique per trial. Use `?mode=researcher` to open the full exploration application. Study participants see a scenario, one chart, a task response, and confidence controls. They do not see recommendation scores, expected answers, correctness feedback, or research logs.

## Preview a condition

Run `npm run dev`, then open a URL such as:

```text
http://localhost:5173/?scenario=conflict&technique=bar&assigned=1
```

Assigned mode locks a trial to one technique and is the default. Query conditions are useful for previewing; embedded reVISit `parameters` configure the actual trial. An embedded trial waits for a valid configuration before it can start; missing or incompatible conditions block the trial instead of silently substituting another condition.

| Scenario ID     | Available technique IDs    |
| --------------- | -------------------------- |
| `corroboration` | `dot`, `bar`, `table`      |
| `conflict`      | `dot`, `bar`, `table`      |
| `uncertain`     | `timeline`, `bar`, `table` |
| `anomaly`       | `line`, `bar`, `table`     |
| `quality`       | `matrix`, `table`          |

Technique names identify representations, not suitability rankings. Answer choices are randomized independently for each trial; the actual order is included in its response record. Each scenario's representations use the same underlying observations. Assign participants one technique per trial, and counterbalance conditions in the study configuration before collecting data.

## Install the stimulus in a reVISit study

Build with relative asset paths so the app works inside the study's public directory:

```bash
npm ci
npm run build:study
```

Copy **all contents** of `dist/`, including `assets/`, into `public/avr/` in your reVISit project. A local `WebsiteComponent` passes a generated iframe ID and its parameters to the stimulus. This follows the [official WebsiteComponent integration](https://revisit.dev/docs/v2.4.3/typedoc/interfaces/WebsiteComponent/).

Add a component such as the following to the study's `components` object and reference its key in the study sequence. This is a component example, not a complete study configuration:

```json
{
  "conflict-bar": {
    "type": "website",
    "path": "avr/index.html",
    "parameters": {
      "scenario": "conflict",
      "technique": "bar",
      "assigned": true
    },
    "withSidebar": false,
    "provideFeedback": false,
    "nextButtonLocation": "belowStimulus",
    "nextButtonText": "Next trial",
    "style": { "height": "1100px" },
    "response": [
      {
        "id": "avrTrial",
        "type": "reactive",
        "prompt": "Trial response",
        "location": "belowStimulus",
        "required": true,
        "hidden": true
      }
    ]
  }
}
```

Keep the relative path free of query parameters; configure conditions through `parameters`. The [current reVISit iframe controller](https://github.com/revisit-studies/study/blob/main/src/controllers/IframeController.tsx) appends the communication ID to local paths, whereas an external URL is used unchanged. Hosting the built app within reVISit avoids that external-URL handshake limitation.

Specify both `scenario` and a compatible `technique`; `assigned: true` keeps the intended study design explicit. The `parameters` object itself is delivered to the app, without an extra wrapper. The outer reVISit Next button waits for the required reactive response. The participant submits the response inside the stimulus, then advances with reVISit's Next button.

## Response transport and analysis

The typed adapter in `src/study/revisit.ts` implements the message envelope from the [official communication helper](https://github.com/revisit-studies/study/blob/main/public/revisitUtilities/revisit-communicate.js): it announces readiness, receives study parameters, and sends completed answers. It checks the parent window, parent origin, and iframe ID before accepting a configuration. It needs no additional runtime dependency.

On submission it sends a single reactive response, `avrTrial`, containing a JSON string. Parse that string in analysis to recover the structured record:

| Field            | Meaning                                                           |
| ---------------- | ----------------------------------------------------------------- |
| `schemaVersion`  | `"avr-study/1"`                                                   |
| `trialId`        | Trial identifier supplied by the host or preview                  |
| `scenario`       | Assigned scenario ID                                              |
| `technique`      | Assigned technique ID                                             |
| `answer`         | Submitted task response                                           |
| `confidence`     | Participant's confidence from 1 to 5                              |
| `elapsedMs`      | Time from starting the trial to submission, in milliseconds       |
| `responseTimeMs` | Time from the chart becoming ready to submission, in milliseconds |
| `interactions`   | Recorded trial interactions                                       |
| `answerOrder`    | Answer options in their displayed order                           |
| `completion`     | `true` for a submitted trial                                      |
| `submittedAt`    | Submission timestamp                                              |

The response contains no expected answer, correctness field, or technique preference. The [reactive response reference](https://revisit.dev/docs/v2.4.3/typedoc/interfaces/ReactiveResponse/) documents the matching response ID and hidden/required settings. The component example above, including `hidden: true` and `required: true`, validates against the official [v2.4.3 study schema](https://github.com/revisit-studies/study/blob/v2.4.3/src/parser/StudyConfigSchema.json).

Interaction records include response changes, confidence changes, chart clicks, and the first hover over each distinct chart mark. They do not capture every pointer movement.

The adapter does not send drafts or automatically advance the study. A standalone preview does not claim to be connected to reVISit. The local preview is useful for reviewing layout and downloads; reVISit remains responsible for participant identity, consent, assignment, trial sequencing, and study storage.

## Pilot before collection

This repository contains the stimulus, not a deployed reVISit study. In your study deployment, verify that the correct scenario and technique load, other techniques stay unavailable in assigned mode, Next remains gated until submission, and the exported `avrTrial` value contains the expected metadata. Check each condition at the viewport sizes your participants will use, including keyboard navigation and the final chart render. Freeze the stimulus and study configuration for the collection period.
