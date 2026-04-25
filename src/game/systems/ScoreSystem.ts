import { GAME_CONFIG } from '../core/gameConfig';

export class ScoreSystem {
  private distanceMeters = 0;

  update(deltaSeconds: number, scrollSpeed: number): number {
    this.distanceMeters += (scrollSpeed * deltaSeconds) / GAME_CONFIG.scoring.pixelsPerMeter;
    return this.getDistance();
  }

  getDistance(): number {
    return Math.floor(this.distanceMeters);
  }

  getPreciseDistance(): number {
    return this.distanceMeters;
  }
}
