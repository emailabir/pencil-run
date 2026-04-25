import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(scriptDir, '../public/pencil-player.png');
const targetPath = path.resolve(scriptDir, '../public/pencil-player-clean.png');

function decodePng(filePath) {
  const data = fs.readFileSync(filePath);

  if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`Unsupported file format for ${filePath}`);
  }

  let position = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (position < data.length) {
    const chunkLength = data.readUInt32BE(position);
    const chunkType = data.toString('ascii', position + 4, position + 8);
    const chunkData = data.subarray(position + 8, position + 8 + chunkLength);

    if (chunkType === 'IHDR') {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
    } else if (chunkType === 'IDAT') {
      idatChunks.push(chunkData);
    }

    position += chunkLength + 12;

    if (chunkType === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`Expected an 8-bit RGBA PNG. Received bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const compressed = Buffer.concat(idatChunks);
  const raw = zlib.inflateSync(compressed);
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(width * height * bytesPerPixel);

  const paethPredictor = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);

    if (pa <= pb && pa <= pc) {
      return a;
    }

    return pb <= pc ? b : c;
  };

  let readIndex = 0;
  let writeIndex = 0;

  for (let y = 0; y < height; y += 1) {
    const filterType = raw[readIndex];
    readIndex += 1;

    for (let x = 0; x < stride; x += 1) {
      const source = raw[readIndex];
      readIndex += 1;

      const left = x >= bytesPerPixel ? pixels[writeIndex + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[writeIndex - stride + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[writeIndex - stride + x - bytesPerPixel] : 0;

      let value = 0;

      switch (filterType) {
        case 0:
          value = source;
          break;
        case 1:
          value = (source + left) & 255;
          break;
        case 2:
          value = (source + up) & 255;
          break;
        case 3:
          value = (source + Math.floor((left + up) / 2)) & 255;
          break;
        case 4:
          value = (source + paethPredictor(left, up, upLeft)) & 255;
          break;
        default:
          throw new Error(`Unsupported PNG filter type: ${filterType}`);
      }

      pixels[writeIndex + x] = value;
    }

    writeIndex += stride;
  }

  return { width, height, pixels };
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];

    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function encodePng({ width, height, pixels }, outputPath) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const pixelStart = y * stride;
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, pixelStart, pixelStart + stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    createChunk('IHDR', ihdr),
    createChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    createChunk('IEND', Buffer.alloc(0)),
  ]);

  fs.writeFileSync(outputPath, png);
}

function toIndex(width, x, y) {
  return y * width + x;
}

function alphaAt(pixels, width, x, y) {
  return pixels[(toIndex(width, x, y) * 4) + 3];
}

function contiguousBands(rows) {
  const sorted = [...rows].sort((a, b) => a - b);
  const bands = [];

  for (const row of sorted) {
    const lastBand = bands[bands.length - 1];

    if (lastBand && row === lastBand.end + 1) {
      lastBand.end = row;
    } else {
      bands.push({ start: row, end: row });
    }
  }

  return bands;
}

function computeComponents(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const components = [];

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || seen[index]) {
      continue;
    }

    const stack = [index];
    const pixels = [];
    seen[index] = 1;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;

    while (stack.length > 0) {
      const current = stack.pop();
      pixels.push(current);

      const x = current % width;
      const y = Math.floor(current / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      if (x > 0) {
        const next = current - 1;
        if (mask[next] && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }

      if (x + 1 < width) {
        const next = current + 1;
        if (mask[next] && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }

      if (y > 0) {
        const next = current - width;
        if (mask[next] && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }

      if (y + 1 < height) {
        const next = current + width;
        if (mask[next] && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }

    components.push({
      id: components.length,
      size: pixels.length,
      minX,
      maxX,
      minY,
      maxY,
      pixels,
    });
  }

  return components;
}

function boxesAreNear(a, b) {
  const horizontalGap = Math.max(0, Math.max(a.minX - b.maxX - 1, b.minX - a.maxX - 1));
  const verticalGap = Math.max(0, Math.max(a.minY - b.maxY - 1, b.minY - a.maxY - 1));

  return horizontalGap <= 12 && verticalGap <= 16;
}

function hasNearbyPixel(mask, width, y, x, radius) {
  const start = Math.max(0, x - radius);
  const end = Math.min(width - 1, x + radius);

  for (let sampleX = start; sampleX <= end; sampleX += 1) {
    if (mask[toIndex(width, sampleX, y)]) {
      return true;
    }
  }

  return false;
}

function rowOpaqueCounts(pixels, width, height) {
  return Array.from({ length: height }, (_, y) => {
    let count = 0;

    for (let x = 0; x < width; x += 1) {
      if (alphaAt(pixels, width, x, y) > 0) {
        count += 1;
      }
    }

    return count;
  });
}

function main() {
  const source = decodePng(sourcePath);
  const { width, height, pixels } = source;
  const counts = rowOpaqueCounts(pixels, width, height);

  const lineRows = new Set();
  for (let y = 0; y < height; y += 1) {
    if (counts[y] > width * 0.83) {
      lineRows.add(y);
    }
  }

  const baseMask = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    if (lineRows.has(y)) {
      continue;
    }

    for (let x = 0; x < width; x += 1) {
      if (alphaAt(pixels, width, x, y) > 0) {
        baseMask[toIndex(width, x, y)] = 1;
      }
    }
  }

  const components = computeComponents(baseMask, width, height);
  const selectedIds = new Set(components.filter((component) => component.size >= 500).map((component) => component.id));

  let changed = true;
  while (changed) {
    changed = false;

    for (const component of components) {
      if (selectedIds.has(component.id) || component.size < 80) {
        continue;
      }

      const touchesSelection = components.some(
        (selectedComponent) => selectedIds.has(selectedComponent.id) && boxesAreNear(component, selectedComponent),
      );

      if (touchesSelection) {
        selectedIds.add(component.id);
        changed = true;
      }
    }
  }

  const keepMask = new Uint8Array(width * height);
  const selectedComponents = components.filter((component) => selectedIds.has(component.id));

  for (const component of selectedComponents) {
    for (const pixelIndex of component.pixels) {
      keepMask[pixelIndex] = 1;
    }
  }

  const bands = contiguousBands(lineRows);

  for (const band of bands) {
    let above = band.start - 1;
    while (above >= 0) {
      let found = false;
      for (let x = 0; x < width; x += 1) {
        if (keepMask[toIndex(width, x, above)]) {
          found = true;
          break;
        }
      }
      if (found) {
        break;
      }
      above -= 1;
    }

    let below = band.end + 1;
    while (below < height) {
      let found = false;
      for (let x = 0; x < width; x += 1) {
        if (keepMask[toIndex(width, x, below)]) {
          found = true;
          break;
        }
      }
      if (found) {
        break;
      }
      below += 1;
    }

    if (above < 0 || below >= height || below - above > 14) {
      continue;
    }

    const supportRadius = 14;

    for (let y = band.start; y <= band.end; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (alphaAt(pixels, width, x, y) === 0) {
          continue;
        }

        const supportedAbove = hasNearbyPixel(keepMask, width, above, x, supportRadius);
        const supportedBelow = hasNearbyPixel(keepMask, width, below, x, supportRadius);

        if (supportedAbove && supportedBelow) {
          keepMask[toIndex(width, x, y)] = 1;
        }
      }
    }
  }

  const finalComponents = computeComponents(keepMask, width, height).sort((a, b) => b.size - a.size);
  const [largestComponent] = finalComponents;
  const finalSelectedIds = new Set();

  for (const component of finalComponents) {
    if (component.id === largestComponent.id) {
      finalSelectedIds.add(component.id);
      continue;
    }

    if (component.size >= 60 && boxesAreNear(component, largestComponent)) {
      finalSelectedIds.add(component.id);
    }
  }

  const outputPixels = Buffer.alloc(pixels.length, 0);

  for (const component of finalComponents) {
    if (!finalSelectedIds.has(component.id)) {
      continue;
    }

    for (const pixelIndex of component.pixels) {
      const sourceIndex = pixelIndex * 4;
      outputPixels[sourceIndex] = pixels[sourceIndex];
      outputPixels[sourceIndex + 1] = pixels[sourceIndex + 1];
      outputPixels[sourceIndex + 2] = pixels[sourceIndex + 2];
      outputPixels[sourceIndex + 3] = pixels[sourceIndex + 3];
    }
  }

  encodePng({ width, height, pixels: outputPixels }, targetPath);

  const outputMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(outputPixels, width, x, y) > 0) {
        outputMask[toIndex(width, x, y)] = 1;
      }
    }
  }

  const borderPixels = [];
  for (let x = 0; x < width; x += 1) {
    if (outputMask[toIndex(width, x, 0)]) borderPixels.push(`top:${x}`);
    if (outputMask[toIndex(width, x, height - 1)]) borderPixels.push(`bottom:${x}`);
  }
  for (let y = 0; y < height; y += 1) {
    if (outputMask[toIndex(width, 0, y)]) borderPixels.push(`left:${y}`);
    if (outputMask[toIndex(width, width - 1, y)]) borderPixels.push(`right:${y}`);
  }

  const cleanedCounts = rowOpaqueCounts(outputPixels, width, height);
  const largestRowCount = Math.max(...cleanedCounts);

  console.log(
    JSON.stringify(
      {
        source: path.relative(process.cwd(), sourcePath),
        output: path.relative(process.cwd(), targetPath),
        selectedComponents: selectedComponents.map(({ size, minX, maxX, minY, maxY }) => ({
          size,
          minX,
          maxX,
          minY,
          maxY,
        })),
        lineBands: bands,
        outputStats: {
          largestRowCount,
          borderPixelCount: borderPixels.length,
          borderPixels: borderPixels.slice(0, 20),
        },
      },
      null,
      2,
    ),
  );
}

main();