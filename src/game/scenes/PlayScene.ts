import Phaser from 'phaser';
import { GAME_CONFIG } from '../core/gameConfig';
import { SceneKeys } from '../core/sceneKeys';
import { Pencil } from '../entities/Pencil';
import { InputSystem } from '../systems/InputSystem';
import { LeadSystem } from '../systems/LeadSystem';
import { ObstacleSystem } from '../systems/ObstacleSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { HudSystem } from '../systems/HudSystem';
import { NotebookBackgroundSystem } from '../systems/NotebookBackgroundSystem';
import { CloseCallSystem } from '../systems/CloseCallSystem';
import { LineCrossSystem } from '../systems/LineCrossSystem';
import { BurnSpotSystem } from '../systems/BurnSpotSystem';
import { BackgroundMusicSystem } from '../systems/BackgroundMusicSystem';
import { LevelProgressionSystem } from '../systems/LevelProgressionSystem';
import { ProgressService } from '../../services/progressService';

export class PlayScene extends Phaser.Scene {
  private pencil!: Pencil;

  private backgroundMusicSystem!: BackgroundMusicSystem;

  private gameplayColliders: Phaser.Physics.Arcade.Collider[] = [];

  private eraserCount = 0;

  private readonly erasedObstacleRowIds = new Set<number>();

  private eraserUseRequestMs = 0;

  private eraserCollisionGraceMs = 0;

  private inputSystem!: InputSystem;

  private leadSystem!: LeadSystem;

  private obstacleSystem!: ObstacleSystem;

  private scoreSystem!: ScoreSystem;

  private levelProgressionSystem!: LevelProgressionSystem;

  private hudSystem!: HudSystem;

  private notebookSystem!: NotebookBackgroundSystem;

  private closeCallSystem!: CloseCallSystem;

  private lineCrossSystem!: LineCrossSystem;

  private burnSpotSystem!: BurnSpotSystem;

  private isGameOver = false;

  private scrollSpeed = Number(GAME_CONFIG.world.scrollSpeed);

  private readonly playerBounds = new Phaser.Geom.Rectangle();

  constructor() {
    super(SceneKeys.Play);
  }

  create(): void {
    this.resetRunState();

    const { width, height } = this.scale;
    this.physics.world.setBounds(0, 0, width, height);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    this.notebookSystem = new NotebookBackgroundSystem(this);
    this.backgroundMusicSystem = new BackgroundMusicSystem(this);

    this.pencil = new Pencil(this, width / 2, height - Number(GAME_CONFIG.player.bottomMargin));
    this.backgroundMusicSystem.start();

    this.inputSystem = new InputSystem(this);
    this.leadSystem = new LeadSystem();
    this.obstacleSystem = new ObstacleSystem(this, width);
    this.burnSpotSystem = new BurnSpotSystem(this);
    this.obstacleSystem.setAdditionalSpawnValidator((x, y, radius, minDistanceFromObstaclePx) => this.burnSpotSystem
      .isSpawnPositionSafe(x, y, radius, minDistanceFromObstaclePx));
    this.scoreSystem = new ScoreSystem();
    this.levelProgressionSystem = new LevelProgressionSystem();
    this.hudSystem = new HudSystem(this);
    this.closeCallSystem = new CloseCallSystem(Number(GAME_CONFIG.obstacle.closeCallDistancePx));
    this.lineCrossSystem = new LineCrossSystem(
      Number(GAME_CONFIG.celebrations.linesPerMilestone),
      GAME_CONFIG.celebrations.phrases,
    );

    this.gameplayColliders = [
      this.physics.add.overlap(this.pencil.body, this.obstacleSystem.obstacles, (_player, obstacle) => {
        const obstacleRowId = (obstacle as Phaser.GameObjects.Rectangle).getData('rowId') as number | undefined;

        if (obstacleRowId !== undefined && this.erasedObstacleRowIds.has(obstacleRowId)) {
          return;
        }

        if (this.eraserCollisionGraceMs > 0) {
          return;
        }

        if (this.shouldUseEraserOnContact() && this.tryUseEraserOnObstacle(obstacle as Phaser.GameObjects.GameObject)) {
          this.eraserUseRequestMs = 0;
          this.eraserCollisionGraceMs = 120;
          return;
        }

        this.endRun();
      }),

      this.physics.add.overlap(this.pencil.body, this.obstacleSystem.pickups, (_player, pickup) => {
        this.obstacleSystem.consumePickup(pickup as Phaser.GameObjects.GameObject);
        this.leadSystem.restoreFromPickup();
      }),

      this.physics.add.overlap(this.pencil.body, this.burnSpotSystem.activeHazards, () => {
        this.endRun();
      }),

      this.physics.add.overlap(this.pencil.body, this.obstacleSystem.eraserPickups, (_player, eraser) => {
        this.obstacleSystem.consumeEraser(eraser as Phaser.GameObjects.GameObject);
        this.eraserCount += 1;
      }),
    ];
  }

