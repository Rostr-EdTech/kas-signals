// Minimal QR Code encoder for donation requests: byte mode, error correction level M, versions 1-10
// (up to 213 bytes). Layout follows ISO/IEC 18004; structure mirrors Project Nayuki's reference
// implementation. Coordinates are (x = column, y = row).

const EC_M = {                      // version: [EC codewords per block, [[blocks, data codewords per block], ...]]
  1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]],
  6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]], 9: [22, [[3, 36], [2, 37]]],
  10: [26, [[4, 43], [1, 44]]],
};
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

// GF(256) arithmetic with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1
const EXP = new Array(512), LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsRemainder(data, degree) {
  let gen = [1];                                  // generator polynomial, highest power first
  for (let i = 0; i < degree; i++) {
    const next = new Array(gen.length + 1).fill(0);
    gen.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= mul(c, EXP[i]); });
    gen = next;
  }
  const rem = new Array(degree).fill(0);
  for (const b of data) {
    const f = b ^ rem.shift();
    rem.push(0);
    for (let j = 0; j < degree; j++) rem[j] ^= mul(gen[j + 1], f);
  }
  return rem;
}

function codewords(bytes, version) {
  const [ec, groups] = EC_M[version];
  const total = groups.reduce((a, [n, d]) => a + n * d, 0);
  const bits = [];
  const put = (v, len) => { for (let i = len - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(0b0100, 4);                                 // byte mode
  put(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  for (let i = 0; i < 4 && bits.length < total * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < total; pad ^= 0xec ^ 0x11) data.push(pad);

  const blocks = [];
  let k = 0;
  for (const [n, d] of groups) for (let i = 0; i < n; i++) { blocks.push(data.slice(k, k + d)); k += d; }
  const ecBlocks = blocks.map((b) => rsRemainder(b, ec));
  const out = [];
  const longest = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const e of ecBlocks) out.push(e[i]);
  return out;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function build(version, cw, mask) {
  const size = 17 + 4 * version;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }      // timing
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]])                          // finders + separators
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  const al = ALIGN[version], last = al.length - 1;
  al.forEach((ay, i) => al.forEach((ax, j) => {                                           // alignment
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
      set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));

  const drawFormat = (m) => {
    const data = (0b00 << 3) | m;                 // level M = 00
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);                       // dark module
  };
  drawFormat(mask);
  if (version >= 7) {                             // version information
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1, a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, dark); set(b, a, dark);
    }
  }

  let i = 0;                                      // data, in the zigzag order
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
      if (!fn[y][x] && i < cw.length * 8) { mod[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) mod[y][x] = !mod[y][x];
  return mod;
}

// Standard penalty score: lower is easier to scan
function penalty(m) {
  const n = m.length;
  let score = 0, dark = 0;
  const lines = [];
  for (let i = 0; i < n; i++) { lines.push(m[i]); lines.push(m.map((row) => row[i])); }
  for (const line of lines) {
    let run = 1;
    for (let k = 1; k <= n; k++) {
      if (k < n && line[k] === line[k - 1]) run++;
      else { if (run >= 5) score += run - 2; run = 1; }
    }
    const s = line.map((b) => (b ? 1 : 0)).join("");
    for (const pat of ["10111010000", "00001011101"]) for (let k = s.indexOf(pat); k >= 0; k = s.indexOf(pat, k + 1)) score += 40;
  }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
  }
  m.forEach((row) => row.forEach((b) => { if (b) dark++; }));
  score += Math.floor(Math.abs((dark * 20) / (n * n) - 10)) * 10;
  return score;
}

// Returns the module matrix (true = dark) for `text`, or null if it doesn't fit in version 10
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  const version = Object.keys(EC_M).map(Number).find((v) => {
    const total = EC_M[v][1].reduce((a, [n, d]) => a + n * d, 0);
    return 4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= total * 8;
  });
  if (!version) return null;
  const cw = codewords(bytes, version);
  let best = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = build(version, cw, mask), s = penalty(m);
    if (s < bestScore) { best = m; bestScore = s; }
  }
  return best;
}

// SVG markup with a 4-module quiet zone; dark modules are drawn as one path
export function qrSvg(text, { label = "QR code" } = {}) {
  const m = qrMatrix(text);
  if (!m) return null;
  const n = m.length, q = 4, size = n + 2 * q;
  let d = "";
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + q} ${y + q}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="${label}">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
