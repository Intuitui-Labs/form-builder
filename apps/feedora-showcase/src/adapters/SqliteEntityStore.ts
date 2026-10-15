import * as SQLite from 'expo-sqlite';
import { standingFor } from '../domain/levels';
import type { IEntityStore, SeedBundle } from '../domain/ports/IEntityStore';
import type { ContributionProfile, Entity } from '../domain/types';

interface ProfileRow {
  user_id: string;
  entity_id: string;
  display_name: string;
  avatar: string;
  total_points: number;
  surveys_completed: number;
  badges: string;
  updated_at: string;
}

/**
 * SQLite persistence behind IEntityStore — the Expo Go path.
 *
 * Uses expo-sqlite (bundled in Expo Go, so no dev build is required). The
 * schema mirrors the relevant subset of her Django tables (accounts_organization,
 * accounts_respondentprofile, surveys_response) plus a response-matrix table so
 * Cronbach's α can be computed across accumulated responses.
 *
 * Standing is kept per (user, entity): responses across many surveys accumulate
 * here, mirroring her RespondentProfile.total_points.
 */
export class SqliteEntityStore implements IEntityStore {
  private readonly db: SQLite.SQLiteDatabase;
  private readonly entities: Entity[];

  constructor(seed: SeedBundle, databaseName = 'feedora.db') {
    this.entities = seed.entities;
    this.db = SQLite.openDatabaseSync(databaseName);
    this.migrate();
    this.seedIfEmpty(seed);
  }

  private migrate(): void {
    this.db.execSync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS accounts_organization (
        id        INTEGER PRIMARY KEY,
        org_name  TEXT NOT NULL,
        org_type  TEXT NOT NULL,
        user_role TEXT DEFAULT '',
        country   TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS accounts_respondentprofile (
        user_id           TEXT NOT NULL,
        entity_id         TEXT NOT NULL,
        display_name      TEXT NOT NULL,
        avatar            TEXT DEFAULT '🗣️',
        total_points      INTEGER NOT NULL DEFAULT 0,
        surveys_completed INTEGER NOT NULL DEFAULT 0,
        badges            TEXT NOT NULL DEFAULT '[]',
        updated_at        TEXT NOT NULL,
        PRIMARY KEY (user_id, entity_id)
      );

      CREATE TABLE IF NOT EXISTS surveys_response (
        id            INTEGER PRIMARY KEY,
        entity_id     TEXT NOT NULL,
        survey_id     TEXT NOT NULL,
        user_id       TEXT,
        points_earned INTEGER NOT NULL DEFAULT 0,
        completed_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS hmsam_response (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL
      );
    `);
  }

  private seedIfEmpty(seed: SeedBundle): void {
    const row = this.db.getFirstSync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM accounts_respondentprofile',
    );
    if (row && row.n > 0) return;

    this.db.withTransactionSync(() => {
      for (const entity of seed.entities) {
        this.db.runSync(
          'INSERT OR REPLACE INTO accounts_organization (id, org_name, org_type, user_role, country) VALUES (?, ?, ?, ?, ?)',
          [numericId(entity.id), entity.name, entity.type, entity.userRole ?? '', entity.country ?? ''],
        );
      }

      for (const profile of seed.profiles) {
        this.db.runSync(
          `INSERT OR REPLACE INTO accounts_respondentprofile
             (user_id, entity_id, display_name, avatar, total_points, surveys_completed, badges, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            profile.userId,
            profile.entityId,
            profile.displayName,
            profile.avatar,
            profile.totalPoints,
            profile.surveysCompleted,
            JSON.stringify(profile.badges),
            profile.updatedAt,
          ],
        );
      }

      for (const response of seed.responses) {
        this.db.runSync('INSERT INTO hmsam_response (payload) VALUES (?)', [
          JSON.stringify(response),
        ]);
      }
    });
  }

  listEntities(): Entity[] {
    return this.entities;
  }

  getEntity(entityId: string): Entity | undefined {
    return this.entities.find((entity) => entity.id === entityId);
  }

  async getProfile(userId: string, entityId: string): Promise<ContributionProfile | null> {
    const row = this.db.getFirstSync<ProfileRow>(
      'SELECT * FROM accounts_respondentprofile WHERE user_id = ? AND entity_id = ?',
      [userId, entityId],
    );
    return row ? toProfile(row) : null;
  }

  async putProfile(profile: ContributionProfile): Promise<void> {
    this.db.runSync(
      `INSERT OR REPLACE INTO accounts_respondentprofile
         (user_id, entity_id, display_name, avatar, total_points, surveys_completed, badges, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profile.userId,
        profile.entityId,
        profile.displayName,
        profile.avatar,
        profile.totalPoints,
        profile.surveysCompleted,
        JSON.stringify(profile.badges),
        profile.updatedAt,
      ],
    );
  }

  async listProfiles(entityId: string): Promise<ContributionProfile[]> {
    const rows = this.db.getAllSync<ProfileRow>(
      'SELECT * FROM accounts_respondentprofile WHERE entity_id = ? ORDER BY total_points DESC',
      [entityId],
    );
    return rows.map(toProfile);
  }

  async addResponse(items: Record<string, number>): Promise<void> {
    this.db.runSync('INSERT INTO hmsam_response (payload) VALUES (?)', [JSON.stringify(items)]);
  }

  async listResponses(): Promise<Record<string, number>[]> {
    const rows = this.db.getAllSync<{ payload: string }>('SELECT payload FROM hmsam_response');
    return rows.map((row) => JSON.parse(row.payload) as Record<string, number>);
  }
}

function toProfile(row: ProfileRow): ContributionProfile {
  return {
    userId: row.user_id,
    entityId: row.entity_id,
    displayName: row.display_name,
    avatar: row.avatar,
    totalPoints: row.total_points,
    surveysCompleted: row.surveys_completed,
    badges: safeParseArray(row.badges),
    standing: standingFor(row.total_points),
    updatedAt: row.updated_at,
  };
}

function numericId(entityId: string): number {
  const match = entityId.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function safeParseArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}
