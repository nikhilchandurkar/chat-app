/**
 * Lightweight zero-dependency GIF89a animated encoder (RGB 3-3-2 256-color palette + LZW)
 * Produces looping animated `.gif` Blobs/Files directly from canvas ImageData frames.
 */

const buildRgb332Palette = () => {
  const palette = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const r = (i >> 5) & 0x07;
    const g = (i >> 2) & 0x07;
    const b = i & 0x03;
    palette[i * 3] = Math.round((r * 255) / 7);
    palette[i * 3 + 1] = Math.round((g * 255) / 7);
    palette[i * 3 + 2] = Math.round((b * 255) / 3);
  }
  return palette;
};

const PALETTE_RGB332 = buildRgb332Palette();

const mapRgbaToIndices = (rgba, pixelCount) => {
  const indices = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const p = i * 4;
    const a = rgba[p + 3];
    if (a < 16) {
      // Dark neutral background fallback for transparent canvas pixels
      indices[i] = 0;
      continue;
    }
    const r = rgba[p] >> 5;
    const g = rgba[p + 1] >> 5;
    const b = rgba[p + 2] >> 6;
    indices[i] = (r << 5) | (g << 2) | b;
  }
  return indices;
};

const lzwEncode = (indices, minCodeSize = 8) => {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const output = [];

  let bitBuffer = 0;
  let bitCount = 0;
  const subBlock = [];

  const flushSubBlock = () => {
    if (subBlock.length > 0) {
      output.push(subBlock.length, ...subBlock);
      subBlock.length = 0;
    }
  };

  const writeBits = (code, width) => {
    bitBuffer |= code << bitCount;
    bitCount += width;
    while (bitCount >= 8) {
      subBlock.push(bitBuffer & 0xff);
      if (subBlock.length === 255) flushSubBlock();
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  let dict = new Map();
  let nextCode = eoiCode + 1;
  let codeSize = minCodeSize + 1;

  const resetDict = () => {
    dict = new Map();
    nextCode = eoiCode + 1;
    codeSize = minCodeSize + 1;
  };

  writeBits(clearCode, codeSize);

  let prefix = indices.length > 0 ? String(indices[0]) : "";
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const combined = `${prefix},${k}`;
    if (dict.has(combined)) {
      prefix = combined;
    } else {
      const prefixCode = prefix.includes(",") ? dict.get(prefix) : Number(prefix);
      writeBits(prefixCode, codeSize);

      if (nextCode < 4096) {
        dict.set(combined, nextCode++);
        if (nextCode > 1 << codeSize && codeSize < 12) {
          codeSize++;
        }
      } else {
        writeBits(clearCode, codeSize);
        resetDict();
      }
      prefix = String(k);
    }
  }

  if (prefix !== "") {
    const prefixCode = prefix.includes(",") ? dict.get(prefix) : Number(prefix);
    writeBits(prefixCode, codeSize);
  }
  writeBits(eoiCode, codeSize);

  if (bitCount > 0) {
    subBlock.push(bitBuffer & 0xff);
  }
  flushSubBlock();
  output.push(0x00); // Block terminator
  return output;
};

const writeU16LE = (arr, val) => {
  arr.push(val & 0xff, (val >> 8) & 0xff);
};

/**
 * Encodes an array of RGBA Uint8ClampedArray / ImageData frames into an animated GIF89a Blob.
 */
export function encodeFramesToGifBlob(frames, { width = 240, height = 240, delayCs = 16, loop = 0 } = {}) {
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error("At least 1 frame is required to encode GIF.");
  }

  const bytes = [];
  const pushStr = (s) => {
    for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
  };

  // GIF89a Header
  pushStr("GIF89a");

  // Logical Screen Descriptor
  writeU16LE(bytes, width);
  writeU16LE(bytes, height);
  // Global Color Table Flag (1), Color Res (7), Sort (0), Size of GCT (7 => 256 colors)
  bytes.push(0xf7, 0x00, 0x00);

  // Global Color Table (256 * 3 bytes)
  for (let i = 0; i < PALETTE_RGB332.length; i++) {
    bytes.push(PALETTE_RGB332[i]);
  }

  // Netscape 2.0 Looping Application Extension
  bytes.push(0x21, 0xff, 0x0b);
  pushStr("NETSCAPE2.0");
  bytes.push(0x03, 0x01);
  writeU16LE(bytes, loop);
  bytes.push(0x00);

  const pixelCount = width * height;
  for (const frame of frames) {
    const rgba = frame?.data ? frame.data : frame;
    const indices = mapRgbaToIndices(rgba, pixelCount);

    // Graphics Control Extension
    bytes.push(0x21, 0xf9, 0x04, 0x04);
    writeU16LE(bytes, Math.max(2, Math.round(delayCs)));
    bytes.push(0x00, 0x00);

    // Image Descriptor
    bytes.push(0x2c);
    writeU16LE(bytes, 0);
    writeU16LE(bytes, 0);
    writeU16LE(bytes, width);
    writeU16LE(bytes, height);
    bytes.push(0x00); // No local color table

    // LZW Image Data (minimum code size 8)
    bytes.push(0x08);
    const lzw = lzwEncode(indices, 8);
    for (let i = 0; i < lzw.length; i++) bytes.push(lzw[i]);
  }

  // GIF Trailer
  bytes.push(0x3b);
  return new Blob([new Uint8Array(bytes)], { type: "image/gif" });
}

