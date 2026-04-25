import Phaser from 'phaser';
import { GAME_CONFIG } from '../core/gameConfig';
import {
  OBSTACLE_LINE_PALETTE,
  ensurePaperLineTexture,
  type PaperLineTextureHandle,
} from '../utils/paperLineTexture';

export interface ObstacleRowLayout {
  gapLeft: number;
  gapRight: number;
  gapCenter: number;
  gapWidth: number;
}

export class ObstacleSystem {
  readonly obstacles: Phaser.Physics.Arcade.Group;

  readonly pickups: Phaser.Physics.Arcade.Group;

  readonly eraserPickups: Phaser.Physics.Arcade.Group;

  private readonly obstacleRows = new Map<number, Phaser.GameObjects.Rectangle[]>();

  private readonly obstacleRowLayouts = new Map<number, ObstacleRowLayout>();

  private readonly obstacleDecor = new Map<Phaser.GameObjects.Rectangle, Phaser.GameObjects.Image>();

  private readonly obstacleLineTexture: PaperLineTextureHandle;

  private obstacleTimer = 0;

  private pickupTimer = 0;

  private eraserTimer = 0;

  private nextObstacleRowId = 0;

  private readonly pickupDecor = new Map<Phaser.GameObjects.Arc, Phaser.GameObjects.GameObject[]>();

  private readonly eraserDecor = new Map<Phaser.GameObjects.Arc, Phaser.GameObjects.Container>();

  private additionalSpawnValidator?: (
    x: number,
    y: number,
    radius: number,
    minDistanceFromObstaclePx: number,
  ) => boolean;

  constructor(private readonly scene: Phaser.Scene, private readonly worldWidth: number) {
    this.obstacles = this.scene.physics.add.group({
      allowGravity: false,
      immovable: true,
    });

    this.pickups = this.scene.physics.add.group({
      allowGravity: false,
      immovable: true,
    });

    this.eraserPickups = this.scene.physics.add.group({
      allowGravity: false,
      immovable: true,
    });

    this.obstacleLineTexture = ensurePaperLineTexture(
      this.scene,
      this.worldWidth,
      Number(GAME_CONFIG.obstacle.thickness) * 0.5,
      OBSTACLE_LINE_PALETTE,
    );
  }

  update(deltaSeconds: number, scrollSpeed: number, worldHeight: number): void {
    this.obstacleTimer += deltaSeconds;
    this.pickupTimer += deltaSeconds;
    this.eraserTimer += deltaSeconds;

    if (this.obstacleTimer >= Number(GAME_CONFIG.obstacle.spawnEverySeconds)) {
      this.obstacleTimer -= Number(GAME_CONFIG.obstacle.spawnEverySeconds);
      this.spawnObstacleRow(-Number(GAME_CONFIG.obstacle.thickness));
    }

    if (this.pickupTimer >= Number(GAME_CONFIG.pickups.spawnEverySeconds)) {
      this.pickupTimer -= Number(GAME_CONFIG.pickups.spawnEverySeconds);
      this.spawnLeadPickup(-Number(GAME_CONFIG.pickups.size));
    }

    if (this.eraserTimer >= Number(GAME_CONFIG.erasers.spawnEverySeconds)) {
      this.eraserTimer -= Number(GAME_CONFIG.erasers.spawnEverySeconds);
      this.spawnEraserPickup(-36);
    }

    for (const child of this.obstacles.getChildren()) {
      const obstacle = child as Phaser.GameObjects.Rectangle;
      obstacle.y += scrollSpeed * deltaSeconds;
      this.syncObstacleDecor(obstacle);

      if (obstacle.y > worldHeight + 40) {
        this.unregisterObstacleSegment(obstacle);
        this.destroyObstacleDecor(obstacle);
        this.obstacles.remove(obstacle, true, true);
      }
    }

    for (const child of this.pickups.getChildren()) {
      const pickup = child as Phaser.GameObjects.Arc;
      pickup.y += scrollSpeed * deltaSeconds;
      this.syncPickupDecor(pickup);

      if (pickup.y > worldHeight + 40) {
        this.destroyPickupDecor(pickup);
        this.pickups.remove(pickup, true, true);
      }
    }

    for (const child of this.eraserPickups.getChildren()) {
      const eraserPickup = child as Phaser.GameObjects.Arc;
      eraserPickup.y += scrollSpeed * deltaSeconds;
      this.syncEraserDecor(eraserPickup);

      if (eraserPickup.y > worldHeight + 80) {
        this.destroyEraserDecor(eraserPickup);
        this.eraserPickups.remove(eraserPickup, true, true);
      }
    }
  }

  getObstacleRows(): ReadonlyMap<number, readonly Phaser.GameObjects.Rectangle[]> {
    return this.obstacleRows;
  }

