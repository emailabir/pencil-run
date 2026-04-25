const BEST_DISTANCE_KEY = 'pencil-run-best-distance';

export class ProgressService {
  static getBestDistance(): number {
    try {
      const raw = window.localStorage.getItem(BEST_DISTANCE_KEY);
      const value = raw ? Number(raw) : 0;
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    } catch {
      return 0;
    }
  }

  static setBestDistance(distance: number): number {
    const sanitized = Math.max(0, Math.floor(distance));
    const best = Math.max(this.getBestDistance(), sanitized);

    try {
      window.localStorage.setItem(BEST_DISTANCE_KEY, String(best));
    } catch {
      // Ignore storage failures in private mode / restricted contexts.
    }

    return best;
  }
}
