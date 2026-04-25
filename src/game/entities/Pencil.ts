import Phaser from 'phaser';
import { GAME_CONFIG } from '../core/gameConfig';

export class Pencil {
  readonly body: Phaser.GameObjects.Rectangle;

  private readonly trailGraphics: Phaser.GameObjects.Graphics;

  private readonly sprite: Phaser.GameObjects.Image;

  private readonly tipMarker: Phaser.GameObjects.Arc | null;

  private readonly spriteSourceWidth: number;

  private readonly spriteSourceHeight: number;

  private readonly trailPoints: Phaser.Math.Vector2[] = [];

  private currentLeadRatio = 1;

  private currentHeight: number;

  private currentDisplayHeight: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.currentHeight = GAME_CONFIG.player.maxHeight;
    this.currentDisplayHeight = Number(GAME_CONFIG.player.spriteMaxDisplayHeight);

    this.body = scene.add
      .rectangle(x, y, GAME_CONFIG.player.width, this.currentHeight, 0x000000, 0)
      .setVisible(false);

    scene.physics.add.existing(this.body);
    const body = this.body.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    body.setSize(GAME_CONFIG.player.width, this.currentHeight, true);

    this.trailGraphics = scene.add.graphics().setDepth(1);
    this.sprite = scene.add
      .image(x, y, 'pencil-player')
      .setOrigin(Number(GAME_CONFIG.player.tipAnchorXRatio), Number(GAME_CONFIG.player.tipAnchorYRatio))
      .setDepth(2);
    this.tipMarker = GAME_CONFIG.player.debugTipMarker
      ? scene.add.circle(x, y, 4, 0xff4fd8, 0.9).setDepth(3)
      : null;
    this.spriteSourceWidth = this.sprite.width;
    this.spriteSourceHeight = this.sprite.height;

