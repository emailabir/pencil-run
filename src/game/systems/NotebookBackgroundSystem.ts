import Phaser from 'phaser';
import { GAME_CONFIG } from '../core/gameConfig';
import { NOTEBOOK_LINE_PALETTE, ensurePaperLineTexture } from '../utils/paperLineTexture';

export class NotebookBackgroundSystem {
  private readonly lines: Phaser.GameObjects.Image[] = [];

  private readonly paperShadow: Phaser.GameObjects.Rectangle;

  private readonly lineCropX: number;

  private offset = 0;

  constructor(private readonly scene: Phaser.Scene) {
    const { width, height } = this.scene.scale;
    const lineTexture = ensurePaperLineTexture(this.scene, width, 2, NOTEBOOK_LINE_PALETTE);
    this.lineCropX = Math.max(0, Math.round((lineTexture.width - width) / 2));

    this.paperShadow = this.scene.add
      .rectangle(width / 2 + 4, height / 2 + 4, width + 8, height + 8, 0x14243f, 0.12)
      .setDepth(-25);

    this.scene.add.rectangle(width / 2, height / 2, width, height, 0xfdfcf6).setDepth(-24);

    const gap = Number(GAME_CONFIG.world.notebookLineGap);
    const lineCount = Math.ceil(height / gap) + 3;

    for (let i = 0; i < lineCount; i += 1) {
      const y = i * gap;
      const alpha = i % 2 === 0 ? 0.72 : 0.56;
      const line = this.scene.add
        .image(width / 2, y, lineTexture.key)
        .setCrop(this.lineCropX, 0, width, lineTexture.height)
        .setAlpha(alpha)
        .setDepth(-12);
      this.lines.push(line);
    }

    this.scene.add.rectangle(30, height / 2, 3, height, 0xff9cad, 0.88).setDepth(-11);

    for (let i = 0; i < 24; i += 1) {
      const y = (height / 24) * i + 8;
      this.scene.add.circle(16, y, 2.5, 0xd8dbe0).setDepth(-10);
    }
  }

  update(deltaSeconds: number, scrollSpeed: number): void {
    const gap = Number(GAME_CONFIG.world.notebookLineGap);
    const { height, width } = this.scene.scale;

    this.offset += scrollSpeed * deltaSeconds;
    while (this.offset >= gap) {
      this.offset -= gap;
    }

    this.paperShadow.setPosition(width / 2 + 4, height / 2 + 4 + this.offset * 0.04);

    for (let i = 0; i < this.lines.length; i += 1) {
      this.lines[i].y = i * gap + this.offset - gap;
      if (this.lines[i].y > height + gap) {
        this.lines[i].y -= this.lines.length * gap;
      }
    }
  }
}
