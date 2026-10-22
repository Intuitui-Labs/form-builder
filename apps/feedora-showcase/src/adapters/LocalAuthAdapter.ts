import type {
  AuthMode,
  AuthUser,
  ExportDataPayload,
  SignInInput,
  SignUpCreatorInput,
  SignUpRespondentInput,
} from '../domain/authTypes';
import type { IAuthPort } from '../domain/ports/IAuthPort';
import type { IEntityStore } from '../domain/ports/IEntityStore';

/** Initial seed accounts mirroring Gihini's real SQLite DB */
const DEFAULT_ACCOUNTS: AuthUser[] = [
  {
    id: 'user-2',
    email: 'gihinilwaid@uni.lk',
    role: 'respondent',
    displayName: 'gihinilwaid',
    avatar: '🎙️',
    organizationId: 'entity-1',
    organizationName: 'University of Moratuwa',
    organizationType: 'university',
    userRoleInOrg: 'Student Researcher',
    gender: 'F',
    ageGroup: '18-24',
    totalPoints: 420,
    surveysCompleted: 1,
    badges: ['bronze'],
    createdAt: '2026-04-12T10:00:00Z',
  },
  {
    id: 'user-1',
    email: 'creator@moratuwa.ac.lk',
    role: 'creator',
    displayName: 'Dr. Gihini',
    avatar: '🔬',
    firstName: 'Gihini',
    lastName: 'Perera',
    company: 'Dept of Information Technology',
    organizationId: 'entity-1',
    organizationName: 'University of Moratuwa',
    organizationType: 'university',
    userRoleInOrg: 'Principal Investigator',
    country: 'Sri Lanka',
    bio: 'Lead researcher on the Hedonic-Motivation System Adoption Model (HMSAM) voice economy platform.',
    website: 'https://uom.lk/it',
    totalPoints: 0,
    createdAt: '2026-03-01T08:30:00Z',
  },
];

export class LocalAuthAdapter implements IAuthPort {
  readonly mode: AuthMode = 'local';
  private users: Map<string, AuthUser> = new Map();
  private passwords: Map<string, string> = new Map();
  private currentUser: AuthUser | null = null;
  private readonly listeners = new Set<(user: AuthUser | null) => void>();

  constructor(private readonly store?: IEntityStore) {
    for (const acc of DEFAULT_ACCOUNTS) {
      this.users.set(acc.email.toLowerCase(), acc);
      this.passwords.set(acc.email.toLowerCase(), 'feedora123');
    }
    // Default logged in user
    this.currentUser = DEFAULT_ACCOUNTS[0] ?? null;
  }

  async init(): Promise<AuthUser | null> {
    return this.currentUser;
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  onAuthStateChange(listener: (user: AuthUser | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.currentUser);
    }
  }

  async signUpRespondent(input: SignUpRespondentInput): Promise<AuthUser> {
    const emailKey = input.email.toLowerCase().trim();
    if (this.users.has(emailKey)) {
      throw new Error(`Account already exists for email: ${input.email}`);
    }

    const newUser: AuthUser = {
      id: `resp-${Date.now()}`,
      email: input.email.trim(),
      role: 'respondent',
      displayName: input.displayName || input.email.split('@')[0] || 'Respondent',
      avatar: input.avatar || '🎯',
      gender: input.gender || 'NS',
      ageGroup: input.ageGroup || '18-24',
      totalPoints: 0,
      surveysCompleted: 0,
      badges: [],
      createdAt: new Date().toISOString(),
    };

    this.users.set(emailKey, newUser);
    this.passwords.set(emailKey, input.password || 'password123');
    this.currentUser = newUser;
    this.notify();
    return newUser;
  }

  async signUpCreator(input: SignUpCreatorInput): Promise<AuthUser> {
    const emailKey = input.email.toLowerCase().trim();
    if (this.users.has(emailKey)) {
      throw new Error(`Account already exists for email: ${input.email}`);
    }

    const newUser: AuthUser = {
      id: `creat-${Date.now()}`,
      email: input.email.trim(),
      role: 'creator',
      displayName: input.displayName || `${input.firstName} ${input.lastName}`.trim(),
      firstName: input.firstName,
      lastName: input.lastName,
      avatar: input.avatar || '🏛️',
      country: input.country || 'Sri Lanka',
      website: input.website || '',
      bio: input.bio || '',
      totalPoints: 0,
      createdAt: new Date().toISOString(),
    };

    this.users.set(emailKey, newUser);
    this.passwords.set(emailKey, input.password || 'password123');
    this.currentUser = newUser;
    this.notify();
    return newUser;
  }