  getObstacleRowLayouts(): ReadonlyMap<number, Readonly<ObstacleRowLayout>> {
    return this.obstacleRowLayouts;
  }

  setAdditionalSpawnValidator(
    validator: ((x: number, y: number, radius: number, minDistanceFromObstaclePx: number) => boolean) | undefined,
  ): void {
    this.additionalSpawnValidator = validator;
  }

  consumePickup(pickup: Phaser.GameObjects.GameObject): void {
    const pickupArc = pickup as Phaser.GameObjects.Arc;
    this.destroyPickupDecor(pickupArc);
    this.pickups.remove(pickupArc, true, true);
  }

  consumeEraser(eraser: Phaser.GameObjects.GameObject): void {
    const eraserPickup = eraser as Phaser.GameObjects.Arc;
    this.destroyEraserDecor(eraserPickup);
    this.eraserPickups.remove(eraserPickup, true, true);
  }

  eraseObstacleRowBySegment(segment: Phaser.GameObjects.GameObject, _targetX: number): number | null {
    const obstacleSegment = segment as Phaser.GameObjects.Rectangle;
    const rowId = obstacleSegment.getData('rowId') as number | undefined;

    if (rowId === undefined) {
      return null;
    }

    return this.removeObstacleRow(rowId) ? rowId : null;
  }

  eraseNextObstacleRow(targetY: number, _targetX: number): number | null {
    let nextRowId: number | undefined;
    let nextRowY = Number.NEGATIVE_INFINITY;

    for (const [rowId, segments] of this.obstacleRows.entries()) {
      if (segments.length === 0) {
        continue;
      }

      const rowY = segments[0].y;
      if (rowY <= targetY && rowY > nextRowY) {
        nextRowY = rowY;
        nextRowId = rowId;
      }
    }

    if (nextRowId === undefined) {
      return null;
    }

    return this.removeObstacleRow(nextRowId) ? nextRowId : null;
  }

  private removeObstacleRow(rowId: number): boolean {
    const rowSegments = this.obstacleRows.get(rowId);
    if (!rowSegments || rowSegments.length === 0) {
      return false;
    }

    for (const segment of [...rowSegments]) {
      this.destroyObstacleDecor(segment);
      this.obstacles.remove(segment, true, true);
    }

    this.obstacleRows.delete(rowId);
    this.obstacleRowLayouts.delete(rowId);
    return true;
  }

  private spawnObstacleRow(y: number): void {
    const thickness = Number(GAME_CONFIG.obstacle.thickness);
    const minGap = Number(GAME_CONFIG.obstacle.minGapWidth);
    const maxGap = Number(GAME_CONFIG.obstacle.maxGapWidth);
    const wallPadding = 28;
    const gapWidth = Phaser.Math.Between(minGap, maxGap);
    const minCenter = wallPadding + gapWidth / 2;
    const maxCenter = this.worldWidth - wallPadding - gapWidth / 2;
    const gapCenter = Phaser.Math.Between(minCenter, maxCenter);
    const rowId = this.nextObstacleRowId;
    this.nextObstacleRowId += 1;
    const segments: Phaser.GameObjects.Rectangle[] = [];

    const gapLeft = gapCenter - gapWidth / 2;
    const gapRight = gapCenter + gapWidth / 2;

    if (gapLeft > 0) {
      segments.push(this.addObstacleSegment(gapLeft / 2, y, gapLeft, thickness, rowId));
    }

    const rightWidth = this.worldWidth - gapRight;
    if (rightWidth > 0) {
      segments.push(this.addObstacleSegment(gapRight + rightWidth / 2, y, rightWidth, thickness, rowId));
    }

    if (segments.length > 0) {
      this.obstacleRows.set(rowId, segments);
      this.obstacleRowLayouts.set(rowId, {
        gapLeft,
        gapRight,
        gapCenter,
        gapWidth,
      });
    }
  }

  private addObstacleSegment(
    x: number,
    y: number,
    width: number,
    height: number,
    rowId: number,
    angle = Phaser.Math.Between(-3, 3),
  ): Phaser.GameObjects.Rectangle {
    const segment = this.scene.add
      .rectangle(x, y, width, height, 0x0f1626, 0)
      .setAngle(angle);
    segment.setVisible(false);
    segment.setData('rowId', rowId);
    this.scene.physics.add.existing(segment);

    const body = segment.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);

    const cropWidth = Math.max(1, Math.round(width));
    const cropX = Math.max(0, Math.round((this.obstacleLineTexture.width - cropWidth) / 2));
    const lineDecor = this.scene.add
      .image(x, y, this.obstacleLineTexture.key)
      .setCrop(cropX, 0, cropWidth, this.obstacleLineTexture.height)
      .setAngle(angle)
      .setDepth(2)
      .setAlpha(0.98);

