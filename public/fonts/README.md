# Bundled score fonts

## JianpuASCII.ttf

Unmodified Jianpu ASCII **2.3**, by Robert Winslow, restored from [upstream commit 72b0b9d7](https://github.com/RobertWinslow/jianpu-ascii-font/blob/72b0b9d7b984817e1a64e849141f3354b0178b94/JianpuASCII.ttf). Distributed under the [SIL Open Font License](JianpuASCII-OFL.txt). The source copy at `jianpu-font/JianpuASCII.ttf` is identical.

SHA-256: `a511bad0775ba4b1ef3d0c8c65f7f77120483730cd7283dc2a822fa7dcf8be72`.

The former 57,915-byte file was the 46,968-byte upstream binary decoded as UTF-8 with replacement, then encoded as UTF-8. That transformation reproduces the old file exactly and destroys binary offsets. Always copy font assets as bytes.

## BachSlurs.ttf

The existing Bach-slurs font retains its original attribution, glyph order, outlines, character mappings, horizontal metrics and hint programs. Only malformed font metadata and search tables were rebuilt with FontTools 4.60.2:

- Rebuild the SFNT directory and format-4 cmap search fields.
- Change the invalid `maxp.maxZones` value from 3 to 2, as required by the [OpenType maxp specification](https://learn.microsoft.com/en-us/typography/opentype/spec/maxp).
- Serialize the existing post table without its extra trailing byte and recalculate checksums.

SHA-256: `b5d6a902d5dfb65d06fef8dbcf49203e4bb4e1accd0be6c17e3dbd348fefe7e7`.

Reproduction, using the original file from tag `v0.12.17` as `original.ttf`:

```python
from fontTools.ttLib import TTFont

font = TTFont('original.ttf', recalcTimestamp=False, recalcBBoxes=False)
font.getGlyphOrder()
font['maxp'].maxZones = 2
for table in font['cmap'].tables:
    table.cmap = dict(table.cmap)
font.save('BachSlurs.ttf')
```

## Loading and validation

`src/lib/fontFaceAssets.ts` and `public/sw.js` use matching versioned URLs for the repaired files. This avoids an older retained offline cache returning the former file. PDF embedding uses the same URLs.

The font-integrity regression checks the real files' directory fields, table bounds, alignment, checksums, maxZones and cmap search fields. Browser verification also loads both URL and embedded data sources; a parsed binary alone does not prove browser compatibility.
