import Phaser from 'phaser';
import { GAME_CONFIG } from '../core/gameConfig';

export class HudSystem {
  private readonly scene: Phaser.Scene;

  private readonly celebrationQueue: string[] = [];

  private isCelebrationShowing = false;

  private readonly distanceText: Phaser.GameObjects.Text;

  private readonly levelText: Phaser.GameObjects.Text;

  private readonly leadText: Phaser.GameObjects.Text;

  private readonly pickupCountText: Phaser.GameObjects.Text;

  private readonly leadBarGraphics: Phaser.GameObjects.Graphics;

  private readonly closeCallText: Phaser.GameObjects.Text;

  private readonly lineCelebrationText: Phaser.GameObjects.Text;

  private readonly leadBarX = 24;

  private readonly leadBarY = 22;

  private readonly leadBarWidth = 168;

  private readonly leadBarHeight = 28;

  private readonly closeCallX = 66;

  private readonly closeCallY: number;

  private readonly lineCelebrationX: number;

  private readonly lineCelebrationY = 138;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const { width, height } = scene.scale;
    this.closeCallY = height - 220;
    this.lineCelebrationX = width / 2;

    scene.add
      .rectangle(width / 2 + 2, 42, width - 20, 72, 0x334365, 0.2)
      .setScrollFactor(0)
      .setDepth(44);

    scene.add
      .rectangle(width / 2, 40, width - 20, 72, 0xfef8e9)
      .setStrokeStyle(3, 0x1b2747)
      .setScrollFactor(0)
      .setDepth(45);

    this.leadBarGraphics = scene.add.graphics().setScrollFactor(0).setDepth(51);

    this.leadText = scene.add
      .text(this.leadBarX + this.leadBarWidth + 16, this.leadBarY + this.leadBarHeight / 2, 'LEAD', {
        fontFamily: 'Arial Black, Arial',
        fontSize: '26px',
        color: '#1a2749',
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(52);

    this.distanceText = scene.add
      .text(width / 2, 92, 'SCORE: 0m', {
        fontFamily: 'Arial Black, Arial',
        fontSize: '58px',
        color: '#102447',
      })
      .setOrigin(0.5)
      .setScale(0.42)
      .setScrollFactor(0)
      .setDepth(52);

    this.levelText = scene.add
      .text(width / 2, 118, 'LEVEL 1', {
        fontFamily: 'Arial Black, Arial',
        fontSize: '28px',
        color: '#344486',
      })
      .setOrigin(0.5)
      .setScale(0.42)
      .setScrollFactor(0)
      .setDepth(52);

    const eraserBack = scene.add.rectangle(0, 0, 56, 30, 0xff6f95).setStrokeStyle(3, 0x1a2748);
    const eraserCenter = scene.add.rectangle(0, 0, 24, 30, 0x3086ff).setStrokeStyle(2, 0x1a2748);
    const eraserTip = scene.add.rectangle(-22, 0, 10, 24, 0xffbad0).setStrokeStyle(2, 0x1a2748);
    const eraserTail = scene.add.rectangle(22, 0, 10, 24, 0xf7f7f7).setStrokeStyle(2, 0x1a2748);

    scene.add
      .container(width - 86, 32, [eraserBack, eraserCenter, eraserTip, eraserTail])
      .setScale(0.75)
      .setScrollFactor(0)
      .setDepth(52);

    this.pickupCountText = scene.add
      .text(width - 42, 32, 'x0', {
        fontFamily: 'Arial Black, Arial',
        fontSize: '36px',
        color: '#102447',
      })
      .setOrigin(0, 0.5)
      .setScale(0.5)
      .setScrollFactor(0)
      .setDepth(52);

    this.closeCallText = scene.add
      .text(66, height - 220, 'CLOSE\nCALL!', {
        fontFamily: 'Arial Black, Arial',
        fontSize: '44px',
        color: '#ffcc33',
        stroke: '#b21e21',
        strokeThickness: 10,
        align: 'center',
      })
      .setOrigin(0.5)
      .setScale(0.45)
      .setScrollFactor(0)
      .setDepth(52)
      .setAngle(-8)
      .setAlpha(0)
      .setVisible(false);

    this.lineCelebrationText = scene.add
      .text(this.lineCelebrationX, this.lineCelebrationY, '', {
        fontFamily: 'Arial Black, Arial',
        fontSize: '24px',
        color: '#24315d',
        backgroundColor: '#fff4bf',
        align: 'center',
        padding: {
          left: 14,
          right: 14,
          top: 8,
          bottom: 8,
        },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(53)
      .setAlpha(0)
      .setVisible(false);

    this.drawLeadBar(1);
  }

  update(distance: number, lead: number, eraserCount: number, level: number): void {
    this.distanceText.setText(`SCORE: ${distance}m`);
    this.levelText.setText(`LEVEL ${level}`);

    const leadMax = Number(GAME_CONFIG.lead.max);
    const ratio = Phaser.Math.Clamp(lead / leadMax, 0, 1);
    this.leadText.setText(`LEAD ${Math.round(ratio * 100)}%`);
    this.pickupCountText.setText(`x${eraserCount}`);
    this.drawLeadBar(ratio);
  }

  triggerCloseCall(): void {
    this.scene.tweens.killTweensOf(this.closeCallText);

    this.closeCallText
      .setVisible(true)
      .setAlpha(1)
      .setPosition(this.closeCallX, this.closeCallY + 8)
      .setScale(0.58);

    this.scene.tweens.add({
      targets: this.closeCallText,
      y: this.closeCallY,
      scaleX: 0.45,
      scaleY: 0.45,
      duration: 120,
      ease: 'Back.Out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.closeCallText,
          y: this.closeCallY - 8,
          alpha: 0,
          duration: 360,
          ease: 'Quad.In',
          onComplete: () => {
            this.closeCallText.setVisible(false);
          },
        });
      },
    });
  }