    this.obstacles.add(segment);
    this.obstacleDecor.set(segment, lineDecor);
    return segment;
  }

  private spawnLeadPickup(y: number): void {
    const size = Number(GAME_CONFIG.pickups.size);
    const x = this.findSafePickupSpawnX({
      y,
      radius: size / 2,
      minX: 40,
      maxX: this.worldWidth - 40,
      minDistanceFromObstaclePx: Number(GAME_CONFIG.pickups.minDistanceFromObstaclePx),
      retryLimit: Number(GAME_CONFIG.pickups.spawnRetryLimit),
    });

    if (x === null) {
      return;
    }

    const pickup = this.scene.add
      .circle(x, y, size / 2, 0x202a3d)
      .setStrokeStyle(3, 0x0b1222)
      .setDepth(6);

    const glow = this.scene.add
      .circle(x, y, size / 2 + 7, 0xffd94f, 0.16)
      .setDepth(5)
      .setBlendMode(Phaser.BlendModes.ADD);

    const highlight = this.scene.add
      .circle(x - 4, y - 4, size / 5, 0xdde5ef, 0.5)
      .setDepth(7);

    this.scene.physics.add.existing(pickup);

    const body = pickup.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.setCircle(size / 2);

    this.pickups.add(pickup);
    this.pickupDecor.set(pickup, [glow, highlight]);
  }

  private spawnEraserPickup(y: number): void {
    const size = Number(GAME_CONFIG.pickups.size);
    const hitRadius = size * 0.78;
    const x = this.findSafePickupSpawnX({
      y,
      radius: hitRadius,
      minX: 60,
      maxX: this.worldWidth - 60,
      minDistanceFromObstaclePx: Number(GAME_CONFIG.erasers.minDistanceFromObstaclePx),
      retryLimit: Number(GAME_CONFIG.erasers.spawnRetryLimit),
    });

    if (x === null) {
      return;
    }

    const eraserPickup = this.scene.add.circle(x, y, hitRadius, 0x000000, 0).setDepth(6).setAlpha(0);

    const eraserBack = this.scene.add.rectangle(0, 0, size * 2.2, size * 1.15, 0xff6f95).setStrokeStyle(2, 0x1a2748);
    const eraserCenter = this.scene.add.rectangle(0, 0, size * 0.95, size * 1.15, 0x3086ff).setStrokeStyle(2, 0x1a2748);
    const eraserTip = this.scene.add
      .rectangle(-size * 0.85, 0, size * 0.42, size * 0.9, 0xffbad0)
      .setStrokeStyle(2, 0x1a2748);
    const eraserTail = this.scene.add
      .rectangle(size * 0.85, 0, size * 0.42, size * 0.9, 0xf7f7f7)
      .setStrokeStyle(2, 0x1a2748);

    const eraser = this.scene.add
      .container(x, y, [eraserBack, eraserCenter, eraserTip, eraserTail])
      .setDepth(6)
      .setScale(Number(GAME_CONFIG.erasers.scale))
      .setAlpha(0.95)
      .setAngle(Phaser.Math.Between(-30, 30));

    this.scene.physics.add.existing(eraserPickup);

    const body = eraserPickup.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.setCircle(hitRadius);

    this.eraserPickups.add(eraserPickup);
    this.eraserDecor.set(eraserPickup, eraser);
  }

  private findSafePickupSpawnX({
    y,
    radius,
    minX,
    maxX,
    minDistanceFromObstaclePx,
    retryLimit,
  }: {
    y: number;
    radius: number;
    minX: number;
    maxX: number;
    minDistanceFromObstaclePx: number;
    retryLimit: number;
  }): number | null {
    const nearbySegments = this.getNearbyObstacleSegments(y, radius, minDistanceFromObstaclePx);

    for (let attempt = 0; attempt < retryLimit; attempt += 1) {
      const candidateX = Phaser.Math.Between(minX, maxX);

      if (this.isPickupSpawnPositionSafe(candidateX, y, radius, minDistanceFromObstaclePx, nearbySegments)) {
        return candidateX;
      }
    }

    return null;
  }

  private getNearbyObstacleSegments(
    y: number,
    radius: number,
    minDistanceFromObstaclePx: number,
  ): Phaser.GameObjects.Rectangle[] {
    const nearbySegments: Phaser.GameObjects.Rectangle[] = [];

    for (const segments of this.obstacleRows.values()) {
      for (const segment of segments) {
        if (!segment.active) {
          continue;
        }

        const verticalReach = this.getSegmentVerticalReach(segment);
        const maxRelevantDistanceY = verticalReach + radius + minDistanceFromObstaclePx;

        if (Math.abs(segment.y - y) <= maxRelevantDistanceY) {
          nearbySegments.push(segment);
        }
      }
    }

    return nearbySegments;
  }

  private isPickupSpawnPositionSafe(
    x: number,
    y: number,
    radius: number,
    minDistanceFromObstaclePx: number,
    nearbySegments: readonly Phaser.GameObjects.Rectangle[],
  ): boolean {
    for (const segment of nearbySegments) {
      if (this.getPickupClearanceFromObstacle(segment, x, y, radius) < minDistanceFromObstaclePx) {
        return false;
      }
    }

    if (this.additionalSpawnValidator && !this.additionalSpawnValidator(x, y, radius, minDistanceFromObstaclePx)) {
      return false;
    }

    return true;
  }

  private getPickupClearanceFromObstacle(
    segment: Phaser.GameObjects.Rectangle,
    pickupX: number,
    pickupY: number,
    pickupRadius: number,
  ): number {
    const localPoint = this.toObstacleLocalPoint(segment, pickupX, pickupY);
    const halfWidth = segment.displayWidth / 2;
    const halfHeight = segment.displayHeight / 2;
    const dx = Math.max(Math.abs(localPoint.x) - halfWidth, 0);
    const dy = Math.max(Math.abs(localPoint.y) - halfHeight, 0);
    const distanceToObstacle = Math.sqrt(dx * dx + dy * dy);

    return distanceToObstacle - pickupRadius;
  }

  private toObstacleLocalPoint(
    segment: Phaser.GameObjects.Rectangle,
    worldX: number,
    worldY: number,
  ): { x: number; y: number } {
    const offsetX = worldX - segment.x;
    const offsetY = worldY - segment.y;
    const rotation = -segment.rotation;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    return {
      x: offsetX * cos - offsetY * sin,
      y: offsetX * sin + offsetY * cos,
    };
  }

  private getSegmentVerticalReach(segment: Phaser.GameObjects.Rectangle): number {
    const rotation = segment.rotation;
    const cos = Math.abs(Math.cos(rotation));
    const sin = Math.abs(Math.sin(rotation));

    return (segment.displayWidth * sin + segment.displayHeight * cos) / 2;
  }

  private syncPickupDecor(pickup: Phaser.GameObjects.Arc): void {
    const decor = this.pickupDecor.get(pickup);
    if (!decor) {
      return;
    }

    const glow = decor[0] as Phaser.GameObjects.Arc;
    const highlight = decor[1] as Phaser.GameObjects.Arc;
    glow.setPosition(pickup.x, pickup.y);
    highlight.setPosition(pickup.x - 4, pickup.y - 4);
  }

  private unregisterObstacleSegment(segment: Phaser.GameObjects.Rectangle): void {
    const rowId = segment.getData('rowId') as number | undefined;
    if (rowId === undefined) {
      return;
    }

    const segments = this.obstacleRows.get(rowId);
    if (!segments) {
      return;
    }

    const nextSegments = segments.filter((entry) => entry !== segment);
    if (nextSegments.length === 0) {
      this.obstacleRows.delete(rowId);
      this.obstacleRowLayouts.delete(rowId);
      return;
    }

    this.obstacleRows.set(rowId, nextSegments);
  }

  private syncObstacleDecor(segment: Phaser.GameObjects.Rectangle): void {
    const decor = this.obstacleDecor.get(segment);
    if (!decor) {
      return;
    }

    decor.setPosition(segment.x, segment.y);
    decor.setAngle(segment.angle);
  }

  private destroyObstacleDecor(segment: Phaser.GameObjects.Rectangle): void {
    const decor = this.obstacleDecor.get(segment);
    if (!decor) {
      return;
    }

    decor.destroy();
    this.obstacleDecor.delete(segment);
  }

  private syncEraserDecor(eraserPickup: Phaser.GameObjects.Arc): void {
    const decor = this.eraserDecor.get(eraserPickup);
    if (!decor) {
      return;
    }

    decor.setPosition(eraserPickup.x, eraserPickup.y);
  }

  private destroyPickupDecor(pickup: Phaser.GameObjects.Arc): void {
    const decor = this.pickupDecor.get(pickup);
    if (!decor) {
      return;
    }

    for (const part of decor) {
      part.destroy();
    }

    this.pickupDecor.delete(pickup);
  }

  private destroyEraserDecor(eraserPickup: Phaser.GameObjects.Arc): void {
    const decor = this.eraserDecor.get(eraserPickup);
    if (!decor) {
      return;
    }

    decor.destroy();
    this.eraserDecor.delete(eraserPickup);
  }
}