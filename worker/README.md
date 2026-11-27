# Converter (AWS Lambda + ffmpeg)

Converts each submitted file so it plays in every browser. Spec: `Documents/spec/files-and-conversion.md`.

- `src/convert.mjs` runs ffmpeg (video to H.264 MP4 with the short side at most 1080, audio to AAC, HEIC to JPEG).
- `src/handler.mjs` is the Lambda: it claims the job, downloads from R2, converts, uploads to `converted/…` and records the result.
- Database side: `supabase/migrations/20261130150000_conversion_jobs.sql` (`complete_upload`, `claim_job`, `finish_job`).
- The `upload` Edge Function invokes the Lambda when an upload completes. Text files and browser-ready images are marked done without it.

## Test locally

The tests use the same ffmpeg as the Lambda by running in its Docker image:

```powershell
cd worker
docker build --target test -t ct-converter-test .
docker run --rm ct-converter-test
```

If ffmpeg and ffprobe are installed on your machine, you can also run `npm test`, or convert one file with `npm run convert -- path\to\video.mov`.

To run the real handler for one job, put the `SUPABASE_*` and `R2_*` values in `worker/.env` (gitignored) and run `npm run job -- <job_id>`.

## Deploy

You need Docker Desktop running, AWS SAM CLI, and the AWS CLI signed in (`aws login`). The region is `us-west-2`.

1. Build and deploy. This creates the function, an ECR image repository and the `choosetogether-invoker` IAM user, whose only permission is invoking this function:

   ```powershell
   cd worker
   sam build
   sam deploy --guided --stack-name choosetogether-converter --resolve-image-repos --capabilities CAPABILITY_NAMED_IAM
   ```

   When prompted, enter the Supabase URL and service-role key and the R2 values (the same ones the Edge Functions use). Don't save the parameters to `samconfig.toml` if you plan to commit it. It's gitignored either way.

2. Create the invoker's access key and give it to the Edge Functions:

   ```powershell
   aws iam create-access-key --user-name choosetogether-invoker
   ```

   ```powershell
   npx supabase secrets set --remote CONVERTER_AWS_ACCESS_KEY_ID=<AccessKeyId> CONVERTER_AWS_SECRET_ACCESS_KEY=<SecretAccessKey> CONVERTER_AWS_REGION=us-west-2
   ```

3. Push the migration and the updated Edge Function:

   ```powershell
   npx supabase db push --remote
   ```

   ```powershell
   npx supabase functions deploy upload --remote
   ```

To redeploy after code changes, run `sam build` and then `sam deploy`. Logs are in CloudWatch under `/aws/lambda/choosetogether-converter` and are kept for 30 days.

## Notes

- The function has 3008 MB of memory (the most a new account allows), a 15-minute timeout and 10 GB of `/tmp`. If a conversion runs too close to the timeout, ffmpeg is stopped and the job is marked `failed` with "Conversion timed out".
- AWS doesn't retry failed runs (`MaximumRetryAttempts: 0`). Failures are recorded on the job, and the pg_cron sweep (12/1) restarts jobs that got stuck.
- iPhone HDR video is converted to standard 8-bit color without tone mapping, so colors can look a bit flat. Check this with real phone videos on 12/2.
