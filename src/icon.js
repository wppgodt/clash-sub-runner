"use strict";

const APP_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="6" y="6" width="52" height="52" rx="12" fill="#27a1a1"/>
  <path d="M39 22.5c-2-2-4.5-3-7.5-3-7 0-11.5 5-11.5 12.5S24.5 44.5 31.5 44.5c3.1 0 5.8-1.1 7.8-3.2" fill="none" stroke="#0e1726" stroke-width="7" stroke-linecap="round"/>
  <path d="M40.5 18.5c-2.4-2.3-5.6-3.5-9.4-3.5C20.8 15 14 22 14 32s6.8 17 17.1 17c4 0 7.4-1.3 9.9-3.8" fill="none" stroke="#e8fbff" stroke-width="4" stroke-linecap="round"/>
</svg>`;

function createIcoBuffer() {
  const width = 32;
  const height = 32;
  const pixels = Buffer.alloc(width * height * 4, 0);
  const teal = [0x27, 0xa1, 0xa1, 0xff];
  const navy = [0x0e, 0x17, 0x26, 0xff];
  const white = [0xe8, 0xfb, 0xff, 0xff];

  drawRoundedRect(pixels, width, height, 3, 3, 26, 26, 6, teal);
  drawRect(pixels, width, height, 10, 10, 4, 13, white);
  drawRect(pixels, width, height, 14, 10, 9, 4, white);
  drawRect(pixels, width, height, 14, 19, 9, 4, white);
  drawRect(pixels, width, height, 12, 13, 4, 7, navy);
  drawRect(pixels, width, height, 16, 13, 7, 3, navy);
  drawRect(pixels, width, height, 16, 17, 7, 3, navy);

  const xor = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const src = (y * width + x) * 4;
      const dst = ((height - 1 - y) * width + x) * 4;
      xor[dst] = pixels[src + 2];
      xor[dst + 1] = pixels[src + 1];
      xor[dst + 2] = pixels[src];
      xor[dst + 3] = pixels[src + 3];
    }
  }

  const andMask = Buffer.alloc(height * 4, 0);
  const dibSize = 40 + xor.length + andMask.length;
  const file = Buffer.alloc(6 + 16 + dibSize);
  let offset = 0;
  file.writeUInt16LE(0, offset); offset += 2;
  file.writeUInt16LE(1, offset); offset += 2;
  file.writeUInt16LE(1, offset); offset += 2;
  file.writeUInt8(width, offset); offset += 1;
  file.writeUInt8(height, offset); offset += 1;
  file.writeUInt8(0, offset); offset += 1;
  file.writeUInt8(0, offset); offset += 1;
  file.writeUInt16LE(1, offset); offset += 2;
  file.writeUInt16LE(32, offset); offset += 2;
  file.writeUInt32LE(dibSize, offset); offset += 4;
  file.writeUInt32LE(6 + 16, offset); offset += 4;

  file.writeUInt32LE(40, offset); offset += 4;
  file.writeInt32LE(width, offset); offset += 4;
  file.writeInt32LE(height * 2, offset); offset += 4;
  file.writeUInt16LE(1, offset); offset += 2;
  file.writeUInt16LE(32, offset); offset += 2;
  file.writeUInt32LE(0, offset); offset += 4;
  file.writeUInt32LE(xor.length, offset); offset += 4;
  file.writeInt32LE(0, offset); offset += 4;
  file.writeInt32LE(0, offset); offset += 4;
  file.writeUInt32LE(0, offset); offset += 4;
  file.writeUInt32LE(0, offset); offset += 4;
  xor.copy(file, offset); offset += xor.length;
  andMask.copy(file, offset);
  return file;
}

function drawRoundedRect(pixels, width, height, x, y, w, h, radius, color) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const dx = xx < x + radius ? x + radius - xx : xx >= x + w - radius ? xx - (x + w - radius - 1) : 0;
      const dy = yy < y + radius ? y + radius - yy : yy >= y + h - radius ? yy - (y + h - radius - 1) : 0;
      if (dx * dx + dy * dy <= radius * radius || dx === 0 || dy === 0) {
        setPixel(pixels, width, height, xx, yy, color);
      }
    }
  }
}

function drawRect(pixels, width, height, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      setPixel(pixels, width, height, xx, yy, color);
    }
  }
}

function setPixel(pixels, width, height, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  const offset = (y * width + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

module.exports = {
  APP_ICON_SVG,
  createIcoBuffer
};
