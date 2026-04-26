import Phaser from 'phaser';
import { GAME_CONFIG } from '../core/gameConfig';

interface InputResult {
  x: number;
  isMoving: boolean;
  useEraser: boolean;
}

export class InputSystem {
  private static readonly DOUBLE_TAP_MAX_DELAY_MS = 280;

  private static readonly DOUBLE_TAP_MAX_DISTANCE_PX = 42;

  private static readonly TAP_MAX_DURATION_MS = 250;

  private static readonly TAP_MAX_TRAVEL_PX = 24;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;

  private eraserKey?: Phaser.Input.Keyboard.Key;

  private activePointerId: number | null = null;

  private pointerTargetX = 0;

  private pendingTouchEraser = false;

  private lastTapTimeMs = Number.NEGATIVE_INFINITY;

  private lastTapX = 0;

  private lastTapY = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.scene.input.on('pointerdown', this.handlePointerDown, this);
    this.scene.input.on('pointermove', this.handlePointerMove, this);
    this.scene.input.on('pointerup', this.handlePointerUp, this);
    this.scene.input.on('pointerupoutside', this.handlePointerUp, this);
  }

  update(currentX: number, deltaSeconds: number, minX: number, maxX: number): InputResult {
    this.cursors ??= this.scene.input.keyboard?.createCursorKeys();
    this.eraserKey ??= this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.X);

    const left = this.cursors?.left;
    const right = this.cursors?.right;
    let newX = currentX;
    let isMoving = false;

    if (this.activePointerId !== null) {
      newX = this.pointerTargetX;
      isMoving = Math.abs(newX - currentX) > 0.5;
    } else if (left?.isDown) {
      newX -= GAME_CONFIG.player.moveSpeed * deltaSeconds;
      isMoving = true;
    } else if (right?.isDown) {
      newX += GAME_CONFIG.player.moveSpeed * deltaSeconds;
      isMoving = true;
    }

    const clampedX = Phaser.Math.Clamp(newX, minX, maxX);

    return {
      x: clampedX,
      isMoving: isMoving && clampedX !== currentX,
      useEraser: (this.eraserKey ? Phaser.Input.Keyboard.JustDown(this.eraserKey) : false)
        || this.consumeTouchEraserRequest(),
    };
  }

  isEraserDown(): boolean {
    this.eraserKey ??= this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    return this.eraserKey?.isDown ?? false;
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.handlePointerDown, this);
    this.scene.input.off('pointermove', this.handlePointerMove, this);
    this.scene.input.off('pointerup', this.handlePointerUp, this);
    this.scene.input.off('pointerupoutside', this.handlePointerUp, this);

    this.activePointerId = null;
    this.pendingTouchEraser = false;
  }

  private readonly handlePointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (this.activePointerId !== null && this.activePointerId !== pointer.id) {
      return;
    }

    this.activePointerId = pointer.id;
    this.pointerTargetX = pointer.x;
  };

  private readonly handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id !== this.activePointerId || !pointer.isDown) {
      return;
    }

    this.pointerTargetX = pointer.x;
  };

  private readonly handlePointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.activePointerId) {
      this.activePointerId = null;
      this.pointerTargetX = pointer.x;
    }

    if (!pointer.wasTouch || !this.isTap(pointer)) {
      return;
    }

    const now = this.scene.time.now;
    const dx = pointer.x - this.lastTapX;
    const dy = pointer.y - this.lastTapY;
    const isDoubleTap = now - this.lastTapTimeMs <= InputSystem.DOUBLE_TAP_MAX_DELAY_MS
      && ((dx * dx) + (dy * dy)) <= InputSystem.DOUBLE_TAP_MAX_DISTANCE_PX ** 2;

    if (isDoubleTap) {
      this.pendingTouchEraser = true;
      this.lastTapTimeMs = Number.NEGATIVE_INFINITY;
      return;
    }

    this.lastTapTimeMs = now;
    this.lastTapX = pointer.x;
    this.lastTapY = pointer.y;
  };

  private isTap(pointer: Phaser.Input.Pointer): boolean {
    return pointer.getDuration() <= InputSystem.TAP_MAX_DURATION_MS
      && pointer.getDistance() <= InputSystem.TAP_MAX_TRAVEL_PX;
  }

  private consumeTouchEraserRequest(): boolean {
    if (!this.pendingTouchEraser) {
      return false;
    }

    this.pendingTouchEraser = false;
    return true;
  }
}
