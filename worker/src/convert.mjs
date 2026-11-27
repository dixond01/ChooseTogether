// ffmpeg conversion: the part of the worker that doesn't touch R2 or the
// database, so it runs the same on a laptop (src/local.mjs) and on Lambda.
//
// Targets (Documents/spec/files-and-conversion.md):
//   video       -> H.264 + AAC MP4, short side at most 1080 px, CRF 20, fast start
//   audio       -> AAC in .m4a
//   HEIC image  -> JPEG
// "safe" mode (Reprocess) trades quality and speed for compatibility.
import { spawn } from 'node:child_process'

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe'

const MAX_SHORT_SIDE = 1080
// Sources bigger or faster than 1080p30 use a faster preset to stay well
// inside Lambda's 15 minutes.
const HEAVY_PIXELS = 1920 * 1080 * 1.2
const HEAVY_FPS = 35

export const OUTPUT = {
  video: { ext: 'mp4', mime: 'video/mp4' },
  audio: { ext: 'm4a', mime: 'audio/mp4' },
  image: { ext: 'jpg', mime: 'image/jpeg' },
}

// Runs a command. Resolves with stdout; rejects with the last lines of stderr.
function run(cmd, args, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], signal })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err = (err + d).slice(-8000) })
    child.on('error', (e) => {
      reject(e.name === 'AbortError' ? new Error('Conversion timed out') : e)
    })
    child.on('close', (code) => {
      if (code === 0) resolve(out)
      else {
        const tail = err.trim().split('\n').slice(-6).join('\n')
        reject(new Error(`${cmd.split(/[\\/]/).pop()} exited with code ${code}: ${tail}`))
      }
    })
  })
}

function parseRate(rate) {
  const [n, d] = String(rate || '0/1').split('/').map(Number)
  return d ? n / d : n || 0
}

// What's in the file. Throws if ffprobe can't read it at all.
export async function probe(file, opts) {
  const out = await run(FFPROBE, [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file,
  ], opts)
  const data = JSON.parse(out)
  const streams = data.streams ?? []
  // Phone and music files often carry cover art as a one-frame "video" stream.
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic)
  const audio = streams.find((s) => s.codec_type === 'audio')
  const duration = Number(data.format?.duration)
  return {
    duration: Number.isFinite(duration) ? duration : null,
    video: video && {
      index: video.index,
      width: video.width,
      height: video.height,
      fps: parseRate(video.avg_frame_rate) || parseRate(video.r_frame_rate),
    },
    audio: audio && { index: audio.index },
  }
}

// ffmpeg arguments for one conversion. Exported so tests can check them.
export function buildArgs(kind, info, input, output, mode = 'standard') {
  const safe = mode === 'safe'
  const head = ['-hide_banner', '-nostdin', '-y']
  // Safe mode pushes through damaged frames and rebuilds timestamps.
  const inFlags = safe ? ['-err_detect', 'ignore_err', '-fflags', '+genpts+discardcorrupt'] : []

  if (kind === 'video') {
    if (!info.video) throw new Error('The file has no video track')
    const { width = 0, height = 0, fps = 0 } = info.video
    const heavy = width * height > HEAVY_PIXELS || fps > HEAVY_FPS
    // Shrink only when the short side is over 1080; keep even dimensions for H.264.
    const scale =
      `scale=w='trunc(min(1\\,${MAX_SHORT_SIDE}/min(iw\\,ih))*iw/2)*2'` +
      `:h='trunc(min(1\\,${MAX_SHORT_SIDE}/min(iw\\,ih))*ih/2)*2'`
    const filters = [scale]
    if (safe && fps > 30) filters.push('fps=30')
    // 8-bit 4:2:0 is what every browser decodes (iPhone HDR is 10-bit).
    filters.push('format=yuv420p')

    return [
      ...head, ...inFlags, '-i', input,
      '-map', `0:${info.video.index}`,
      ...(info.audio ? ['-map', `0:${info.audio.index}`] : []),
      '-vf', filters.join(','),
      '-c:v', 'libx264', '-crf', '20', '-preset', heavy ? 'veryfast' : 'medium',
      ...(safe ? ['-profile:v', 'main', '-level:v', '4.0', '-fps_mode', 'cfr'] : ['-profile:v', 'high']),
      ...(info.audio ? ['-c:a', 'aac', '-b:a', '160k', '-ac', '2', ...(safe ? ['-ar', '48000'] : [])] : []),
      '-max_muxing_queue_size', '4096',
      '-map_metadata', '-1',
      '-movflags', '+faststart',
      output,
    ]
  }

  if (kind === 'audio') {
    if (!info.audio) throw new Error('The file has no audio track')
    return [
      ...head, ...inFlags, '-i', input,
      '-map', `0:${info.audio.index}`, '-vn',
      '-c:a', 'aac', '-b:a', '192k', ...(safe ? ['-ac', '2', '-ar', '48000'] : []),
      '-movflags', '+faststart',
      output,
    ]
  }

  if (kind === 'image') {
    return [...head, ...inFlags, '-i', input, '-frames:v', '1', '-q:v', '2', output]
  }

  throw new Error(`Nothing to convert for kind "${kind}"`)
}

// Converts `input` to `output` (whose extension should match OUTPUT[kind]).
// Returns { duration } in whole seconds (null for images).
export async function convert(kind, input, output, { mode = 'standard', signal } = {}) {
  const info = await probe(input, { signal })
  await run(FFMPEG, buildArgs(kind, info, input, output, mode), { signal })
  if (kind === 'image') return { duration: null }
  // The converted file's length is the one reviewers will see.
  const after = await probe(output, { signal })
  const seconds = after.duration ?? info.duration
  return { duration: seconds == null ? null : Math.round(seconds) }
}
