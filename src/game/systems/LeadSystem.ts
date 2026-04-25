import Phaser from 'phaser';
import { GAME_CONFIG } from '../core/gameConfig';

export class LeadSystem {
  private lead = Number(GAME_CONFIG.lead.max);

  update(deltaSeconds: number, isMoving: boolean): number {
    const drain = GAME_CONFIG.lead.baseDrainPerSecond + (isMoving ? GAME_CONFIG.lead.moveDrainPerSecond : 0);
    this.lead = Phaser.Math.Clamp(this.lead - drain * deltaSeconds, 0, Number(GAME_CONFIG.lead.max));
    return this.lead;
  }

  restoreFromPickup(): number {
    this.lead = Phaser.Math.Clamp(
      this.lead + Number(GAME_CONFIG.lead.pickupRestore),
      0,
      Number(GAME_CONFIG.lead.max),
    );
    return this.lead;
  }

  getLead(): number {
    return this.lead;
  }

  getLeadRatio(): number {
    return this.lead / Number(GAME_CONFIG.lead.max);
  }

  isDepleted(): boolean {
    return this.lead <= 0;
  }
}
