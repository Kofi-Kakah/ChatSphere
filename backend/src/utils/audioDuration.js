const MPEG_1 = {
  layer1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  layer2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  layer3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
}
const MPEG_2 = {
  layer1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  layer2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  layer3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
const SAMPLE_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }

function mp3Duration(buffer) {
  let offset = 0
  if (buffer.toString('latin1', 0, 3) === 'ID3' && buffer.length >= 10) {
    const size = ((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f)
    offset = 10 + size
  }

  let samples = 0
  let sampleRate = 0
  let frames = 0
  while (offset + 4 <= buffer.length && frames < 1_000_000) {
    if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1
      continue
    }
    const versionBits = (buffer[offset + 1] >> 3) & 0x03
    const layerBits = (buffer[offset + 1] >> 1) & 0x03
    const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f
    const rateIndex = (buffer[offset + 2] >> 2) & 0x03
    const padding = (buffer[offset + 2] >> 1) & 0x01
    if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
      offset += 1
      continue
    }

    const layer = layerBits === 3 ? 'layer1' : layerBits === 2 ? 'layer2' : 'layer3'
    const table = versionBits === 3 ? MPEG_1 : MPEG_2
    const bitrate = table[layer][bitrateIndex] * 1000
    const rate = SAMPLE_RATES[versionBits][rateIndex]
    if (!bitrate || !rate) {
      offset += 1
      continue
    }

    const perFrame = layer === 'layer1' ? 384 : layer === 'layer3' && versionBits !== 3 ? 576 : 1152
    const length = layer === 'layer1'
      ? Math.floor((12 * bitrate / rate + padding) * 4)
      : Math.floor((layer === 'layer3' && versionBits !== 3 ? 72 : 144) * bitrate / rate) + padding
    if (length < 4 || offset + length > buffer.length) break

    sampleRate = rate
    samples += perFrame
    frames += 1
    offset += length
  }

  return sampleRate ? samples / sampleRate : null
}

function wavDuration(buffer) {
  if (buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WAVE') return null
  let offset = 12
  let byteRate = 0
  let dataSize = 0
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('latin1', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    if (id === 'fmt ' && size >= 12 && offset + 20 <= buffer.length) {
      byteRate = buffer.readUInt32LE(offset + 16)
    } else if (id === 'data') {
      dataSize = Math.min(size, buffer.length - offset - 8)
      break
    }
    offset += 8 + size + (size % 2)
  }
  return byteRate > 0 && dataSize > 0 ? dataSize / byteRate : null
}

function oggDuration(buffer) {
  let offset = 0
  let serial = null
  let firstPacket = null
  let lastGranule = 0n
  while (offset + 27 <= buffer.length) {
    if (buffer.toString('latin1', offset, offset + 4) !== 'OggS') {
      offset += 1
      continue
    }
    const headerType = buffer[offset + 5]
    const granule = buffer.readBigUInt64LE(offset + 6)
    const pageSerial = buffer.readUInt32LE(offset + 14)
    const segments = buffer[offset + 26]
    const tableStart = offset + 27
    const bodyStart = tableStart + segments
    if (bodyStart > buffer.length) break

    if (firstPacket === null && bodyStart < buffer.length && segments > 0) {
      firstPacket = buffer.subarray(bodyStart, Math.min(bodyStart + 64, buffer.length))
    }
    if (headerType & 0x02) serial = pageSerial
    if (serial === null || pageSerial === serial) {
      if (granule !== 0xffffffffffffffffn && granule > lastGranule) lastGranule = granule
    }

    let pageSize = 27 + segments
    for (let i = 0; i < segments; i += 1) pageSize += buffer[tableStart + i]
    offset += pageSize
  }

  if (!firstPacket || lastGranule === 0n) return null
  if (firstPacket[0] === 1 && firstPacket.toString('latin1', 1, 7) === 'vorbis') {
    const rate = firstPacket.readUInt32LE(12)
    return rate ? Number(lastGranule) / rate : null
  }
  if (firstPacket.toString('latin1', 0, 8) === 'OpusHead') {
    const preSkip = firstPacket.readUInt16LE(10)
    return Number(lastGranule - BigInt(preSkip)) / 48000
  }
  return null
}

function mp4Duration(buffer) {
  let index = buffer.indexOf('mvhd', 0, 'latin1')
  while (index > 0) {
    const version = buffer[index + 4]
    if (version === 0 && index + 24 <= buffer.length) {
      const timescale = buffer.readUInt32BE(index + 16)
      const duration = buffer.readUInt32BE(index + 20)
      if (timescale) return duration / timescale
    } else if (version === 1 && index + 32 <= buffer.length) {
      const timescale = buffer.readUInt32BE(index + 24)
      const duration = buffer.readBigUInt64BE(index + 28)
      if (timescale) return Number(duration) / timescale
    }
    index = buffer.indexOf('mvhd', index + 4, 'latin1')
  }
  return null
}

function webmDuration(buffer) {
  let scale = 1_000_000
  const scaleAt = buffer.indexOf(Buffer.from([0x2a, 0xd7, 0xb1]))
  if (scaleAt > 0 && scaleAt + 7 <= buffer.length) {
    const sizeByte = buffer[scaleAt + 3]
    if (sizeByte === 0x84) scale = buffer.readUInt32BE(scaleAt + 4)
  }
  const durationAt = buffer.indexOf(Buffer.from([0x44, 0x89]))
  if (durationAt < 0 || durationAt + 12 > buffer.length) return null
  const sizeByte = buffer[durationAt + 2]
  let value
  if (sizeByte === 0x84) value = buffer.readFloatBE(durationAt + 3)
  else if (sizeByte === 0x88) value = buffer.readDoubleBE(durationAt + 3)
  else return null
  return value > 0 ? (value * scale) / 1e9 : null
}

export function audioDuration(buffer, mimeType) {
  try {
    let duration = null
    if (mimeType === 'audio/mpeg') duration = mp3Duration(buffer)
    else if (mimeType === 'audio/wav') duration = wavDuration(buffer)
    else if (mimeType === 'audio/ogg') duration = oggDuration(buffer)
    else if (mimeType === 'audio/mp4' || mimeType === 'audio/x-m4a') duration = mp4Duration(buffer)
    else if (mimeType === 'audio/webm') duration = webmDuration(buffer)
    if (!Number.isFinite(duration) || duration <= 0) return null
    return Math.round(duration * 1000) / 1000
  } catch {
    return null
  }
}
