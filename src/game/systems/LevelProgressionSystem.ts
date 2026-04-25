import { GAME_CONFIG } from '../core/gameConfig';

export class LevelProgressionSystem {
  private level = 1;

  private lastAnnouncedMilestone = 0;

  update(distance: number): { level: number; newlyReachedLevels: number[] } {
    const milestoneIndex = this.getMilestoneIndex(distance);
    this.level = milestoneIndex + 1;

    const newlyReachedLevels: number[] = [];

    if (milestoneIndex > this.lastAnnouncedMilestone) {
      for (
        let reachedMilestone = this.lastAnnouncedMilestone + 1;
        reachedMilestone <= milestoneIndex;
        reachedMilestone += 1
      ) {
        newlyReachedLevels.push(reachedMilestone + 1);
      }

      this.lastAnnouncedMilestone = milestoneIndex;
    }

    return {
      level: this.level,
      newlyReachedLevels,
    };
  }

  getLevel(): number {
    return this.level;
  }

  getLastAnnouncedMilestone(): number {
    return this.lastAnnouncedMilestone;
  }

  private getMilestoneIndex(distance: number): number {
    return Math.floor(distance / Number(GAME_CONFIG.progression.levelDistanceMeters));
  }
}