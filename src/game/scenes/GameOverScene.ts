import Phaser from 'phaser';
import { SceneKeys } from '../core/sceneKeys';
import type { GameOverData } from '../../types/game';

export class GameOverScene extends Phaser.Scene {
  private restartKey?: Phaser.Input.Keyboard.Key;

  private isRestarting = false;

  constructor() {
    super(SceneKeys.GameOver);
  }

  create(data: GameOverData): void {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0xeff3ff);
    this.add.text(width / 2, height * 0.27, 'GAME OVER', {
      fontFamily: 'Arial Black',
      fontSize: '52px',
      color: '#2c3f8a',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.41, `Your score: ${data.distance} m\nHigh score: ${data.bestDistance} m`, {
      fontFamily: 'Arial Black, Arial',
      fontSize: '28px',
      color: '#344486',
      align: 'center',
      lineSpacing: 14,
    }).setOrigin(0.5);

    this.add.text(
      width / 2,
      height * 0.58,
      'Game designed by Trishan, age 11.\nThank you for supporting my game!',
      {
        fontFamily: 'Arial',
        fontSize: '26px',
        color: '#344486',
        align: 'center',
        lineSpacing: 14,
      },
    ).setOrigin(0.5);

    this.add.text(
      width / 2,
      height * 0.78,
      'Press SPACE or tap to restart',
      {
        fontFamily: 'Arial',
        fontSize: '24px',
        color: '#1f2d66',
        align: 'center',
      },
    ).setOrigin(0.5);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    this.input.keyboard?.resetKeys();
    this.input.keyboard?.addCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.restartKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.input.once('pointerdown', this.startPlay, this);
  }

  update(): void {
    if (this.restartKey && Phaser.Input.Keyboard.JustDown(this.restartKey)) {
      this.startPlay();
    }
  }

  private startPlay(): void {
    if (this.isRestarting) {
      return;
    }

    this.isRestarting = true;
    this.scene.start(SceneKeys.Play);
  }

  private handleShutdown(): void {
    this.input.off('pointerdown', this.startPlay, this);
    this.input.keyboard?.removeKey(Phaser.Input.Keyboard.KeyCodes.SPACE, true, true);
    this.restartKey = undefined;
    this.isRestarting = false;
  }
}
