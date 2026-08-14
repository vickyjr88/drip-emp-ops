/**
 * Reads pixel dimensions straight from an image file's header.
 *
 * Done by hand rather than with sharp/image-size because the CMS only needs
 * width and height for display, and sharp in particular pulls a native binary
 * into an Alpine image that currently builds without one. Unknown or corrupt
 * formats return null, and callers treat that as "dimensions unavailable"
 * rather than an upload failure -- the file itself is still perfectly usable.
 */
export type ImageDimensions = { width: number; height: number } | null;

export function readImageDimensions(buffer: Buffer): ImageDimensions {
  if (!buffer || buffer.length < 16) {
    return null;
  }

  return readPng(buffer) ?? readGif(buffer) ?? readWebp(buffer) ?? readJpeg(buffer) ?? null;
}

function readPng(buffer: Buffer): ImageDimensions {
  // 89 50 4E 47 0D 0A 1A 0A, then an IHDR chunk whose width/height are the
  // first two big-endian uint32s of its data.
  const isPng =
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  if (!isPng) return null;

  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readGif(buffer: Buffer): ImageDimensions {
  if (buffer.length < 10 || buffer.toString('ascii', 0, 3) !== 'GIF') return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function readWebp(buffer: Buffer): ImageDimensions {
  if (
    buffer.length < 30 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }

  const format = buffer.toString('ascii', 12, 16);

  if (format === 'VP8 ') {
    // Lossless of the simple bitstream: 14-bit dimensions after a 3-byte
    // start code at offset 23.
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }

  if (format === 'VP8L') {
    // 14-bit width/height packed into 4 bytes after the 1-byte signature.
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }

  if (format === 'VP8X') {
    // Extended format stores 24-bit minus-one dimensions.
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
    return { width, height };
  }

  return null;
}

function readJpeg(buffer: Buffer): ImageDimensions {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  // Walk the marker segments looking for a Start Of Frame, which carries the
  // dimensions. Everything else is skipped by its declared length.
  let offset = 2;
  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];

    // Standalone markers with no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    // SOF0-SOF15, excluding DHT (c4), JPGA (c8) and DAC (cc) which are not frames.
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength <= 0) {
      return null;
    }
    offset += 2 + segmentLength;
  }

  return null;
}
