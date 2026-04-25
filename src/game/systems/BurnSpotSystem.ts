import Phaser from 'phaser';
import { GAME_CONFIG } from '../core/gameConfig';
import type { ObstacleRowLayout } from './ObstacleSystem';

type BurnSpotState = 'warning' | 'active';

interface BurnSpot {
  rowId: number;
  x: number;
  y: number;
  age: number;
  state: BurnSpotState;
  warningTimeRemaining: number;
  footprintWidth: number;
  footprintHeight: number;
  textureSize: number;
  flameImage: Phaser.GameObjects.Image;
  glowImage: Phaser.GameObjects.Image;
  cueGraphics: Phaser.GameObjects.Graphics;
  hitZone: Phaser.GameObjects.Rectangle;
  seed: number;
}

type BurnPlacementPattern = 'edge-left' | 'edge-right' | 'lane-left' | 'lane-right';

interface BurnPlacementCandidate {
  x: number;
  blockedLeft: number;
  blockedRight: number;
}

const COLLISION_SCALE_X = 0.76;
const COLLISION_SCALE_Y = 0.72;
const FLAME_TEXTURE_KEY = 'fire-hazard';
const FLAME_TEXTURE_SCALE = 1.55;
const GLOW_SIZE_RATIO = 1.28;
const FLAME_BASE_OFFSET_Y = 0.72;
const MIN_LINE_TO_FIRE_GAP_PX = 8;
const MIN_VISUAL_TOP_OFFSET_RATIO = 0.35;
const MAX_DOWNWARD_SPAWN_JITTER_PX = 4;

export class BurnSpotSystem {
  readonly activeHazards: Phaser.Physics.Arcade.Group;

  private readonly burnSpots: BurnSpot[] = [];

  private lastProcessedRowId = -1;

  constructor(private readonly scene: Phaser.Scene) {
    this.activeHazards = this.scene.physics.add.group({
      allowGravity: false,
      immovable: true,
    });
  }

  update(
    deltaSeconds: number,
    scrollSpeed: number,
    worldHeight: number,
    obstacleRows: ReadonlyMap<number, readonly Phaser.GameObjects.Rectangle[]>,
    obstacleRowLayouts: ReadonlyMap<number, Readonly<ObstacleRowLayout>>,
  ): void {
    const difficultyRatio = this.getDifficultyRatio(scrollSpeed);
    this.processNewRows(obstacleRows, obstacleRowLayouts, difficultyRatio);

    for (let i = this.burnSpots.length - 1; i >= 0; i -= 1) {
      const spot = this.burnSpots[i];
      spot.age += deltaSeconds;
      spot.y += scrollSpeed * deltaSeconds;

      if (spot.state === 'warning') {
        spot.warningTimeRemaining -= deltaSeconds;
        if (spot.warningTimeRemaining <= 0) {
          this.activateSpot(spot);
        }
      }

      spot.hitZone.setPosition(spot.x, spot.y);
      const body = spot.hitZone.body as Phaser.Physics.Arcade.Body;
      body.updateFromGameObject();

      this.redrawSpot(spot);

      const flameTop = spot.flameImage.y - spot.flameImage.displayHeight;
      if (flameTop > worldHeight + 80) {
        this.destroySpot(i);
      }
    }
  }

  isSpawnPositionSafe(x: number, y: number, radius: number, minClearance = 0): boolean {
    for (const spot of this.burnSpots) {
      const left = spot.x - (spot.footprintWidth * 0.5) - minClearance;
      const right = spot.x + (spot.footprintWidth * 0.5) + minClearance;
      const top = spot.y - (spot.footprintHeight * 0.5) - minClearance;
      const bottom = spot.y + (spot.footprintHeight * 0.5) + minClearance;

      const dx = Math.max(left - x, 0, x - right);
      const dy = Math.max(top - y, 0, y - bottom);

      if ((dx * dx) + (dy * dy) < radius * radius) {
        return false;
      }
    }

    return true;
  }