  update(_time: number, deltaMs: number): void {
    if (this.isGameOver) {
      return;
    }

    this.eraserUseRequestMs = Math.max(0, this.eraserUseRequestMs - deltaMs);
    this.eraserCollisionGraceMs = Math.max(0, this.eraserCollisionGraceMs - deltaMs);

    const deltaSeconds = deltaMs / 1000;
    const { width, height } = this.scale;

    this.scrollSpeed = Math.min(
      Number(GAME_CONFIG.world.maxScrollSpeed),
      this.scrollSpeed + Number(GAME_CONFIG.world.speedRampPerSecond) * deltaSeconds,
    );

    this.notebookSystem.update(deltaSeconds, this.scrollSpeed);

    const halfWidth = Number(GAME_CONFIG.player.width) * 0.5;
    const input = this.inputSystem.update(this.pencil.body.x, deltaSeconds, halfWidth, width - halfWidth);
    this.pencil.setX(input.x);

    if (input.useEraser) {
      this.eraserUseRequestMs = 220;
      this.tryUseEraser();
    }

    const lead = this.leadSystem.update(deltaSeconds, input.isMoving);
    this.pencil.setLeadRatio(this.leadSystem.getLeadRatio());
    this.pencil.updateTrail(this.scrollSpeed * deltaSeconds, height);

    if (this.leadSystem.isDepleted()) {
      this.endRun();
      return;
    }

    this.obstacleSystem.update(deltaSeconds, this.scrollSpeed, height);
    this.burnSpotSystem.update(
      deltaSeconds,
      this.scrollSpeed,
      height,
      this.obstacleSystem.getObstacleRows(),
      this.obstacleSystem.getObstacleRowLayouts(),
    );

    const lineCrossCelebrations = this.lineCrossSystem.update(
      this.getPlayerBounds(),
      this.obstacleSystem.getObstacleRows(),
    );

    for (const celebration of lineCrossCelebrations) {
      this.hudSystem.triggerLineCrossCelebration(
        celebration.totalLinesCrossed,
        celebration.phrase,
      );
    }

    const closeCallRowIds = this.closeCallSystem.update(
      this.getPlayerBounds(),
      this.obstacleSystem.getObstacleRows(),
    );

    if (closeCallRowIds.length > 0) {
      this.hudSystem.triggerCloseCall();
    }

    const distance = this.scoreSystem.update(deltaSeconds, this.scrollSpeed);
    this.backgroundMusicSystem.updateRunProgress(this.scoreSystem.getPreciseDistance(), deltaSeconds);
    const { level, newlyReachedLevels } = this.levelProgressionSystem.update(distance);

    for (const reachedLevel of newlyReachedLevels) {
      this.hudSystem.triggerLevelMilestone(reachedLevel);
    }

    this.hudSystem.update(distance, lead, this.eraserCount, level);
  }

  private endRun(): void {
    if (this.isGameOver) {
      return;
    }

    this.isGameOver = true;
    this.backgroundMusicSystem.stop();
    const distance = this.scoreSystem.getDistance();
    const bestDistance = ProgressService.setBestDistance(distance);

    this.scene.start(SceneKeys.GameOver, {
      distance,
      bestDistance,
    });
  }

  private resetRunState(): void {
    for (const collider of this.gameplayColliders) {
      collider.destroy();
    }

    this.gameplayColliders = [];
    this.eraserCount = 0;
    this.erasedObstacleRowIds.clear();
    this.eraserUseRequestMs = 0;
    this.eraserCollisionGraceMs = 0;
    this.isGameOver = false;
    this.scrollSpeed = Number(GAME_CONFIG.world.scrollSpeed);
  }

  private tryUseEraser(): boolean {
    if (this.eraserCount <= 0) {
      return false;
    }

    const tip = this.pencil.getPencilTipWorldPosition();
    const erasedRowId = this.obstacleSystem.eraseNextObstacleRow(
      tip.y + Number(GAME_CONFIG.obstacle.thickness),
      tip.x,
    );

    if (erasedRowId !== null) {
      this.eraserCount -= 1;
      this.erasedObstacleRowIds.add(erasedRowId);
      this.eraserUseRequestMs = 0;
      this.eraserCollisionGraceMs = 120;
    }

    return erasedRowId !== null;
  }

  private tryUseEraserOnObstacle(obstacle: Phaser.GameObjects.GameObject): boolean {
    if (this.eraserCount <= 0) {
      return false;
    }

    const tip = this.pencil.getPencilTipWorldPosition();
    const erasedRowId = this.obstacleSystem.eraseObstacleRowBySegment(obstacle, tip.x);

    if (erasedRowId !== null) {
      this.eraserCount -= 1;
      this.erasedObstacleRowIds.add(erasedRowId);
      this.eraserCollisionGraceMs = 120;
    }

    return erasedRowId !== null;
  }

  private shouldUseEraserOnContact(): boolean {
    return this.eraserCount > 0 && (this.inputSystem.isEraserDown() || this.eraserUseRequestMs > 0);
  }

  private getPlayerBounds(): Phaser.Geom.Rectangle {
    const body = this.pencil.body.body as Phaser.Physics.Arcade.Body;

    this.playerBounds.x = body.left;
    this.playerBounds.y = body.top;
    this.playerBounds.width = body.width;
    this.playerBounds.height = body.height;

    return this.playerBounds;
  }

  private handleShutdown(): void {
    for (const collider of this.gameplayColliders) {
      collider.destroy();
    }

    this.gameplayColliders = [];
    this.inputSystem?.destroy();
    this.backgroundMusicSystem.stop();
  }
}
