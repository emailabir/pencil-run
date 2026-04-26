import Phaser from 'phaser';
import { SceneKeys } from '../core/sceneKeys';

export class MenuScene extends Phaser.Scene {
  private startKey?: Phaser.Input.Keyboard.Key;

  private isStarting = false;

  constructor() {
    super(SceneKeys.Menu);
  }

  create(): void {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0xf0f3ff);
    this.add.text(width / 2, height * 0.28, 'PENCIL RUN', {
      fontFamily: 'Arial Black',
      fontSize: '56px',
      color: '#2c3f8a',
      align: 'center',
    }).setOrigin(0.5);

    this.add.text(
      width / 2,
      height * 0.42,
      'Climb the notebook.\nAvoid obstacle lines.\nCollect lead and erasers.\nDesktop: Arrow keys move, X erases.\nTouch: Drag to move, double tap erases.',
      {
      fontFamily: 'Arial',
      fontSize: '21px',
      color: '#344486',
      align: 'center',
      lineSpacing: 10,
      },
    ).setOrigin(0.5);

    this.add.text(width / 2, height * 0.7, 'Tap or press SPACE to start', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#1f2d66',
    }).setOrigin(0.5);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    this.input.keyboard?.resetKeys();
    this.input.keyboard?.addCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.startKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.input.once('pointerdown', this.startPlay, this);
  }

  update(): void {
    if (this.startKey && Phaser.Input.Keyboard.JustDown(this.startKey)) {
      this.startPlay();
    }
  }

  private startPlay(): void {
    if (this.isStarting) {
      return;
    }

    this.isStarting = true;
    this.scene.start(SceneKeys.Play);
  }

  private handleShutdown(): void {
    this.input.off('pointerdown', this.startPlay, this);
    this.input.keyboard?.removeKey(Phaser.Input.Keyboard.KeyCodes.SPACE, true, true);
    this.startKey = undefined;
    this.isStarting = false;
  }
}
