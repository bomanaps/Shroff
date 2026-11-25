"use strict";

function shroffIdenticon(fingerprint, size) {
  const cells = 5;
  const cell = Math.floor(size / cells);
  const bytes = [];
  for (let i = 0; i < fingerprint.length - 1; i += 2) {
    bytes.push(parseInt(fingerprint.slice(i, i + 2), 16) || 0);
  }
  const hue = ((bytes[0] << 8) | bytes[1]) % 360;
  const fg = `oklch(0.78 0.11 ${hue})`;
  const bg = `oklch(0.22 0.03 ${hue})`;

  let rects = "";
  let bit = 0;
  for (let col = 0; col < Math.ceil(cells / 2); col++) {
    for (let row = 0; row < cells; row++) {
      const byte = bytes[(bit >> 3) % bytes.length];
      const on = ((byte >> (bit % 8)) & 1) === 1;
      bit++;
      if (!on) continue;
      rects += `<rect x="${col * cell}" y="${row * cell}" width="${cell}" height="${cell}"/>`;
      const mirror = cells - 1 - col;
      if (mirror !== col) {
        rects += `<rect x="${mirror * cell}" y="${row * cell}" width="${cell}" height="${cell}"/>`;
      }
    }
  }
  const px = cells * cell;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${px} ${px}" role="img" aria-label="referee identicon">
<rect width="${px}" height="${px}" fill="${bg}"/><g fill="${fg}">${rects}</g></svg>`;
}
