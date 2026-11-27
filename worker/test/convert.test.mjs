// Conversion tests against real ffmpeg. Sample files are generated with
// ffmpeg's built-in test sources, so no media is checked in.
// Run with: npm test (in worker/)
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { buildArgs, convert, probe } from '../src/convert.mjs'
import { convertedKey } from '../src/handler.mjs'

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
let dir

function make(name, args) {
  const file = join(dir, name)
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args, file])
  assert.equal(r.status, 0, `could not make ${name}: ${r.stderr}`)
  return file
}

const tone = (s) => ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${s}`]
const picture = (size, rate, s) => ['-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=${rate}:duration=${s}`]

async function videoOut(file, mode) {
  const output = `${file}.out.mp4`
  const { duration } = await convert('video', file, output, { mode })
  const info = await probe(output)
  return { duration, info, output }
}

before(() => { dir = mkdtempSync(join(tmpdir(), 'ct-convert-')) })
after(() => rmSync(dir, { recursive: true, force: true }))

describe('video', () => {
  test('4K 60fps phone video becomes 1080p H.264 with sound', async () => {
    const src = make('uhd.mov', [...picture('3840x2160', 60, 2), ...tone(2), '-c:v', 'libx264', '-preset', 'ultrafast', '-shortest'])
    const { duration, info } = await videoOut(src)
    assert.equal(info.video.width, 1920)
    assert.equal(info.video.height, 1080)
    assert.ok(info.audio, 'keeps the audio')
    assert.equal(duration, 2)
  })

  test('portrait video keeps its shape, short side 1080', async () => {
    const src = make('tall.mp4', [...picture('1440x2560', 30, 1), '-c:v', 'libx264', '-preset', 'ultrafast'])
    const { info } = await videoOut(src)
    assert.equal(info.video.width, 1080)
    assert.equal(info.video.height, 1920)
    assert.equal(info.audio, undefined, 'no audio track is fine')
  })

  test('small video is not enlarged', async () => {
    const src = make('small.webm', [...picture('640x360', 30, 1), '-c:v', 'libvpx-vp9', '-deadline', 'realtime'])
    const { info } = await videoOut(src)
    assert.equal(info.video.width, 640)
    assert.equal(info.video.height, 360)
  })

  test('10-bit video becomes 8-bit 4:2:0 that browsers play', async () => {
    const src = make('tenbit.mkv', [...picture('1280x720', 30, 1), '-pix_fmt', 'yuv420p10le', '-c:v', 'libx264', '-preset', 'ultrafast'])
    const { output } = await videoOut(src)
    const r = spawnSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=pix_fmt,codec_name', '-of', 'csv=p=0', output])
    assert.equal(String(r.stdout).trim(), 'h264,yuv420p')
  })

  test('safe mode caps the frame rate at 30', async () => {
    const src = make('fast.mp4', [...picture('1280x720', 60, 1), '-c:v', 'libx264', '-preset', 'ultrafast'])
    const { info } = await videoOut(src, 'safe')
    assert.equal(Math.round(info.video.fps), 30)
  })

  test('a file with no video track fails with a clear message', async () => {
    const src = make('only-sound.m4a', [...tone(1), '-c:a', 'aac'])
    await assert.rejects(convert('video', src, `${src}.out.mp4`), /no video track/)
  })

  test('a broken file fails', async () => {
    const src = make('notes.txt', ['-f', 'lavfi', '-i', 'anullsrc', '-t', '0.1', '-f', 'u8'])
    await assert.rejects(convert('video', src, `${src}.out.mp4`))
  })
})

describe('audio', () => {
  test('WAV becomes AAC with the right duration', async () => {
    const src = make('song.wav', tone(3))
    const output = `${src}.out.m4a`
    const { duration } = await convert('audio', src, output)
    const info = await probe(output)
    assert.ok(info.audio)
    assert.equal(info.video, undefined)
    assert.equal(duration, 3)
  })
})

describe('arguments', () => {
  const info = (width, height, fps) => ({ video: { index: 0, width, height, fps }, audio: { index: 1 } })

  test('1080p30 uses the medium preset at CRF 20 with fast start', () => {
    const args = buildArgs('video', info(1920, 1080, 30), 'in', 'out.mp4').join(' ')
    assert.match(args, /-preset medium/)
    assert.match(args, /-crf 20/)
    assert.match(args, /-movflags \+faststart/)
  })

  test('4K or 60fps sources use a faster preset', () => {
    assert.match(buildArgs('video', info(3840, 2160, 30), 'in', 'o').join(' '), /-preset veryfast/)
    assert.match(buildArgs('video', info(1920, 1080, 60), 'in', 'o').join(' '), /-preset veryfast/)
  })

  test('safe mode uses the main profile', () => {
    assert.match(buildArgs('video', info(1920, 1080, 30), 'in', 'o', 'safe').join(' '), /-profile:v main/)
  })
})

test('converted key mirrors the original key', () => {
  assert.equal(convertedKey('originals/p1/f1.MOV', 'mp4'), 'converted/p1/f1.mp4')
  assert.equal(convertedKey('originals/p1/f1', 'm4a'), 'converted/p1/f1.m4a')
})
