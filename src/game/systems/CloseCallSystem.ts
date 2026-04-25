import Phaser from 'phaser';

interface TrackedCloseCallRow {
  minDistancePx: number;
}

export class CloseCallSystem {
  private readonly trackedRows = new Map<number, TrackedCloseCallRow>();

  private readonly awardedRows = new Set<number>();

  constructor(private readonly closeCallDistancePx: number) {
  }

  update(
    playerBounds: Phaser.Geom.Rectangle,
    obstacleRows: ReadonlyMap<number, readonly Phaser.GameObjects.Rectangle[]>,
  ): number[] {
    const triggeredRowIds: number[] = [];

    for (const [rowId, segments] of obstacleRows.entries()) {
      if (segments.length === 0 || this.awardedRows.has(rowId)) {
        continue;
      }

      const trackedRow = this.trackedRows.get(rowId) ?? { minDistancePx: Number.POSITIVE_INFINITY };

      for (const segment of segments) {
        const body = segment.body as Phaser.Physics.Arcade.Body | undefined;
        if (!body) {
          continue;
        }

        const distancePx = this.getDistanceBetweenRects(playerBounds, body);
        trackedRow.minDistancePx = Math.min(trackedRow.minDistancePx, distancePx);
      }

      const rowTop = this.getRowTop(segments);

      if (rowTop > playerBounds.bottom) {
        if (
          trackedRow.minDistancePx > 0
          && trackedRow.minDistancePx <= this.closeCallDistancePx
        ) {
          this.awardedRows.add(rowId);
          triggeredRowIds.push(rowId);
        }

        this.trackedRows.delete(rowId);
        continue;
      }

      this.trackedRows.set(rowId, trackedRow);
    }

    for (const rowId of Array.from(this.trackedRows.keys())) {
      if (!obstacleRows.has(rowId)) {
        this.trackedRows.delete(rowId);
      }
    }

    return triggeredRowIds;
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

  private getDistanceBetweenRects(
    playerBounds: Phaser.Geom.Rectangle,
    obstacleBody: Phaser.Physics.Arcade.Body,
  ): number {
    const obstacleRight = obstacleBody.left + obstacleBody.width;
    const obstacleBottom = obstacleBody.top + obstacleBody.height;

    const dx = Math.max(obstacleBody.left - playerBounds.right, playerBounds.left - obstacleRight, 0);
    const dy = Math.max(obstacleBody.top - playerBounds.bottom, playerBounds.top - obstacleBottom, 0);

    return Math.hypot(dx, dy);
  }
}