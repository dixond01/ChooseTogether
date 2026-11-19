# Public Submission Form

A public form with no login. It has a fixed set of fields, and each submission is one row in a relational table (no document DB).

## Fields
| Field | Required | Notes |
|---|---|---|
| Act title | ✅ | |
| Act description | ✅ | What the act is |
| Stage & equipment needs | ❌ | Placeholder: "e.g. 2 handheld mics, piano, chair, backing track" |
| Participants | ✅ (at least 1) | Rows of name (required) and email (optional), with add/remove buttons |
| File | ✅ | Exactly one file |
| Agreement checkbox | ✅ | Text set per project |

## Participant rules
- There are no separate submitter fields. The first participant is usually the person submitting.
- **At least one participant must have an email**, or the submission is rejected.
- Up to `max_participants`, if it's set. Show "Up to N participants" and hide **Add participant** at the limit.
- Validate in the browser **and** on the server.
- Store participants in their own table with `position` (form order).

## File rules
- Record the media type and size, and the duration for video/audio.
- Check the duration against the project's max duration in the browser before upload.
- Upload directly to R2. See `files-and-conversion.md`.

## Other rules
- **Submissions are final**: no editing or replacing. Before the submit button, show: *"Submissions are final and can't be edited. To make changes, contact the organizer at {owner email}."*
- After the deadline, the form shows "Submissions are closed."
- No phone number and no guardian fields (no minors).
- Add spam protection (rate limiting and/or Cloudflare Turnstile). This is a new technology, so tell the user before adding it.