  private processNewRows(
    obstacleRows: ReadonlyMap<number, readonly Phaser.GameObjects.Rectangle[]>,
    obstacleRowLayouts: ReadonlyMap<number, Readonly<ObstacleRowLayout>>,
    difficultyRatio: number,
  ): void {
    let highestProcessedRowId = this.lastProcessedRowId;

    for (const [rowId, layout] of obstacleRowLayouts.entries()) {
      if (rowId <= this.lastProcessedRowId) {
        continue;
      }

      highestProcessedRowId = Math.max(highestProcessedRowId, rowId);

      if (rowId < Number(GAME_CONFIG.burn.unlockAfterRows)) {
        continue;
      }

      const spawnChance = Phaser.Math.Linear(
        Number(GAME_CONFIG.burn.spawnChanceStart),
        Number(GAME_CONFIG.burn.spawnChanceMax),
        difficultyRatio,
      );

      if (Math.random() > spawnChance) {
        continue;
      }

      const rowSegments = obstacleRows.get(rowId);
      if (!rowSegments || rowSegments.length === 0) {
        continue;
      }

      const rowY = rowSegments[0].y;
      this.trySpawnBurnSpot(rowId, rowY, layout);
    }

    this.lastProcessedRowId = highestProcessedRowId;
  }

  private trySpawnBurnSpot(rowId: number, rowY: number, layout: Readonly<ObstacleRowLayout>): void {
    const attemptLimit = Number(GAME_CONFIG.burn.maxPlacementAttempts);

    for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
      const footprintWidth = Phaser.Math.Between(
        Number(GAME_CONFIG.burn.minFootprintWidth),
        Number(GAME_CONFIG.burn.maxFootprintWidth),
      );
      const footprintHeight = Phaser.Math.Between(
        Number(GAME_CONFIG.burn.minFootprintHeight),
        Number(GAME_CONFIG.burn.maxFootprintHeight),
      );

      const placement = this.createPlacementCandidate(layout, footprintWidth);
      if (!placement) {
        continue;
      }

      const warningTime = Phaser.Math.FloatBetween(
        Number(GAME_CONFIG.burn.warningDurationMinSeconds),
        Number(GAME_CONFIG.burn.warningDurationMaxSeconds),
      );

      const spawnY = this.getSpawnY(rowY, footprintHeight);
      const textureSize = footprintWidth * FLAME_TEXTURE_SCALE;
      const flameBaseY = spawnY + (footprintHeight * FLAME_BASE_OFFSET_Y);
      const cueGraphics = this.scene.add.graphics().setDepth(0.73);
      const glowImage = this.scene.add
        .image(placement.x, flameBaseY, FLAME_TEXTURE_KEY)
        .setOrigin(0.5, 1)
        .setDepth(0.74)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.12);
      const flameImage = this.scene.add
        .image(placement.x, flameBaseY, FLAME_TEXTURE_KEY)
        .setOrigin(0.5, 1)
        .setDepth(0.78)
        .setAlpha(0.2);
      const hitZone = this.scene.add
        .rectangle(
          placement.x,
          spawnY,
          footprintWidth * COLLISION_SCALE_X,
          footprintHeight * COLLISION_SCALE_Y,
          0x000000,
          0,
        )
        .setVisible(false);

      this.scene.physics.add.existing(hitZone);

      const body = hitZone.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setImmovable(true);
      body.setSize(footprintWidth * COLLISION_SCALE_X, footprintHeight * COLLISION_SCALE_Y, true);
      body.enable = false;

      this.activeHazards.add(hitZone);

      const burnSpot: BurnSpot = {
        rowId,
        x: placement.x,
        y: spawnY,
        age: 0,
        state: 'warning',
        warningTimeRemaining: warningTime,
        footprintWidth,
        footprintHeight,
        textureSize,
        flameImage,
        glowImage,
        cueGraphics,
        hitZone,
        seed: Math.random() * Math.PI * 2,
      };

