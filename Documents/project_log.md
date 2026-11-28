# Project Log
|**Date**|**Hr:Min**|**Summary**|
|---|---|---|
|11/19|4:00|Initial design|
|11/20|1:15|Project setup: Supabase, Vite React + TS app, R2 bucket, repo structure, GitHub Pages deploy|
|11/20|3:00|Database schema: People & Projects and Intake tables, RLS policies, local Supabase, pgTAP tests|
|11/24|0:30|Fixed delete cascade, all 59 tests passing, pushed schema to live Supabase, generated TS types|
|11/24|3:00|Owner magic-link sign-in, project list/create and settings screens; new visual design (fonts, plum palette, logo)|
|11/25|2:00|Team invites (invite Edge Function, Team settings), Resend email, custom domain choosetogether.app, admin approval for new projects|
|11/25|1:00|Flexible submission forms (custom fields, field labels, accepted file types), public submission form UI with validation and duration check, settings regrouped (Form Fields, Tags, Show toggle)|
|11/25|1:00|Submit and upload Edge Functions (one-transaction save, signed R2 uploads, Turnstile spam check), upload progress and retry on the public form, R2/Turnstile live setup and deploy|
|11/27|1:00|ffmpeg conversion worker on AWS Lambda (Docker image via SAM): job claiming with leases, video/audio/HEIC conversion, safe mode for Reprocess, upload function invokes it; tests in the Lambda image and pgTAP; deployed and verified with a live upload|
|11/27|0:40|pg_cron sweep for stuck conversion jobs: sweep-jobs Edge Function called every 5 minutes via pg_net with a Vault secret, requeues expired leases and fails after 3 attempts, re-invokes lost queued jobs; pgTAP tests|
