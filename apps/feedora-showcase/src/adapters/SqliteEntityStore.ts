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
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id     TEXT NOT NULL,
        survey_id     TEXT NOT NULL,
        survey_title  TEXT DEFAULT '',
        user_id       TEXT,
        points_earned INTEGER NOT NULL DEFAULT 0,
        completed_at  TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS hmsam_response (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
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
    const numericPart = entityId.replace(/^org-/, '');
    const row = this.db.getFirstSync<ProfileRow>(
      'SELECT * FROM accounts_respondentprofile WHERE user_id = ? AND (entity_id = ? OR entity_id = ? OR entity_id = ?) LIMIT 1',
      [userId, entityId, `org-${numericPart}`, numericPart],
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
    const numericPart = entityId.replace(/^org-/, '');
    const rows = this.db.getAllSync<ProfileRow>(
      'SELECT * FROM accounts_respondentprofile WHERE entity_id = ? OR entity_id = ? OR entity_id = ? ORDER BY total_points DESC',
      [entityId, `org-${numericPart}`, numericPart],
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

  async recordSurveyResponse(record: import('../domain/ports/IEntityStore').SubmissionHistoryRecord): Promise<void> {
    try {
      this.db.runSync(
        `INSERT INTO surveys_response (entity_id, survey_id, survey_title, user_id, points_earned, completed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          record.entityId,
          record.surveyId,
          record.surveyTitle || 'HMSAM Survey',
          record.userId,
          record.pointsEarned,
          record.completedAt,
        ],
      );
    } catch {
      try {
        this.db.execSync('ALTER TABLE surveys_response ADD COLUMN survey_title TEXT DEFAULT "";');
        this.db.runSync(
          `INSERT INTO surveys_response (entity_id, survey_id, survey_title, user_id, points_earned, completed_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            record.entityId,
            record.surveyId,
            record.surveyTitle || 'HMSAM Survey',
            record.userId,
            record.pointsEarned,
            record.completedAt,
          ],
        );
      } catch {}
    }
  }

  async listUserHistory(userId: string): Promise<import('../domain/ports/IEntityStore').SubmissionHistoryRecord[]> {
    interface HistoryRow {
      id: number;
      entity_id: string;
      survey_id: string;
      survey_title?: string;
      user_id: string;
      points_earned: number;
      completed_at: string;
    }
    try {
      const rows = this.db.getAllSync<HistoryRow>(
        'SELECT * FROM surveys_response WHERE user_id = ? ORDER BY completed_at DESC',
        [userId],
      );
      return rows.map((r) => ({
        id: r.id,
        entityId: r.entity_id,
        surveyId: r.survey_id,
        surveyTitle: r.survey_title || 'Research Survey',
        userId: r.user_id,
        pointsEarned: r.points_earned,
        completedAt: r.completed_at,
      }));
    } catch {
      return [];
    }
  }

  async getPointsByEntity(userId: string): Promise<Record<string, number>> {
    interface EntityPointsRow {
      entity_id: string;
      total: number;
    }
    try {
      const rows = this.db.getAllSync<EntityPointsRow>(
        'SELECT entity_id, SUM(points_earned) as total FROM surveys_response WHERE user_id = ? GROUP BY entity_id ORDER BY total DESC',
        [userId],
      );
      const result: Record<string, number> = {};
      for (const r of rows) {
        result[r.entity_id] = r.total;
      }
      return result;
    } catch {
      return {};
    }
  }

  async claimGuestIdentity(guestUserId: string, accountUserId: string): Promise<void> {
    if (guestUserId === accountUserId) return;

    this.db.withTransactionSync(() => {
      const guestProfiles = this.db.getAllSync<ProfileRow>(
        'SELECT * FROM accounts_respondentprofile WHERE user_id = ?',
        [guestUserId],
      );

      for (const guest of guestProfiles) {
        const account = this.db.getFirstSync<ProfileRow>(
          'SELECT * FROM accounts_respondentprofile WHERE user_id = ? AND entity_id = ?',
          [accountUserId, guest.entity_id],
        );
        if (!account) {
          this.db.runSync(
            'UPDATE accounts_respondentprofile SET user_id = ? WHERE user_id = ? AND entity_id = ?',
            [accountUserId, guestUserId, guest.entity_id],
          );
          continue;
        }

        const badges = [...new Set([...safeParseArray(account.badges), ...safeParseArray(guest.badges)])];
        const totalPoints = account.total_points + guest.total_points;
        this.db.runSync(
          `UPDATE accounts_respondentprofile
             SET total_points = ?, surveys_completed = ?, badges = ?, updated_at = ?
           WHERE user_id = ? AND entity_id = ?`,
          [
            totalPoints,
            account.surveys_completed + guest.surveys_completed,
            JSON.stringify(badges),
            new Date().toISOString(),
            accountUserId,
            guest.entity_id,
          ],
        );
        this.db.runSync(
          'DELETE FROM accounts_respondentprofile WHERE user_id = ? AND entity_id = ?',
          [guestUserId, guest.entity_id],
        );
      }

      this.db.runSync('UPDATE surveys_response SET user_id = ? WHERE user_id = ?', [
        accountUserId,
        guestUserId,
      ]);
    });
  }

  async getItem(key: string): Promise<string | null> {
    const row = this.db.getFirstSync<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      [key],
    );
    return row ? row.value : null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.db.runSync(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }

  async removeItem(key: string): Promise<void> {
    this.db.runSync('DELETE FROM app_settings WHERE key = ?', [key]);
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
