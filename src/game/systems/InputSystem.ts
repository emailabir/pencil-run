import Phaser from 'phaser';
import { GAME_CONFIG } from '../core/gameConfig';

interface InputResult {
  x: number;
  isMoving: boolean;
  useEraser: boolean;
}

export class InputSystem {
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;

  private eraserKey?: Phaser.Input.Keyboard.Key;

  constructor(private readonly scene: Phaser.Scene) {
  }

  update(currentX: number, deltaSeconds: number, minX: number, maxX: number): InputResult {
    this.cursors ??= this.scene.input.keyboard?.createCursorKeys();
    this.eraserKey ??= this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.X);

    const left = this.cursors?.left;
    const right = this.cursors?.right;
    let newX = currentX;
    let isMoving = false;

    if (left?.isDown) {
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
      useEraser: this.eraserKey ? Phaser.Input.Keyboard.JustDown(this.eraserKey) : false,
    };
  }

  isEraserDown(): boolean {
    this.eraserKey ??= this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    return this.eraserKey?.isDown ?? false;
  }
}