  async signIn(input: SignInInput): Promise<AuthUser> {
    const emailKey = input.email.toLowerCase().trim();
    const user = this.users.get(emailKey);
    if (!user) {
      throw new Error('Invalid email or account does not exist.');
    }

    const storedPass = this.passwords.get(emailKey);
    if (input.password && storedPass && input.password !== storedPass) {
      throw new Error('Invalid password.');
    }

    if (input.role && user.role !== input.role) {
      throw new Error(`This account is registered as a ${user.role}, not a ${input.role}.`);
    }

    this.currentUser = user;
    this.notify();
    return user;
  }

  async signOut(): Promise<void> {
    this.currentUser = null;
    this.notify();
  }

  async exportData(format: 'json' | 'csv' | 'sql'): Promise<ExportDataPayload> {
    const userList = Array.from(this.users.values());
    const responses = this.store ? await this.store.listResponses() : [];

    if (format === 'json') {
      const data = {
        exportedAt: new Date().toISOString(),
        source: 'Feedora Showcase Local Store',
        targetSchema: 'Django Gihini-Uni/research',
        users: userList,
        responses,
      };
      return {
        format: 'json',
        timestamp: new Date().toISOString(),
        userCount: userList.length,
        responseCount: responses.length,
        content: JSON.stringify(data, null, 2),
      };
    }

    if (format === 'csv') {
      const headers = ['id', 'email', 'role', 'display_name', 'organization', 'points', 'created_at'];
      const rows = userList.map((u) => [
        u.id,
        u.email,
        u.role,
        `"${u.displayName}"`,
        `"${u.organizationName || ''}"`,
        u.totalPoints,
        u.createdAt || '',
      ]);
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      return {
        format: 'csv',
        timestamp: new Date().toISOString(),
        userCount: userList.length,
        responseCount: responses.length,
        content: csv,
      };
    }

    // SQL format matching Django SQLite / Supabase PostgreSQL
    const sqlStatements: string[] = [
      '-- Feedora Data Export for Django / PostgreSQL Schema',
      `-- Generated at: ${new Date().toISOString()}`,
      '',
    ];

    for (const u of userList) {
      sqlStatements.push(
        `INSERT INTO accounts_user (username, email, role, is_active, is_staff, is_superuser, date_joined) VALUES ('${u.email}', '${u.email}', '${u.role}', 1, 0, 0, '${u.createdAt || new Date().toISOString()}');`,
      );
      if (u.role === 'respondent') {
        sqlStatements.push(
          `INSERT INTO accounts_respondentprofile (display_name, gender, age_group, avatar, total_points, user_id) VALUES ('${u.displayName}', '${u.gender || 'NS'}', '${u.ageGroup || '18-24'}', '${u.avatar}', ${u.totalPoints}, (SELECT id FROM accounts_user WHERE email='${u.email}'));`,
        );
      } else {
        sqlStatements.push(
          `INSERT INTO accounts_creatorprofile (display_name, company, bio, website, avatar, user_id) VALUES ('${u.displayName}', '${u.company || ''}', '${u.bio || ''}', '${u.website || ''}', '${u.avatar}', (SELECT id FROM accounts_user WHERE email='${u.email}'));`,
        );
        sqlStatements.push(
          `INSERT INTO accounts_organization (org_name, org_type, user_role, country, user_id) VALUES ('${u.organizationName || ''}', '${u.organizationType || 'university'}', '${u.userRoleInOrg || ''}', '${u.country || 'Sri Lanka'}', (SELECT id FROM accounts_user WHERE email='${u.email}'));`,
        );
      }
    }

    return {
      format: 'sql',
      timestamp: new Date().toISOString(),
      userCount: userList.length,
      responseCount: responses.length,
      content: sqlStatements.join('\n'),
    };
  }
}