      this.burnSpots.push(burnSpot);
      this.redrawSpot(burnSpot);
      return;
    }
  }

  private createPlacementCandidate(
    layout: Readonly<ObstacleRowLayout>,
    footprintWidth: number,
  ): BurnPlacementCandidate | null {
    const patterns = Phaser.Utils.Array.Shuffle<BurnPlacementPattern>([
      'edge-left',
      'edge-right',
      'lane-left',
      'lane-right',
    ]);

    for (const pattern of patterns) {
      const candidate = this.createPatternPlacement(layout, footprintWidth, pattern);
      if (candidate && this.isPlacementFair(layout, candidate.blockedLeft, candidate.blockedRight)) {
        return candidate;
      }
    }

    return null;
  }

  private createPatternPlacement(
    layout: Readonly<ObstacleRowLayout>,
    footprintWidth: number,
    pattern: BurnPlacementPattern,
  ): BurnPlacementCandidate | null {
    const minOverlap = Number(GAME_CONFIG.burn.minGapOverlapWidth);
    const maxOverlap = Math.min(
      Number(GAME_CONFIG.burn.maxGapOverlapWidth),
      footprintWidth - 6,
      layout.gapWidth - 6,
    );

    if (maxOverlap < minOverlap) {
      return null;
    }

    if (pattern === 'edge-left' || pattern === 'edge-right') {
      const overlap = Phaser.Math.FloatBetween(minOverlap, maxOverlap);
      const left = pattern === 'edge-left'
        ? (layout.gapLeft + overlap) - footprintWidth
        : layout.gapRight - overlap;
      const right = left + footprintWidth;

      return this.createValidatedCandidate(layout, left, right);
    }

    const laneInsetMin = 8;
    const laneInsetMax = Math.min(
      layout.gapWidth - footprintWidth - 8,
      layout.gapWidth * 0.34,
    );

    if (laneInsetMax < laneInsetMin) {
      return null;
    }

    const inset = Phaser.Math.FloatBetween(laneInsetMin, laneInsetMax);
    const left = pattern === 'lane-left'
      ? layout.gapLeft + inset
      : layout.gapRight - inset - footprintWidth;
    const right = left + footprintWidth;

    return this.createValidatedCandidate(layout, left, right);
  }

  private createValidatedCandidate(
    layout: Readonly<ObstacleRowLayout>,
    left: number,
    right: number,
  ): BurnPlacementCandidate | null {
    const blockedLeft = Phaser.Math.Clamp(left, layout.gapLeft, layout.gapRight);
    const blockedRight = Phaser.Math.Clamp(right, layout.gapLeft, layout.gapRight);

    if (blockedRight - blockedLeft < Number(GAME_CONFIG.burn.minGapOverlapWidth)) {
      return null;
    }

    return {
      x: left + ((right - left) * 0.5),
      blockedLeft,
      blockedRight,
    };
  }

  private isPlacementFair(layout: Readonly<ObstacleRowLayout>, blockedLeft: number, blockedRight: number): boolean {
    const minSafeCorridorWidth = Number(GAME_CONFIG.player.width)
      + (Number(GAME_CONFIG.burn.safePathPadding) * 2);
    const safeLeftWidth = blockedLeft - layout.gapLeft;
    const safeRightWidth = layout.gapRight - blockedRight;

    return Math.max(safeLeftWidth, safeRightWidth) >= minSafeCorridorWidth;
  }

  private activateSpot(spot: BurnSpot): void {
    spot.state = 'active';
    const body = spot.hitZone.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.updateFromGameObject();
  }

  private redrawSpot(spot: BurnSpot): void {
    const flameBaseY = this.getFlameBaseY(spot);

    spot.flameImage.setPosition(spot.x, flameBaseY);
    spot.glowImage.setPosition(spot.x, flameBaseY);
    spot.cueGraphics.clear();
    spot.cueGraphics.setPosition(spot.x, spot.y);

    if (spot.state === 'warning') {
      this.drawWarningSpot(spot);
      return;
    }

    this.drawActiveSpot(spot);
  }

  private drawWarningSpot(spot: BurnSpot): void {
    const graphics = spot.cueGraphics;
    const flicker = 0.5
      + (Math.sin((spot.age * 8) + spot.seed) * 0.25)
      + (Math.sin((spot.age * 13) + (spot.seed * 0.6)) * 0.1);
    const flameSize = spot.textureSize * (0.98 + (flicker * 0.04));
    const glowSize = flameSize * GLOW_SIZE_RATIO * (1.04 + (flicker * 0.03));

    spot.flameImage
      .setDisplaySize(flameSize, flameSize)
      .setAlpha(0.22 + (flicker * 0.08))
      .setTint(0xffb55a)
      .setAngle(Math.sin((spot.age * 2.1) + spot.seed) * 1.5);

    spot.glowImage
      .setDisplaySize(glowSize, glowSize)
      .setAlpha(0.1 + (flicker * 0.05))
      .setTint(0xff9800)
      .setAngle(Math.sin((spot.age * 1.7) + (spot.seed * 0.9)) * 1.2);

    graphics.fillStyle(0xffa734, 0.14 + (flicker * 0.03));
    graphics.fillEllipse(0, spot.footprintHeight * 0.58, spot.footprintWidth * 1.35, spot.footprintHeight * 0.46);

    graphics.lineStyle(2, 0xffefb0, 0.26 + (flicker * 0.06));
    graphics.strokeEllipse(0, spot.footprintHeight * 0.58, spot.footprintWidth * 1.12, spot.footprintHeight * 0.22);
  }

  private drawActiveSpot(spot: BurnSpot): void {
    const graphics = spot.cueGraphics;
    const pulse = 0.5
      + (Math.sin((spot.age * 7) + spot.seed) * 0.25)
      + (Math.sin((spot.age * 11.5) + (spot.seed * 0.7)) * 0.08);
    const flameSize = spot.textureSize * (0.99 + (pulse * 0.05));
    const glowSize = flameSize * GLOW_SIZE_RATIO * (1.08 + (pulse * 0.05));

    spot.flameImage
      .setDisplaySize(flameSize, flameSize)
      .setAlpha(0.98)
      .clearTint()
      .setAngle(Math.sin((spot.age * 1.8) + spot.seed) * 1.25);

    spot.glowImage
      .setDisplaySize(glowSize, glowSize)
      .setAlpha(0.22 + (pulse * 0.08))
      .setTint(0xffaf2f)
      .setAngle(Math.sin((spot.age * 1.5) + (spot.seed * 0.8)) * 1.4);

    graphics.fillStyle(0x2b0700, 0.22);
    graphics.fillEllipse(0, spot.footprintHeight * 0.74, spot.footprintWidth * 0.95, spot.footprintHeight * 0.22);

    graphics.fillStyle(0xff9220, 0.18 + (pulse * 0.05));
    graphics.fillEllipse(0, spot.footprintHeight * 0.64, spot.footprintWidth * 1.26, spot.footprintHeight * 0.4);

    graphics.fillStyle(0xffffb4, 0.07 + (pulse * 0.03));
    graphics.fillEllipse(0, spot.footprintHeight * 0.61, spot.footprintWidth * 0.54, spot.footprintHeight * 0.12);
  }

  private getFlameBaseY(spot: BurnSpot): number {
    return spot.y + (spot.footprintHeight * FLAME_BASE_OFFSET_Y);
  }

  private getSpawnY(rowY: number, footprintHeight: number): number {
    const obstacleHalfThickness = Number(GAME_CONFIG.obstacle.thickness) * 0.5;
    const minimumCenterOffset = Math.max(
      0,
      obstacleHalfThickness + MIN_LINE_TO_FIRE_GAP_PX - (footprintHeight * MIN_VISUAL_TOP_OFFSET_RATIO),
    );

    return rowY + minimumCenterOffset + Phaser.Math.FloatBetween(0, MAX_DOWNWARD_SPAWN_JITTER_PX);
  }

  private destroySpot(index: number): void {
    const [spot] = this.burnSpots.splice(index, 1);

    if (!spot) {
      return;
    }

    this.activeHazards.remove(spot.hitZone, false, false);
    spot.hitZone.destroy();
    spot.flameImage.destroy();
    spot.glowImage.destroy();
    spot.cueGraphics.destroy();
  }

  private getDifficultyRatio(scrollSpeed: number): number {
    const minSpeed = Number(GAME_CONFIG.world.scrollSpeed);
    const maxSpeed = Number(GAME_CONFIG.world.maxScrollSpeed);
    const range = Math.max(1, maxSpeed - minSpeed);

    return Phaser.Math.Clamp((scrollSpeed - minSpeed) / range, 0, 1);
  }
}