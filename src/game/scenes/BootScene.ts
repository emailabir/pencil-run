import Phaser from 'phaser';
import { GAME_CONFIG } from '../core/gameConfig';
import { SceneKeys } from '../core/sceneKeys';

export class BootScene extends Phaser.Scene {
  private hasStartedMenu = false;

  constructor() {
    super(SceneKeys.Boot);
  }

  preload(): void {
    this.load.image('pencil-player', '/pencil-player-clean.png');
    this.load.image('fire-hazard', '/fire-hazard.png');
  }

  create(): void {
    void this.loadOptionalAudioAndStartMenu();
  }

  private async loadOptionalAudioAndStartMenu(): Promise<void> {
    const musicConfig = GAME_CONFIG.audio.music;
    const hasMusicAsset = await this.assetExists(musicConfig.assetPath);

    if (!hasMusicAsset) {
      console.info(
        `[BootScene] Optional gameplay music not found at ${musicConfig.assetPath}. Gameplay will use the built-in synth fallback until you add the final file.`,
      );
      this.startMenu();
      return;
    }

    this.load.audio(musicConfig.key, musicConfig.assetPath);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.startMenu();
    });
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      if (file.key !== musicConfig.key) {
        return;
      }

      console.warn(`[BootScene] Failed to load gameplay music from ${musicConfig.assetPath}.`);
      this.startMenu();
    });
    this.load.start();
  }

  private startMenu(): void {
    if (this.hasStartedMenu) {
      return;
    }

    this.hasStartedMenu = true;
    this.scene.start(SceneKeys.Menu);
  }

  private async assetExists(assetPath: string): Promise<boolean> {
    try {
      const response = await fetch(assetPath, { method: 'HEAD', cache: 'no-store' });

      if (response.ok) {
        return true;
      }

      if (response.status !== 405) {
        return false;
      }

      const fallbackResponse = await fetch(assetPath, { cache: 'no-store' });
      return fallbackResponse.ok;
    } catch {
      return false;
    }
  }
}
