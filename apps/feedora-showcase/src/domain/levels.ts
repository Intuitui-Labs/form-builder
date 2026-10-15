import { FEEDORA_LEVELS, type LevelDefinition, type Standing } from './types';

/** UI palette, index-aligned with FEEDORA_LEVELS. */
export const LEVEL_COLORS = ['#94A3B8', '#38BDF8', '#818CF8', '#A855F7', '#F59E0B'] as const;

/**
 * Direct port of `accounts/utils.py get_level_info()`.
 *
 * progress = int(((points - min) / (max - min + 1)) * 100), clamped 0-100,
 * points_needed = max + 1 - points, next_title = the next level's title.
 */
export function standingFor(
  totalPoints: number,
  levels: LevelDefinition[] = FEEDORA_LEVELS,
  palette: readonly string[] = LEVEL_COLORS,
): Standing {
  for (const def of levels) {
    if (def.maxPoints === null || totalPoints <= def.maxPoints) {
      const color = palette[def.level - 1] ?? palette[palette.length - 1]!;
      if (def.maxPoints === null) {
        return {
          level: def.level,
          title: def.title,
          points: totalPoints,
          progress: 100,
          next_title: null,
          points_needed: 0,
          color,
        };
      }
      const span = def.maxPoints - def.minPoints + 1;
      const progress = Math.trunc(((totalPoints - def.minPoints) / span) * 100);
      const nextTitle = levels.find((l) => l.level === def.level + 1)?.title ?? null;
      return {
        level: def.level,
        title: def.title,
        points: totalPoints,
        progress: Math.max(0, Math.min(100, progress)),
        next_title: nextTitle,
        points_needed: def.maxPoints + 1 - totalPoints,
        color,
      };
    }
  }

  return {
    level: 1,
    title: 'New Voice',
    points: totalPoints,
    progress: 0,
    next_title: 'Contributor',
    points_needed: 100,
    color: palette[0] ?? '#94A3B8',
  };
}