    this.syncSprite();
    this.trailPoints.push(this.getTrailSpawnWorldPosition());
    this.redrawTrail();
  }

  setX(x: number): void {
    this.body.setX(x);
    this.syncSprite();
  }

  setLeadRatio(ratio: number): void {
    const clamped = Phaser.Math.Clamp(ratio, 0, 1);
    this.currentLeadRatio = clamped;

    const minH = GAME_CONFIG.player.minHeight;
    const maxH = GAME_CONFIG.player.maxHeight;
    const nextHeight = Phaser.Math.Linear(minH, maxH, clamped);
    const nextDisplayHeight = Phaser.Math.Linear(
      Number(GAME_CONFIG.player.spriteMinDisplayHeight),
      Number(GAME_CONFIG.player.spriteMaxDisplayHeight),
      clamped,
    );

    if (
      Math.abs(nextHeight - this.currentHeight) < 0.2
      && Math.abs(nextDisplayHeight - this.currentDisplayHeight) < 0.2
    ) {
      return;
    }

    this.currentHeight = nextHeight;
    this.currentDisplayHeight = nextDisplayHeight;

    const physicsBody = this.body.body as Phaser.Physics.Arcade.Body;
    physicsBody.setSize(GAME_CONFIG.player.width, this.currentHeight, true);
    this.syncSprite();
  }

  updateTrail(scrollDelta: number, worldHeight: number): void {
    for (const point of this.trailPoints) {
      point.y += scrollDelta;
    }

    this.appendTrailPoint(this.getTrailSpawnWorldPosition());

    while (this.trailPoints.length > 1 && this.trailPoints[0].y > worldHeight + 24) {
      this.trailPoints.shift();
    }

    const maxPoints = Number(GAME_CONFIG.player.trailMaxPoints);
    while (this.trailPoints.length > maxPoints) {
      this.trailPoints.shift();
    }

    this.redrawTrail();
  }

  getPencilTipWorldPosition(): Phaser.Math.Vector2 {
    const offsetX = Number(GAME_CONFIG.player.tipOffsetX);
    const offsetY = Number(GAME_CONFIG.player.tipOffsetY);

    return new Phaser.Math.Vector2(this.sprite.x + offsetX, this.sprite.y + offsetY);
  }

  getTipPosition(): Phaser.Math.Vector2 {
    return this.getPencilTipWorldPosition();
  }

  private getTrailSpawnWorldPosition(): Phaser.Math.Vector2 {
    const tip = this.getPencilTipWorldPosition();
    const trailOffsetY = Number(GAME_CONFIG.player.trailTipSourceOffsetY) * this.getSpriteScale();

    return new Phaser.Math.Vector2(tip.x, tip.y + trailOffsetY);
  }

  private syncSprite(): void {
    const x = this.body.x;
    const tipY = this.body.y + (this.currentHeight * 0.5);
    const scale = this.getSpriteScale();

    this.sprite
      .setPosition(x, tipY)
      .setDisplaySize(this.spriteSourceWidth * scale, this.currentDisplayHeight);

    this.syncTipMarker();
  }

  private getSpriteScale(): number {
    return this.currentDisplayHeight / this.spriteSourceHeight;
  }

  private redrawTrail(): void {
    this.trailGraphics.clear();

    if (this.trailPoints.length < 2) {
      return;
    }

    const trailVisibility = this.getTrailVisibilityRatio();

    if (trailVisibility <= 0) {
      return;
    }

    const outerAlpha = Phaser.Math.Linear(0.14, 0.45, trailVisibility);
    const innerAlpha = Phaser.Math.Linear(0.3, 0.95, trailVisibility);

    this.trailGraphics.lineStyle(6, 0xc8d0dc, outerAlpha);
    this.trailGraphics.beginPath();
    this.trailGraphics.moveTo(this.trailPoints[0].x, this.trailPoints[0].y);
    for (let i = 1; i < this.trailPoints.length; i += 1) {
      this.trailGraphics.lineTo(this.trailPoints[i].x, this.trailPoints[i].y);
    }
    this.trailGraphics.strokePath();

    this.trailGraphics.lineStyle(3, 0x586273, innerAlpha);
    this.trailGraphics.beginPath();
    this.trailGraphics.moveTo(this.trailPoints[0].x, this.trailPoints[0].y);
    for (let i = 1; i < this.trailPoints.length; i += 1) {
      this.trailGraphics.lineTo(this.trailPoints[i].x, this.trailPoints[i].y);
    }
    this.trailGraphics.strokePath();
  }

  private appendTrailPoint(targetTip: Phaser.Math.Vector2): void {
    const lastPoint = this.trailPoints[this.trailPoints.length - 1];

    if (!lastPoint) {
      this.trailPoints.push(targetTip);
      return;
    }

    const spacing = Math.max(1, Number(GAME_CONFIG.player.trailPointSpacing));
    const distance = Phaser.Math.Distance.Between(lastPoint.x, lastPoint.y, targetTip.x, targetTip.y);

    if (distance <= 0.0) {
      lastPoint.copy(targetTip);
      return;
    }

    const steps = Math.max(1, Math.ceil(distance / spacing));

    for (let step = 1; step < steps; step += 1) {
      const progress = step / steps;
      this.trailPoints.push(
        new Phaser.Math.Vector2(
          Phaser.Math.Linear(lastPoint.x, targetTip.x, progress),
          Phaser.Math.Linear(lastPoint.y, targetTip.y, progress),
        ),
      );
    }

    this.trailPoints.push(targetTip);
  }

  private syncTipMarker(): void {
    if (!this.tipMarker) {
      return;
    }

    const tip = this.getPencilTipWorldPosition();
    this.tipMarker.setPosition(tip.x, tip.y);
  }

  private getTrailVisibilityRatio(): number {
    if (this.currentLeadRatio <= 0) {
      return 0;
    }

    const minScale = Number(GAME_CONFIG.player.spriteMinDisplayHeight) / this.spriteSourceHeight;
    const maxScale = Number(GAME_CONFIG.player.spriteMaxDisplayHeight) / this.spriteSourceHeight;
    const scaleRange = Math.max(maxScale - minScale, Number.EPSILON);

    return Phaser.Math.Clamp((this.getSpriteScale() - minScale) / scaleRange, 0, 1);
  }
}
