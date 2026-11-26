# Files and Conversion

## Upload
- A project can accept only some kinds of files, make the file optional, or ask for no file (see `submission-form.md`). With no file, there is no `media_files` row.
- The browser uploads the original **directly to Cloudflare R2** through a signed upload URL, so large files never pass through the app's server. One upload (a single PUT) holds up to 5 GB, which is the file size limit. Multipart upload could raise it later.
- The flow:
  1. The `submit` Edge Function saves the submission, its `media_files` row (`processing_status = pending`) and a job in `awaiting_upload`, then returns the job ID and a signed upload URL (valid 1 hour).
  2. The browser uploads with a progress bar. If the upload fails, the submission is already saved: **Try Again** asks the `upload` Edge Function for a fresh URL (`action: 'url'`) using the job ID, for up to 2 days.
  3. The browser calls `upload` with `action: 'complete'`. It checks the object exists in R2 with the recorded size, then sets the job to `queued` (and will invoke the Lambda).
- Object keys: `originals/{project_id}/{media_file_id}.{ext}`.
- The R2 bucket needs a CORS rule allowing `PUT` with the `content-type` header from the site's origins.

## Conversion worker (AWS Lambda)
- An **AWS Lambda** function running **ffmpeg** (from a layer or container image) converts one file per invocation.
  - When an upload completes, the Edge Function **invokes it asynchronously** with the job ID.
  - The Lambda claims the job in Postgres, downloads the original from R2, converts it, uploads the result, records the real duration, and sets `processing_status` to `ready` or `failed`.
- Conversion happens **continuously** as submissions arrive, and Lambda runs many jobs in parallel.
- Lambda's limit is 15 minutes per run. Use high memory (more CPU) and a faster preset for 4K/60fps sources. A timeout marks the job `failed`.
- A scheduled sweep (pg_cron) re-invokes jobs that are stuck `running` past a lease timeout, or `queued` but never started.
- Keep the conversion code runnable locally for testing.
- Conversion targets, so files play in every browser:
  - **Video** → H.264 MP4, max 1080p (smaller sources keep their resolution), `-crf 20 -preset medium`, fast start (`-movflags +faststart`)
  - **Audio** → MP3/AAC
  - **HEIC images** → JPEG/WebP
  - **Text** (.txt, .md, .rtf, .pdf, .doc, .docx) → no conversion; the job is marked `done` right away
- Reviewers see "Processing…" until the file is ready.
- Supabase Edge Functions can't run ffmpeg, which is why the conversion runs on Lambda.

## Reprocess
- Any reviewer can click **"Problem with this file? Reprocess."** This:
  - creates a job (who requested it and when) and sets the status back to `pending`
  - has the worker convert again from the original, with "safe mode" (more compatible) settings
  - replaces the old converted file
- Allow only **one open job per submission** (a database constraint). Extra clicks do nothing.
- If the original has been deleted, the button is disabled with the note *"Original file was deleted; contact the organizer at {email}."*

## Retention
- The original-file retention setting is in `projects-and-settings.md`. The default is keep until results are sent.
- The worker deletes originals only when the setting allows it and the conversion is `ready`.
