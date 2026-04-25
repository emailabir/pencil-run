import Phaser from 'phaser';

export interface LineCrossCelebrationEvent {
  totalLinesCrossed: number;
  phrase: string;
}

export class LineCrossSystem {
  private readonly crossedRows = new Set<number>();

  private readonly awardedMilestones = new Set<number>();

  private totalLinesCrossed = 0;

  constructor(
    private readonly linesPerMilestone: number,
    private readonly phrases: readonly string[],
  ) {
  }

  update(
    playerBounds: Phaser.Geom.Rectangle,
    obstacleRows: ReadonlyMap<number, readonly Phaser.GameObjects.Rectangle[]>,
  ): LineCrossCelebrationEvent[] {
    const events: LineCrossCelebrationEvent[] = [];

    for (const [rowId, segments] of obstacleRows.entries()) {
      if (segments.length === 0 || this.crossedRows.has(rowId)) {
        continue;
      }

      const rowTop = this.getRowTop(segments);
      if (rowTop <= playerBounds.bottom) {
        continue;
      }

      this.crossedRows.add(rowId);
      this.totalLinesCrossed += 1;

      if (
        this.totalLinesCrossed % this.linesPerMilestone === 0
        && !this.awardedMilestones.has(this.totalLinesCrossed)
      ) {
        this.awardedMilestones.add(this.totalLinesCrossed);
        events.push({
          totalLinesCrossed: this.totalLinesCrossed,
          phrase: this.getRandomPhrase(),
        });
      }
    }

    return events;
  }

  private getRowTop(segments: readonly Phaser.GameObjects.Rectangle[]): number {
    let rowTop = Number.POSITIVE_INFINITY;

    for (const segment of segments) {
      const body = segment.body as Phaser.Physics.Arcade.Body | undefined;
      if (!body) {
        continue;
      }

      rowTop = Math.min(rowTop, body.top);
    }

    return rowTop;
  }

  private getRandomPhrase(): string {
    if (this.phrases.length === 0) {
      return 'Keep going!';
    }

    return this.phrases[Phaser.Math.Between(0, this.phrases.length - 1)];
  }
}