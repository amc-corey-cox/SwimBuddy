#!/usr/bin/env node
/**
 * Renders the app icon to PNG, at the sizes a web manifest wants.
 *
 * Written out rather than pulled from a dependency because the icon is four
 * shapes — a rounded square and three waves — and everything about this project
 * is self-hosted. Run with `npm run icons`; the PNGs are committed.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BACKGROUND = [0x0b, 0x12, 0x20]
const STROKE = [0x3e, 0xa6, 0xff]

/** The favicon's geometry, in its 32-unit viewBox, scaled to whatever size is asked for. */
const CORNER_RADIUS = 7 / 32
const WAVE_ROWS = [13 / 32, 20 / 32]
const WAVE_AMPLITUDE = 1.3 / 32
const WAVE_WIDTH = 2.4 / 32
const WAVE_PERIOD = 12 / 32
const MARGIN = 4 / 32

function pixel(x, y, size, inset) {
  const u = x / size
  const v = y / size

  // Rounded-square mask, so the icon sits properly in a launcher.
  const r = CORNER_RADIUS
  const dx = Math.max(r - u, 0, u - (1 - r))
  const dy = Math.max(r - v, 0, v - (1 - r))
  if (Math.hypot(dx, dy) > r) return null

  if (u < MARGIN * (1 - inset) || u > 1 - MARGIN * (1 - inset)) return BACKGROUND

  for (const row of WAVE_ROWS) {
    const centre = row + WAVE_AMPLITUDE * Math.sin((2 * Math.PI * (u - MARGIN)) / WAVE_PERIOD)
    if (Math.abs(v - centre) < WAVE_WIDTH / 2) return STROKE
  }

  return BACKGROUND
}

function render(size, inset) {
  // One filter byte per scanline, then RGBA.
  const raw = Buffer.alloc(size * (1 + size * 4))
  let offset = 0

  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0
    offset += 1
    for (let x = 0; x < size; x += 1) {
      const colour = pixel(x + 0.5, y + 0.5, size, inset)
      raw[offset] = colour?.[0] ?? 0
      raw[offset + 1] = colour?.[1] ?? 0
      raw[offset + 2] = colour?.[2] ?? 0
      raw[offset + 3] = colour === null ? 0 : 255
      offset += 4
    }
  }

  return png(size, raw)
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([length, body, crc])
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return c ^ 0xffffffff
}

function png(size, raw) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputs = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  // A maskable icon is cropped to whatever shape the launcher wants, so the
  // artwork is pulled in from the edges to survive it.
  ['icon-512-maskable.png', 512, 0.5],
]

for (const [name, size, inset] of outputs) {
  const file = join(root, 'public', name)
  writeFileSync(file, render(size, inset))
  console.log(`wrote public/${name} (${String(size)}px)`)
}
