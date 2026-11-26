# Public Submission Form

A public form with no login. Every project shares a few fixed core fields, and each project can add its own custom fields. Each submission is one row in a relational table, and custom answers are typed rows in their own table (no document DB).

## Core fields (every project)
| Field | Required | Notes |
|---|---|---|
| Title | ✅ | Label set per project (e.g. "Act Title", "Headline") |
| Description | ✅ | Label set per project (e.g. "Act Description", "Summary") |
| Participants | ✅ (at least 1) | Rows of name (required) and email (optional), with add/remove buttons. Singular and plural labels set per project (e.g. "Performer" / "Performers", "Author" / "Authors") |
| File | per project | `file_requirement`: `required`, `optional` or `none`. Label set per project. Exactly one file at most |
| Agreement checkbox | ✅ | Text set per project. Hidden if the project has no agreement text |

## Custom fields (per project)
Managers add these in settings (**Form Fields**). Examples: the talent show's "Stage & Equipment Needs" (long text, optional, placeholder "e.g. 2 handheld mics, piano, chair, backing track"), or a newspaper's "Section" (choice).

- Field types are fixed codes: `short_text`, `long_text`, `number`, `choice` (pick one), `checkbox` (yes/no; a required checkbox must be ticked), `date`.
- Each field has a label, required flag, position (form order), optional placeholder (text and number types), and options (choice only, at least 2).
- Answers are stored in `submission_answers`, one row per submission and field, in the value column that matches the type (`value_text`, `value_number`, `value_bool`, `value_date`). The database checks the value matches the field's type and project, and that a choice answer is one of the options.
- Blank optional answers are not stored.

### Protecting submitted data
Submissions are final, so field definitions are limited once answers exist:
- A field's **type** can never change. To use a different type, add a new field.
- **Options** can be freely edited until a field has answers. After that, new options can only be added to the end.
- **Label, required, placeholder** can always change. Renaming a label is fine; old answers keep showing under the new label.
- A field with answers **can't be deleted**, only hidden (`archived_at`). Hidden fields leave the form but their answers still show in review.

## Participant rules
- There are no separate submitter fields. The first participant is usually the person submitting.
- **At least one participant must have an email**, or the submission is rejected.
- Up to `max_participants`, if it's set. Show "Up to N {participants}" and hide **Add {Participant}** at the limit.
- Validate in the browser **and** on the server.
- Store participants in their own table with `position` (form order).

## File rules
- The project picks which kinds are accepted (`accepted_kinds`: `video`, `audio`, `image`, `text`; at least one). `text` covers .txt, .md, .rtf, .pdf, .doc and .docx.
- Record the media type and size, and the duration for video/audio.
- Check the duration against the project's max duration in the browser before upload. The max duration only applies when video or audio is accepted.
- Upload directly to R2. See `files-and-conversion.md`.

## Other rules
- **Submissions are final**: no editing or replacing. Before the submit button, show: *"Submissions are final and can't be edited. To make changes, contact the organizer at {owner email}."*
- After the deadline, the form shows "Submissions are closed."
- No phone number and no guardian fields (no minors).
- Add spam protection (rate limiting and/or Cloudflare Turnstile). This is a new technology, so tell the user before adding it.
- The submit Edge Function validates the core fields, the participant rules, required custom fields and answer types against the project's (non-hidden) fields, all in one transaction.