export const GIF_PRESETS = [
  { id: "party", label: "Party 🎉", emoji: "🎉", text: "PARTY!", bgA: "#166534", bgB: "#22C55E", accent: "#FDE047" },
  { id: "love", label: "Sending Love ❤️", emoji: "❤️", text: "LOVE YOU!", bgA: "#9F1239", bgB: "#FB7185", accent: "#FFF1F2" },
  { id: "fire", label: "On Fire 🔥", emoji: "🔥", text: "LIT!", bgA: "#9A3412", bgB: "#F97316", accent: "#FEF08A" },
  { id: "gg", label: "GG 🏆", emoji: "🏆", text: "GG!", bgA: "#1E3A8A", bgB: "#3B82F6", accent: "#FACC15" },
  { id: "laugh", label: "HAHA 😂", emoji: "😂", text: "LMAO", bgA: "#854D0E", bgB: "#EAB308", accent: "#FFFFFF" },
  { id: "mindblown", label: "Mind Blown 🤯", emoji: "🤯", text: "WHOA!", bgA: "#581C87", bgB: "#A855F7", accent: "#E9D5FF" },
];

/**
 * Generates an animated looping GIF File directly in browser for a preset reaction card.
 */
export async function createPresetAnimatedGifFile(preset) {
  const width = 220;
  const height = 160;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const frames = [];
  const totalFrames = 10;

  for (let i = 0; i < totalFrames; i++) {
    const t = i / totalFrames;
    const pulse = Math.sin(t * Math.PI * 2);
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, preset.bgA);
    grad.addColorStop(1, preset.bgB);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Floating accent sparkles
    ctx.fillStyle = preset.accent;
    for (let s = 0; s < 6; s++) {
      const ang = (s / 6) * Math.PI * 2 + t * Math.PI * 2;
      const sx = width / 2 + Math.cos(ang) * (62 + pulse * 10);
      const sy = height / 2 + Math.sin(ang) * (44 + pulse * 8);
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5 + (s % 2), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const scale = 1 + pulse * 0.14;
    ctx.save();
    ctx.translate(width / 2, height / 2 - 14);
    ctx.scale(scale, scale);
    ctx.font = "48px sans-serif";
    ctx.fillText(preset.emoji, 0, 0);
    ctx.restore();

    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(preset.text, width / 2, height - 28 + pulse * 3);

    frames.push(ctx.getImageData(0, 0, width, height));
  }

  const blob = encodeFramesToGifBlob(frames, { width, height, delayCs: 9 });
  return new File([blob], `${preset.id}-${Date.now()}.gif`, { type: "image/gif" });
}

