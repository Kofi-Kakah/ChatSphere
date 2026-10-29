import { crc32, deflateSync } from 'node:zlib'
import sharp from 'sharp'

export async function makeJpeg({ width = 40, height = 30, exif = true } = {}) {
  const image = sharp({ create: { width, height, channels: 3, background: '#336699' } })
  if (!exif) return image.jpeg().toBuffer()
  return image.jpeg().withMetadata({
    exif: {
      IFD0: { Make: 'ChatSphereQA', Model: 'Fixture' },
      GPS: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '51/1 30/1 0/1',
        GPSLongitudeRef: 'W',
        GPSLongitude: '0/1 7/1 0/1',
      },
    },
  }).toBuffer()
}

export async function makeWebp({ width = 44, height = 33 } = {}) {
  return sharp({ create: { width, height, channels: 3, background: '#993366' } }).webp().toBuffer()
}

export async function makeAnimatedGif({ width = 20, height = 20, frames = 2 } = {}) {
  const inputs = await Promise.all(
    Array.from({ length: frames }, (_, index) => sharp({
      create: {
        width,
        height,
        channels: 4,
        background: index % 2 === 0 ? '#ff0000' : '#00ff00',
      },
    }).png().toBuffer()),
  )
  return sharp(inputs, { join: { animated: true } }).gif({ delay: 100 }).toBuffer()
}

export function padTo(buffer, size) {
  if (buffer.length > size) throw new Error(`fixture is already ${buffer.length} bytes, cannot pad to ${size}`)
  return Buffer.concat([buffer, Buffer.alloc(size - buffer.length)])
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

export function makeFakeDimensionPng(width, height) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.alloc(64))),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

export function makeZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const { name, data } of entries) {
    const nameBuffer = Buffer.from(name)
    const body = Buffer.from(data)
    const crc = crc32(body)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(body.length, 22)
    local.writeUInt16LE(nameBuffer.length, 26)
    const localRecord = Buffer.concat([local, nameBuffer, body])
    locals.push(localRecord)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(body.length, 24)
    central.writeUInt16LE(nameBuffer.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(Buffer.concat([central, nameBuffer]))
    offset += localRecord.length
  }
  const centralDirectory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralDirectory, end])
}

const OOXML = {
  docx: {
    part: 'word/document.xml',
    content: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
  },
  xlsx: {
    part: 'xl/workbook.xml',
    content: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
  },
  pptx: {
    part: 'ppt/presentation.xml',
    content: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
  },
}

export function makeOoxml(kind) {
  const spec = OOXML[kind]
  if (!spec) throw new Error(`unknown OOXML kind: ${kind}`)
  return makeZip([
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/${spec.part}" ContentType="${spec.content}"/></Types>`,
    },
    { name: spec.part, data: '<document/>' },
  ])
}

function ebmlElement(id, payload) {
  return Buffer.concat([Buffer.from(id, 'hex'), Buffer.from([0x80 | payload.length]), payload])
}

export function makeWebmAudio() {
  const children = Buffer.concat([
    ebmlElement('4286', Buffer.from([1])),
    ebmlElement('42f7', Buffer.from([1])),
    ebmlElement('42f2', Buffer.from([4])),
    ebmlElement('42f3', Buffer.from([8])),
    ebmlElement('4282', Buffer.from('webm')),
    ebmlElement('4287', Buffer.from([4])),
    ebmlElement('4285', Buffer.from([2])),
  ])
  return Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.from([0x80 | children.length]), children])
}

function ogg(codec) {
  return Buffer.concat([Buffer.from('OggS'), Buffer.alloc(24), codec, Buffer.alloc(64)])
}

export const audioFixtures = {
  mp3: () => Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(512)]),
  m4a: () => Buffer.from('00000020667479704d344120000002004d3441206d70343269736f6d00000000', 'hex'),
  wav: () => Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x24, 0, 0, 0]),
    Buffer.from('WAVEfmt '),
    Buffer.from([16, 0, 0, 0, 1, 0, 1, 0, 0x44, 0xac, 0, 0, 0x88, 0x58, 1, 0, 2, 0, 16, 0]),
    Buffer.from('data'),
    Buffer.from([0, 0, 0, 0]),
  ]),
  oggVorbis: () => ogg(Buffer.concat([Buffer.from([1]), Buffer.from('vorbis')])),
  oggOpus: () => ogg(Buffer.from('OpusHead')),
  webm: () => makeWebmAudio(),
}