  triggerLineCrossCelebration(totalLinesCrossed: number, phrase: string): void {
    this.queueCelebration(`${totalLinesCrossed} lines crossed! ${phrase}`);
  }

  triggerLevelMilestone(level: number): void {
    this.queueCelebration(`MEGA SHOUTOUT! LEVEL ${level}!`);
  }

  private queueCelebration(message: string): void {
    this.celebrationQueue.push(message);

    if (!this.isCelebrationShowing) {
      this.showNextCelebration();
    }
  }

  private showNextCelebration(): void {
    const nextMessage = this.celebrationQueue.shift();

    if (!nextMessage) {
      this.isCelebrationShowing = false;
      return;
    }

    this.isCelebrationShowing = true;
    this.scene.tweens.killTweensOf(this.lineCelebrationText);

    this.lineCelebrationText
      .setText(nextMessage)
      .setVisible(true)
      .setAlpha(0)
      .setPosition(this.lineCelebrationX, this.lineCelebrationY + 10)
      .setScale(0.92);

    this.scene.tweens.add({
      targets: this.lineCelebrationText,
      y: this.lineCelebrationY,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
      ease: 'Quad.Out',
      onComplete: () => {
        this.scene.time.delayedCall(900, () => {
          this.scene.tweens.add({
            targets: this.lineCelebrationText,
            y: this.lineCelebrationY - 14,
            alpha: 0,
            duration: 320,
            ease: 'Quad.In',
            onComplete: () => {
              this.lineCelebrationText.setVisible(false);
              this.isCelebrationShowing = false;
              this.showNextCelebration();
            },
          });
        });
      },
    });
  }

  private drawLeadBar(ratio: number): void {
    const clamped = Phaser.Math.Clamp(ratio, 0, 1);
    const x = this.leadBarX;
    const y = this.leadBarY;
    const width = this.leadBarWidth;
    const height = this.leadBarHeight;
    const innerPad = 4;

    this.leadBarGraphics.clear();
    this.leadBarGraphics.fillStyle(0x0f1c3b);
    this.leadBarGraphics.fillRoundedRect(x, y, width, height, 12);

    const innerX = x + innerPad;
    const innerY = y + innerPad;
    const innerW = width - innerPad * 2;
    const innerH = height - innerPad * 2;

    this.leadBarGraphics.fillStyle(0x7a869e);
    this.leadBarGraphics.fillRoundedRect(innerX, innerY, innerW, innerH, 8);

    let remaining = innerW * clamped;
    const segmentWidth = innerW / 3;
    const segmentColors = [0xff8ab8, 0xffc727, 0xffde5a];
    let drawX = innerX;

    for (let i = 0; i < segmentColors.length && remaining > 0; i += 1) {
      const w = Math.min(segmentWidth, remaining);
      this.leadBarGraphics.fillStyle(segmentColors[i]);
      this.leadBarGraphics.fillRoundedRect(drawX, innerY, w, innerH, 6);
      drawX += w;
      remaining -= w;
    }

    if (clamped > 0) {
      this.leadBarGraphics.fillStyle(0xffffff, 0.28);
      this.leadBarGraphics.fillRoundedRect(innerX + 2, innerY + 1, Math.max(0, innerW * clamped - 4), 4, 2);
    }
  }
}
