// Run the worker on your own machine (needs ffmpeg and ffprobe on PATH, or
// FFMPEG_PATH / FFPROBE_PATH).
//
// Convert a local file, no R2 or database:
//   node src/local.mjs file <path> [--safe]
//   -> writes <path>.converted.<ext> next to it and prints the duration
//
// Run the real handler for one job (uses R2 and Supabase from worker/.env):
//   node --env-file=.env src/local.mjs job <job_id>
import { extname } from 'node:path'
import { OUTPUT, convert } from './convert.mjs'

const KINDS = {
  video: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', '3gp'],
  audio: ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'],
  image: ['heic', 'heif'],
}

const [cmd, target, ...flags] = process.argv.slice(2)

if (cmd === 'file' && target) {
  const ext = extname(target).slice(1).toLowerCase()
  const kind = Object.keys(KINDS).find((k) => KINDS[k].includes(ext))
  if (!kind) {
    console.error(`Don't know how to convert .${ext} (text and non-HEIC images need no conversion)`)
    process.exit(1)
  }
  const output = `${target}.converted.${OUTPUT[kind].ext}`
  const started = Date.now()
  const { duration } = await convert(kind, target, output, { mode: flags.includes('--safe') ? 'safe' : 'standard' })
  console.log(JSON.stringify({ kind, output, duration, seconds: (Date.now() - started) / 1000 }))
} else if (cmd === 'job' && target) {
  const { handler } = await import('./handler.mjs')
  const result = await handler({ job_id: target }, { getRemainingTimeInMillis: () => 15 * 60 * 1000 })
  console.log(JSON.stringify(result))
} else {
  console.error('Usage: node src/local.mjs file <path> [--safe]\n       node --env-file=.env src/local.mjs job <job_id>')
  process.exit(1)
}
