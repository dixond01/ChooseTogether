// Cloudflare R2 for the worker. R2 speaks the S3 API, so the AWS SDK's S3
// client works with R2's endpoint. Files stream to and from /tmp so a large
// video never has to fit in memory.
//
// Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
import { createReadStream, createWriteStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

let client

function s3() {
  if (client) return client
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error('R2 is not set up (R2_* environment variables)')
  }
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    // Only send checksums S3 requires; R2 rejects some of the SDK's newer defaults.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  return client
}

const bucket = () => process.env.R2_BUCKET

export async function download(key, file, { signal } = {}) {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }), { abortSignal: signal })
  await pipeline(res.Body, createWriteStream(file), { signal })
}

export async function upload(file, key, contentType, { signal } = {}) {
  const { size } = await stat(file)
  await s3().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: createReadStream(file),
    ContentLength: size,
    ContentType: contentType,
  }), { abortSignal: signal })
}
