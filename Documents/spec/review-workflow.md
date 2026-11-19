# Review Workflow

## Assignment
- Automatic assignment is the main way. It runs **once at the submission deadline**, and managers also have an **"Assign current submissions"** button.
- Each submission goes to the **N eligible reviewers with the fewest current assignments**.
- **Conflict check:** a reviewer whose email matches any participant email on a submission is never assigned to it.
- Re-running only fills in missing assignments. Existing assignments and votes are never reshuffled.
- Managers can manually swap the reviewers on any act, e.g. for conflicts the emails don't catch.

## Reviewing
- **Queue mode** shows the next assigned submission without a vote. **List mode** sorts and filters by status, tag, voted/not voted and duration.
- The detail view shows the player, act title, description, stage & equipment needs, participant **names** (no emails), duration and tags.
- Each reviewer gives:
  - a vote: Selected / Waitlisted / Not Selected, or Maybe
  - a 1–5 score (required if the project setting is on)
  - notes (optional)
  - tags from the project's tag list
- Tags are stored per reviewer, and the submission shows the **combined, de-duplicated** set.

## Statuses
Submitted → In Review → **Pending Decision** → **Selected / Waitlisted / Not Selected**

- Store fixed codes (`submitted`, `in_review`, `pending_decision`, `selected`, `waitlisted`, `not_selected`) and show labels in the UI.
- With the default decision rule, any disagreement or Maybe moves the submission to Pending Decision. With the majority rule, a majority decides.
- Only managers set the final status. They can change it at any time, e.g. when the show length changes. Changes after results are sent are flagged for follow-up emails.
- **Decision log:** every status change is a new row (who, when, from → to, reason). Never overwrite history.
- **Time budget:** show the total duration of selected acts against the target show length (e.g. "84 / 90 min").
