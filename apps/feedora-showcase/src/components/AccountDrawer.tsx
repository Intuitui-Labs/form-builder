import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { AuthMode, ExportDataPayload } from '../domain/authTypes';
import { standingFor } from '../domain/levels';
import { authPort, store, useFeedora } from '../feedora';
import { FEEDORA_REMOTE } from '../config';
import type { SubmissionHistoryRecord } from '../domain/ports/IEntityStore';
import { FEEDORA_BADGES } from '../domain/types';
import { colors, radii, serifFont } from '../theme';

interface AccountDrawerProps {
  visible: boolean;
  onClose: () => void;
  onOpenAuth: () => void;
}

export function AccountDrawer({ visible, onClose, onOpenAuth }: AccountDrawerProps) {
  const { authUser, authMode, setAuthMode, profile, refresh } = useFeedora();
  const [exportResult, setExportResult] = useState<ExportDataPayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [historyItems, setHistoryItems] = useState<SubmissionHistoryRecord[]>([]);
  const [entityPoints, setEntityPoints] = useState<{ name: string; points: number }[]>([]);

  useEffect(() => {
    if (!visible || !authUser) return;
    let isMounted = true;

    if (authMode === 'django') {
      fetch(`${FEEDORA_REMOTE.baseUrl}/api/v1/respondent/history/`, {
        credentials: 'include',
      })
        .then((res) => res.json())
        .then((data) => {
          if (!isMounted || !data.ok) return;
          if (Array.isArray(data.history)) {
            setHistoryItems(
              data.history.map((h: any) => ({
                id: h.responseId,
                entityId: h.organization,
                surveyId: h.surveyUuid,
                surveyTitle: h.surveyTitle,
                userId: String(authUser.id),
                pointsEarned: h.pointsEarned,
                completedAt: h.completedAt,
              })),
            );
          }
          if (Array.isArray(data.pointsByOrganization)) {
            setEntityPoints(
              data.pointsByOrganization.map((o: any) => ({
                name: o.organization,
                points: o.points,
              })),
            );
          }
        })
        .catch(() => {});
    }

    store.listUserHistory(String(authUser.id)).then((items) => {
      if (!isMounted) return;
      if (items.length > 0) {
        setHistoryItems((prev) => (prev.length > 0 ? prev : items));
      }
    });

    store.getPointsByEntity(String(authUser.id)).then((ptMap) => {
      if (!isMounted) return;
      const arr = Object.entries(ptMap).map(([entId, pts]) => {
        const ent = store.getEntity(entId);
        return {
          name: ent ? ent.name : entId,
          points: pts,
        };
      });
      if (arr.length > 0) {
        setEntityPoints((prev) => (prev.length > 0 ? prev : arr));
      }
    });

    return () => {
      isMounted = false;
    };
  }, [visible, authUser, authMode]);

  const handleSignOut = async () => {
    await authPort.signOut();
    refresh();
    onClose();
  };

  const handleExport = async (format: 'json' | 'csv' | 'sql') => {
    const res = await authPort.exportData(format);
    setExportResult(res);
    setCopied(false);
  };

  if (!authUser) {
    return null;
  }

  const isCreator = authUser.role === 'creator';
  const displayedPoints = Math.max(profile?.totalPoints ?? 0, authUser.totalPoints ?? 0);
  const standing = standingFor(displayedPoints);
  const surveysCount = profile?.surveysCompleted ?? authUser.surveysCompleted ?? 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.userHead}>
                <Text style={styles.userAvatar}>{authUser.avatar}</Text>
                <View>
                  <Text style={styles.userName}>{authUser.displayName}</Text>
                  <Text style={styles.userEmail}>{authUser.email}</Text>
                </View>
              </View>
              <Pressable style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            {/* Role Badge & Org */}
            <View style={styles.badgeBanner}>
              <View
                style={[
                  styles.rolePill,
                  isCreator ? styles.rolePillCreator : styles.rolePillRespondent,
                ]}
              >
                <Text
                  style={[
                    styles.rolePillText,
                    isCreator ? styles.rolePillTextCreator : styles.rolePillTextRespondent,
                  ]}
                >
                  {isCreator ? '🔬 FORM CREATOR' : '🎙️ FORM RESPONDENT'}
                </Text>
              </View>
              <Text style={styles.orgText}>
                {authUser.organizationName || 'University of Moratuwa'}
              </Text>
            </View>

            {/* Respondent Stats or Creator Stats */}
            {!isCreator ? (
              <>
                <View style={styles.statsCard}>
                  <View style={styles.statCol}>
                    <Text style={styles.statNum}>{displayedPoints.toLocaleString()}</Text>
                    <Text style={styles.statLbl}>Voice Points</Text>
                  </View>
                  <View style={styles.statCol}>
                    <Text style={styles.statNum}>{standing.title}</Text>
                    <Text style={styles.statLbl}>Level Standing</Text>
                  </View>
                  <View style={styles.statCol}>
                    <Text style={styles.statNum}>{surveysCount}</Text>
                    <Text style={styles.statLbl}>Surveys</Text>
                  </View>
                </View>

                {/* Badges & Rewards (Web Parity) */}
                <View style={styles.section}>
                  <Text style={styles.sectionHeading}>BADGES & ACHIEVEMENTS</Text>
                  <Text style={styles.sectionSub}>
                    Participation badges awarded for contributing research responses.
                  </Text>
                  <View style={styles.badgesRow}>
                    {FEEDORA_BADGES.map((b) => {
                      const isUnlocked = surveysCount >= b.minResponses;
                      return (
                        <View
                          key={b.id}
                          style={[
                            styles.badgeCard,
                            isUnlocked ? styles.badgeCardUnlocked : styles.badgeCardLocked,
                          ]}
                        >
                          <Text style={[styles.badgeIcon, !isUnlocked && styles.badgeIconLocked]}>
                            {b.icon}
                          </Text>
                          <Text style={styles.badgeName}>{b.label}</Text>
                          <Text style={styles.badgeRule}>{b.rule}</Text>
                          <View
                            style={[
                              styles.badgeStatusPill,
                              isUnlocked
                                ? styles.badgeStatusPillUnlocked
                                : styles.badgeStatusPillLocked,
                            ]}
                          >
                            <Text
                              style={[
                                styles.badgeStatusText,
                                isUnlocked
                                  ? styles.badgeStatusTextUnlocked
                                  : styles.badgeStatusTextLocked,
                              ]}
                            >
                              {isUnlocked ? '✓ UNLOCKED' : `${surveysCount}/${b.minResponses}`}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Contributions by Organization (mirrors her points_by_company) */}
                <View style={styles.section}>
                  <Text style={styles.sectionHeading}>CONTRIBUTIONS BY ORGANIZATION</Text>
                  <Text style={styles.sectionSub}>
                    Voice points earned across participating universities and research labs.
                  </Text>
                  {entityPoints.length === 0 ? (
                    <View style={styles.emptyHistoryBox}>
                      <Text style={styles.emptyHistoryText}>
                        No points recorded yet. Submit a survey to start contributing!
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.orgPointsList}>
                      {entityPoints.map((op, i) => (
                        <View key={i} style={styles.orgPointRow}>
                          <Text style={styles.orgPointName}>{op.name}</Text>
                          <Text style={styles.orgPointVal}>{op.points} pts</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Submissions & Survey History (mirrors her respondent_profile.html) */}
                <View style={styles.section}>
                  <Text style={styles.sectionHeading}>RECENT SUBMISSIONS & RESPONSES</Text>
                  <Text style={styles.sectionSub}>
                    Audit trail of research surveys completed and points awarded.
                  </Text>
                  {historyItems.length === 0 ? (
                    <View style={styles.emptyHistoryBox}>
                      <Text style={styles.emptyHistoryText}>
                        No completed surveys found in this session.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.historyList}>
                      {historyItems.map((item, idx) => (
                        <View key={idx} style={styles.historyCard}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.historyTitle}>{item.surveyTitle}</Text>
                            <Text style={styles.historyMeta}>
                              {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : 'Today'} · {item.entityId}
                            </Text>
                          </View>
                          <View style={styles.historyPointsBadge}>
                            <Text style={styles.historyPointsText}>+{item.pointsEarned} pts</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </>
            ) : (
              <View style={styles.creatorCard}>
                <Text style={styles.creatorOrgTitle}>
                  {authUser.organizationName || 'University of Moratuwa'}
                </Text>
                <Text style={styles.creatorOrgRole}>
                  {authUser.userRoleInOrg || 'Principal Investigator'} · {authUser.country || 'Sri Lanka'}
                </Text>
                {authUser.bio ? <Text style={styles.creatorBio}>{authUser.bio}</Text> : null}
              </View>
            )}

            {/* Engine Switcher & Developer Tools — Creators / Admins Only */}
            {isCreator && (
              <>
                <View style={styles.section}>
                  <Text style={styles.sectionHeading}>ACTIVE BACKEND ENGINE (CREATOR TOOLS)</Text>
                  <View style={styles.modeRow}>
                    <Pressable
                      style={[styles.modeBtn, authMode === 'local' && styles.modeBtnActive]}
                      onPress={() => setAuthMode('local')}
                    >
                      <Text style={[styles.modeBtnText, authMode === 'local' && styles.modeBtnTextActive]}>
                        ⚡ Local SQLite
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modeBtn, authMode === 'supabase' && styles.modeBtnActive]}
                      onPress={() => setAuthMode('supabase')}
                    >
                      <Text style={[styles.modeBtnText, authMode === 'supabase' && styles.modeBtnTextActive]}>
                        ☁️ Supabase
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modeBtn, authMode === 'django' && styles.modeBtnActive]}
                      onPress={() => setAuthMode('django')}
                    >
                      <Text style={[styles.modeBtnText, authMode === 'django' && styles.modeBtnTextActive]}>
                        🐍 Django API
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* Data Migration & Export (Aligned with Gihini's schema) */}
                <View style={styles.section}>
                  <Text style={styles.sectionHeading}>SCHEMA EXPORT & MIGRATION</Text>
                  <Text style={styles.sectionSub}>
                    Export data aligned 1:1 with Gihini's Django models for instant migration.
                  </Text>
                  <View style={styles.exportRow}>
                    <Pressable style={styles.exportBtn} onPress={() => handleExport('json')}>
                      <Text style={styles.exportBtnText}>📥 Export JSON</Text>
                    </Pressable>
                    <Pressable style={styles.exportBtn} onPress={() => handleExport('csv')}>
                      <Text style={styles.exportBtnText}>📊 Export CSV</Text>
                    </Pressable>
                    <Pressable style={styles.exportBtn} onPress={() => handleExport('sql')}>
                      <Text style={styles.exportBtnText}>🗄️ Export SQL</Text>
                    </Pressable>
                  </View>

                  {exportResult && (
                    <View style={styles.exportBox}>
                      <View style={styles.exportHead}>
                        <Text style={styles.exportFormat}>
                          {exportResult.format.toUpperCase()} EXPORT ({exportResult.userCount} users)
                        </Text>
                        <Pressable
                          onPress={() => {
                            setCopied(true);
                          }}
                        >
                          <Text style={styles.copyText}>{copied ? '✓ Saved' : 'Copy Preview'}</Text>
                        </Pressable>
                      </View>
                      <TextInput
                        style={styles.exportText}
                        value={exportResult.content}
                        multiline
                        editable={false}
                      />
                    </View>
                  )}
                </View>
              </>
            )}

            {/* Actions */}
            <View style={styles.actionRow}>
              <Pressable
                style={styles.switchAccountBtn}
                onPress={() => {
                  onClose();
                  onOpenAuth();
                }}
              >
                <Text style={styles.switchAccountText}>Switch Account / Sign In</Text>
              </Pressable>
              <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
                <Text style={styles.signOutText}>Sign Out</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(27, 21, 51, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii.large,
    borderTopRightRadius: radii.large,
    maxHeight: '90%',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 28,
  },
  scroll: {
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  userHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userAvatar: {
    fontSize: 32,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    fontFamily: serifFont,
  },
  userEmail: {
    fontSize: 12,
    color: colors.muted,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.slateSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: '700',
  },
  badgeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.canvas,
    padding: 10,
    borderRadius: radii.small,
    marginBottom: 16,
  },
  rolePill: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
  },
  rolePillRespondent: {
    backgroundColor: colors.primarySoft,
  },
  rolePillCreator: {
    backgroundColor: colors.goldSoft,
  },
  rolePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  rolePillTextRespondent: {
    color: colors.primary,
  },
  rolePillTextCreator: {
    color: colors.gold,
  },
  orgText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.canvas,
    borderRadius: radii.medium,
    padding: 14,
    marginBottom: 16,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.ink,
  },
  statLbl: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '700',
    marginTop: 2,
  },
  creatorCard: {
    backgroundColor: colors.canvas,
    borderRadius: radii.medium,
    padding: 14,
    marginBottom: 16,
    gap: 4,
  },
  creatorOrgTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },
  creatorOrgRole: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '600',
  },
  creatorBio: {
    fontSize: 11,
    color: colors.ink,
    marginTop: 4,
    lineHeight: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.faint,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  sectionSub: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 8,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radii.small,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  modeBtnTextActive: {
    color: '#FFFFFF',
  },
  exportRow: {
    flexDirection: 'row',
    gap: 8,
  },
  exportBtn: {
    flex: 1,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 8,
    borderRadius: radii.small,
    alignItems: 'center',
  },
  exportBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  exportBox: {
    marginTop: 10,
    backgroundColor: colors.canvas,
    borderRadius: radii.small,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  exportHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  exportFormat: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
  },
  copyText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.teal,
  },
  exportText: {
    maxHeight: 120,
    fontSize: 10,
    fontFamily: 'monospace',
    color: colors.ink,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  switchAccountBtn: {
    flex: 1,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 12,
    borderRadius: radii.medium,
    alignItems: 'center',
  },
  switchAccountText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  signOutBtn: {
    paddingHorizontal: 20,
    backgroundColor: colors.roseSoft,
    paddingVertical: 12,
    borderRadius: radii.medium,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.rose,
  },
  orgPointsList: {
    backgroundColor: colors.paper,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    gap: 6,
  },
  orgPointRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  orgPointName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  orgPointVal: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
  },
  historyList: {
    gap: 8,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 10,
  },
  historyTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.ink,
  },
  historyMeta: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  historyPointsBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  historyPointsText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  emptyHistoryBox: {
    backgroundColor: colors.paper,
    borderRadius: radii.medium,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  emptyHistoryText: {
    fontSize: 11.5,
    color: colors.muted,
    textAlign: 'center',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  badgeCard: {
    flex: 1,
    minWidth: 100,
    backgroundColor: colors.paper,
    borderRadius: radii.medium,
    padding: 12,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    gap: 4,
  },
  badgeCardUnlocked: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  badgeCardLocked: {
    opacity: 0.65,
  },
  badgeIcon: {
    fontSize: 28,
    marginBottom: 2,
  },
  badgeIconLocked: {
    opacity: 0.4,
  },
  badgeName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  badgeRule: {
    fontSize: 10,
    color: colors.muted,
    textAlign: 'center',
    minHeight: 26,
  },
  badgeStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    marginTop: 4,
  },
  badgeStatusPillUnlocked: {
    backgroundColor: '#DCFCE7',
  },
  badgeStatusPillLocked: {
    backgroundColor: '#F3F4F6',
  },
  badgeStatusText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  badgeStatusTextUnlocked: {
    color: '#166534',
  },
  badgeStatusTextLocked: {
    color: '#6B7280',
  },
});
