// WAV in and out for the scripts and tests (the page writes its own in index.html's saveTake).

/** 16-bit PCM or 32-bit float WAV → { rate, data } mono (channels averaged). */
export function readWav(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (String.fromCharCode(...buf.subarray(0, 4)) !== 'RIFF') throw new Error('not a RIFF/WAV file');
  let off = 12, fmt, data;
  while (off + 8 <= buf.length) {
    const id = String.fromCharCode(...buf.subarray(off, off + 4)), size = dv.getUint32(off + 4, true);
    if (id === 'fmt ') fmt = { tag: dv.getUint16(off + 8, true), channels: dv.getUint16(off + 10, true), rate: dv.getUint32(off + 12, true), bits: dv.getUint16(off + 22, true) };
    if (id === 'data') data = { start: off + 8, size: Math.min(size, buf.length - off - 8) };
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('missing fmt or data chunk');
  const { channels, rate, bits, tag } = fmt, bytes = bits / 8, n = Math.floor(data.size / bytes / channels), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) {
      const p = data.start + (i * channels + c) * bytes;
      s += tag === 3 ? dv.getFloat32(p, true) : bits === 24 ? (dv.getUint8(p) | (dv.getUint8(p + 1) << 8) | (dv.getInt8(p + 2) << 16)) / 8388608 : bits === 32 ? dv.getInt32(p, true) / 2147483648 : dv.getInt16(p, true) / 32768;
    }
    out[i] = s / channels;
  }
  return { rate, data: out };
}

/** Mono Float32 → 16-bit PCM WAV bytes. */
export function writeWav(data, rate) {
  const buf = Buffer.alloc(44 + data.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + data.length * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(data.length * 2, 40);
  for (let i = 0; i < data.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[i])) * 32767), 44 + i * 2);
  return buf;
}
