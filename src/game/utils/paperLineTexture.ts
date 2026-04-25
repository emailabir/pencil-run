import Phaser from 'phaser';

export interface PaperLineTextureHandle {
  key: string;
  width: number;
  height: number;
}

export interface PaperLineTextureStroke {
  widthOffset: number;
  color: number;
  alpha: number;
  seed: number;
  amplitudeFactor: number;
}

export interface PaperLineTexturePalette {
  id: string;
  strokes: readonly PaperLineTextureStroke[];
}

export const NOTEBOOK_LINE_PALETTE: PaperLineTexturePalette = {
  id: 'notebook-blue',
  strokes: [
    { widthOffset: 4, color: 0xffffff, alpha: 0.08, seed: 9, amplitudeFactor: 0.13 },
    { widthOffset: 2, color: 0xc8dcff, alpha: 0.24, seed: 21, amplitudeFactor: 0.11 },
    { widthOffset: 0, color: 0x9ec4ff, alpha: 0.92, seed: 0, amplitudeFactor: 0.07 },
    { widthOffset: -0.45, color: 0x6d96d9, alpha: 0.96, seed: 37, amplitudeFactor: 0.035 },
  ],
};

export const OBSTACLE_LINE_PALETTE: PaperLineTexturePalette = {
  id: 'obstacle-black',
  strokes: [
    { widthOffset: 4, color: 0x000000, alpha: 0.05, seed: 9, amplitudeFactor: 0.13 },
    { widthOffset: 2, color: 0x000000, alpha: 0.12, seed: 21, amplitudeFactor: 0.11 },
    { widthOffset: 0, color: 0x191919, alpha: 0.92, seed: 0, amplitudeFactor: 0.07 },
    { widthOffset: -0.45, color: 0x000000, alpha: 0.95, seed: 37, amplitudeFactor: 0.035 },
  ],
};

export function ensurePaperLineTexture(
  scene: Phaser.Scene,
  textureWidth: number,
  lineThickness: number,
  palette: PaperLineTexturePalette,
): PaperLineTextureHandle {
  const width = Math.max(64, Math.ceil(textureWidth));
  const thickness = Math.max(2, lineThickness);
  const height = Math.max(16, Math.ceil(thickness * 2.4));
  const key = `paper-line-${palette.id}-${width}x${height}-t${Math.round(thickness * 10)}`;

  if (scene.textures.exists(key)) {
    return { key, width, height };
  }

  const graphics = scene.add.graphics({ x: 0, y: 0 }).setVisible(false);
  const midY = height / 2;
  const step = 8;

  const stroke = (strokeWidth: number, color: number, alpha: number, seed: number, amplitude: number): void => {
    graphics.lineStyle(strokeWidth, color, alpha);
    graphics.beginPath();

    for (let x = 0; x <= width; x += step) {
      const primaryWave = Math.sin((x + seed) * 0.028) * amplitude;
      const secondaryWave = Math.sin((x + seed * 0.6) * 0.071) * amplitude * 0.45;
      const y = midY + primaryWave + secondaryWave;

      if (x === 0) {
        graphics.moveTo(x, y);
      } else {
        graphics.lineTo(x, y);
      }
    }

    graphics.strokePath();
  };

  graphics.clear();

  for (const entry of palette.strokes) {
    const strokeWidth = entry.widthOffset >= 0
      ? thickness + entry.widthOffset
      : thickness * (1 + entry.widthOffset);

    stroke(
      Math.max(1, strokeWidth),
      entry.color,
      entry.alpha,
      entry.seed,
      thickness * entry.amplitudeFactor,
    );
  }

  graphics.generateTexture(key, width, height);
  graphics.destroy();

  return { key, width, height };
}