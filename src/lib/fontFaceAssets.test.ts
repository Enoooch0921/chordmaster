import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function checksum(bytes: Buffer) {
  let sum = 0;
  for (let offset = 0; offset < bytes.length; offset += 4) {
    let word = 0;
    for (let byte = 0; byte < 4; byte++) word = (word << 8) | (bytes[offset + byte] ?? 0);
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
}

// Real assets, not mocked fonts: catch text-encoding damage and the malformed
// SFNT/cmap search fields that made Chromium reject these bundled fonts.
describe.each(['JianpuASCII', 'BachSlurs'])('%s bundled font integrity', family => {
  it('has an intact TrueType directory and checksummed, aligned tables', () => {
    const bytes = readFileSync(`public/fonts/${family}.ttf`);
    expect(bytes.readUInt32BE(0)).toBe(0x00010000);
    const count = bytes.readUInt16BE(4);
    const selector = Math.floor(Math.log2(count));
    expect(bytes.readUInt16BE(6)).toBe(16 * 2 ** selector);
    expect(bytes.readUInt16BE(8)).toBe(selector);
    expect(bytes.readUInt16BE(10)).toBe(count * 16 - 16 * 2 ** selector);
    expect(checksum(bytes)).toBe(0xb1b0afba);
    for (let index = 0; index < count; index++) {
      const entry = 12 + index * 16;
      const tag = bytes.toString('ascii', entry, entry + 4);
      const offset = bytes.readUInt32BE(entry + 8), length = bytes.readUInt32BE(entry + 12);
      expect(offset, tag).toBeGreaterThanOrEqual(12 + count * 16);
      expect(offset % 4, tag).toBe(0);
      expect(offset + length, tag).toBeLessThanOrEqual(bytes.length);
      const table = Buffer.from(bytes.subarray(offset, offset + length));
      if (tag === 'head') table.writeUInt32BE(0, 8);
      expect(checksum(table), tag).toBe(bytes.readUInt32BE(entry + 4));
      if (tag === 'maxp' && table.readUInt32BE(0) === 0x00010000) {
        expect([1, 2]).toContain(table.readUInt16BE(14));
      }
      if (tag === 'cmap') {
        for (let map = 0; map < table.readUInt16BE(2); map++) {
          const start = table.readUInt32BE(4 + map * 8 + 4);
          if (table.readUInt16BE(start) !== 4) continue;
          const segments = table.readUInt16BE(start + 6) / 2;
          const entrySelector = Math.floor(Math.log2(segments));
          expect(table.readUInt16BE(start + 8)).toBe(2 * 2 ** entrySelector);
          expect(table.readUInt16BE(start + 10)).toBe(entrySelector);
          expect(table.readUInt16BE(start + 12)).toBe(segments * 2 - 2 * 2 ** entrySelector);
        }
      }
    }
  });
});
