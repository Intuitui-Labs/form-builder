import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { useFeedora, transportPort } from '../feedora';
import { Tag } from './FeedoraUi';
import { colors, radii, serifFont } from '../theme';
import { describeEligibilityReason, type EligibilityReasonForDisplay } from '../domain/eligibilityPresentation';
import type { RemoteSurveyCatalogItem } from '../domain/ports/transportTypes';
import type { SubmissionHistoryRecord } from '../domain/ports/IEntityStore';

interface SurveyCatalogItem extends RemoteSurveyCatalogItem {
  questionsCount: number;
}

interface SurveyCatalogModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectSurvey: (uuid: string) => Promise<void>;
  submissionHistory?: SubmissionHistoryRecord[];
}

export function SurveyCatalogModal({
  visible,
  onClose,
  onSelectSurvey,
  submissionHistory = [],
}: SurveyCatalogModalProps) {
  const { activeSurveyUuid, entityId, authUser, guestUserId, openAuthModal } = useFeedora();
  const [surveys, setSurveys] = useState<SurveyCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedSurveyForCode, setSelectedSurveyForCode] = useState<SurveyCatalogItem | null>(null);
  const [enteredCode, setEnteredCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'hmsam' | 'custom'>('all');

  const reloadSurveys = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    transportPort
      .fetchPublicSurveys(entityId, authUser ? undefined : guestUserId)
      .then((items) => {
        const enriched: SurveyCatalogItem[] = items;

        if (!cancelled) setSurveys(enriched);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSurveys([]);
          setLoadError(error instanceof Error ? error.message : 'Could not load research surveys.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityId, authUser, guestUserId]);

  useEffect(() => {
    if (!visible) return;
    return reloadSurveys();
  }, [visible, reloadSurveys]);

  const filtered = useMemo(() => {
    return surveys.filter((s) => {
      const matchSearch =
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      if (activeTab === 'hmsam') return s.isHmsam;
      if (activeTab === 'custom') return !s.isHmsam;
      return true;
    }).sort((a, b) => {
      const groupA = a.sequenceGroup ? `group:${a.sequenceGroup}` : `survey:${a.uuid}`;
      const groupB = b.sequenceGroup ? `group:${b.sequenceGroup}` : `survey:${b.uuid}`;
      return groupA.localeCompare(groupB) || (a.sequenceOrder ?? a.id) - (b.sequenceOrder ?? b.id);
    });
  }, [surveys, search, activeTab]);

  const knownSurveyTitles = useMemo(
    () => new Map(surveys.map((survey) => [survey.uuid, survey.title])),
    [surveys],
  );
  const serverLockDescription = (reason: EligibilityReasonForDisplay) =>
    describeEligibilityReason(reason, knownSurveyTitles);

  const hasCompletion = (survey: SurveyCatalogItem) => {
    const historyCompletion = submissionHistory.some((record) =>
      record.entityId === entityId &&
      (String(record.surveyId) === survey.uuid || String(record.surveyId) === String(survey.id)),
    );
    return historyCompletion || (Number(survey.attemptsUsed) || 0) > 0;
  };

  const handleSurveyClick = async (survey: SurveyCatalogItem) => {
    if (!survey.eligibility) {
      alert('Refresh the survey list to check whether this survey is available.');
      return;
    }
    const serverReasons = survey.eligibility?.reasons ?? [];
    const serverRequiresAccount = serverReasons.some((reason) => reason.code === 'account_required');
    if ((survey.requiresAccount || serverRequiresAccount) && !authUser) {
      alert('Sign in to start this survey and save your progress.');
      openAuthModal();
      return;
    }
    const nonCodeServerLock = serverReasons.find((reason) => reason.code !== 'access_code_required');
    if (nonCodeServerLock) {
      alert(`🔒 ${serverLockDescription(nonCodeServerLock)}`);
      return;
    }
    if (serverReasons.some((reason) => reason.code === 'access_code_required') || survey.accessCodeRequired) {
      setSelectedSurveyForCode(survey);
      setEnteredCode('');
      setCodeError(null);
      return;
    }
    if (survey.eligibility.eligible === false) {
      const reason = serverReasons[0] ?? { code: 'survey_unavailable' };
      alert(`🔒 ${serverLockDescription(reason)}`);
      return;
    }

    try {
      await onSelectSurvey(survey.uuid);
      onClose();
    } catch (err: any) {
      alert(`Could not open survey: ${err?.message || 'Network error'}`);
    }
  };

  const handleVerifyCode = async () => {
    if (!selectedSurveyForCode) return;
    setCodeError(null);
    try {
      await transportPort.verifySurveyAccessCode(selectedSurveyForCode.uuid, enteredCode);
      await onSelectSurvey(selectedSurveyForCode.uuid);
      setSelectedSurveyForCode(null);
      onClose();
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : 'That access code could not be verified.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Research Surveys</Text>
          </View>
          <Pressable style={styles.refreshBtn} onPress={reloadSurveys} hitSlop={10}>
            <Text style={styles.refreshText}>🔄</Text>
          </Pressable>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        {/* Search & Tabs */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by title or topic…"
            placeholderTextColor={colors.faint}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tab, activeTab === 'all' && styles.tabActive]}
            onPress={() => setActiveTab('all')}
          >
            <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
              All ({surveys.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'hmsam' && styles.tabActive]}
            onPress={() => setActiveTab('hmsam')}
          >
            <Text style={[styles.tabText, activeTab === 'hmsam' && styles.tabTextActive]}>
              HMSAM
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'custom' && styles.tabActive]}
            onPress={() => setActiveTab('custom')}
          >
            <Text style={[styles.tabText, activeTab === 'custom' && styles.tabTextActive]}>
              Custom
            </Text>
          </Pressable>
        </View>

        {/* List of Surveys */}
        {loading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading research instruments from Django server…</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {loadError ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEmoji}>📡</Text>
                <Text style={styles.emptyTitle}>Couldn’t load surveys</Text>
                <Text style={styles.emptyDesc}>{loadError}</Text>
                <Pressable style={styles.retryCatalogButton} onPress={reloadSurveys} accessibilityRole="button">
                  <Text style={styles.retryCatalogText}>Try again</Text>
                </Pressable>
              </View>
            ) : filtered.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEmoji}>🔎</Text>
                <Text style={styles.emptyTitle}>No matching studies found</Text>
                <Text style={styles.emptyDesc}>Try adjusting your search query or switch tabs.</Text>
              </View>
            ) : (
              filtered.map((item, index) => {
                const isActive = item.uuid === activeSurveyUuid;
                const isCompleted = hasCompletion(item);
                const isLocked = !item.eligibility || item.eligibility.eligible === false;
                const canRetake = !isLocked && isCompleted;

                return (
                  <View key={item.uuid}>
                  {item.sequenceGroup && (!index || filtered[index - 1]?.sequenceGroup !== item.sequenceGroup) ? (
                    <View style={styles.sequenceHeading}>
                      <Text style={styles.sequenceTitle}>{item.sequenceGroup}</Text>
                      <Text style={styles.sequenceCaption}>Survey sequence</Text>
                    </View>
                  ) : null}
                  <Pressable
                    style={[
                      styles.card,
                      isActive && styles.cardActive,
                      isLocked && styles.cardLocked,
                    ]}
                    onPress={() => handleSurveyClick(item)}
                  >
                    <View style={styles.cardHeader}>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <Tag tone={item.isHmsam ? 'violet' : item.kind === 'quiz' ? 'gold' : 'teal'}>
                          {item.isHmsam ? 'HMSAM' : item.kind ? item.kind.toUpperCase() : 'STUDY'}
                        </Tag>
                        {isActive && <Tag tone="gold">🌟 ACTIVE</Tag>}
                        {isCompleted && (
                          <Tag tone={canRetake ? 'teal' : 'slate'}>
                            {canRetake ? '✓ RETAKE' : '✓ DONE'}
                          </Tag>
                        )}
                        {item.requiresAccount && <Tag tone="slate">SIGN IN</Tag>}
                        {item.sequenceGroup && item.sequenceOrder !== undefined && (
                          <Tag tone="slate">STEP {item.sequenceOrder}</Tag>
                        )}
                      </View>
                      <Text style={styles.statusIndicator}>
                        {isLocked ? '🔒' : isActive ? '🌟' : isCompleted ? (canRetake ? '🔄' : '✅') : '→'}
                      </Text>
                    </View>

                    <Text style={styles.cardTitle}>{item.title}</Text>
                    {item.description ? (
                      <Text style={styles.cardDesc} numberOfLines={2}>
                        {item.description}
                      </Text>
                    ) : null}

                    {isLocked ? (
                      <View style={styles.prereqNotice}>
                        <Text style={styles.prereqText}>
                          🔒 {serverLockDescription(item.eligibility?.reasons[0] ?? { code: 'survey_unavailable' })}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.cardFooter}>
                        <Text style={styles.cardMeta}>
                          {item.questionsCount} items · Voice Points Eligible
                        </Text>
                        <Text style={styles.tapToOpen}>
                          {isActive ? 'Current Survey' : 'Tap to Launch →'}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}

        {/* Modal for Code Locked Survey */}
        {selectedSurveyForCode && (
          <Modal transparent animationType="fade" visible={!!selectedSurveyForCode}>
            <View style={styles.codeModalBackdrop}>
              <View style={styles.codeModalCard}>
                <Text style={styles.codeModalTitle}>🔑 Enter Researcher Access Code</Text>
                <Text style={styles.codeModalDesc}>
                  "{selectedSurveyForCode.title}" requires the 6-character access code provided by the principal investigator.
                </Text>
                <TextInput
                  style={styles.codeInput}
                  placeholder="Enter access code"
                  placeholderTextColor={colors.faint}
                  value={enteredCode}
                  onChangeText={setEnteredCode}
                  autoCapitalize="characters"
                />
                {codeError && <Text style={styles.codeErrorText}>⚠️ {codeError}</Text>}
                <View style={styles.codeBtnRow}>
                  <Pressable
                    style={[styles.codeBtn, styles.codeBtnCancel]}
                    onPress={() => setSelectedSurveyForCode(null)}
                  >
                    <Text style={styles.codeBtnCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.codeBtn, styles.codeBtnConfirm]}
                    onPress={handleVerifyCode}
                  >
                    <Text style={styles.codeBtnConfirmText}>Unlock & Start 🚀</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
    paddingTop: 48,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.faint,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    fontFamily: serifFont,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    marginTop: 4,
  },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.hover,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  refreshText: {
    fontSize: 14,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.hover,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.small,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: radii.small,
    padding: 3,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.ink,
    fontWeight: '800',
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 40,
    gap: 10,
  },
  sequenceHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 3, paddingTop: 12 },
  sequenceTitle: { color: colors.ink, fontSize: 15, fontWeight: '700', fontFamily: serifFont },
  sequenceCaption: { color: colors.faint, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7 },
  card: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    padding: 14,
    gap: 6,
  },
  cardActive: {
    borderColor: colors.primaryDeep,
    backgroundColor: '#FAF5FF',
    borderWidth: 1.5,
  },
  cardLocked: {
    opacity: 0.7,
    backgroundColor: '#F8FAFC',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusIndicator: {
    fontSize: 16,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.ink,
  },
  cardDesc: {
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.muted,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  cardMeta: {
    fontSize: 10.5,
    color: colors.faint,
    fontWeight: '600',
  },
  tapToOpen: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDeep,
  },
  prereqNotice: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    padding: 6,
    marginTop: 4,
  },
  prereqText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#92400E',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyEmoji: {
    fontSize: 36,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    fontFamily: serifFont,
  },
  emptyDesc: {
    fontSize: 12,
    color: colors.muted,
  },
  retryCatalogButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
  },
  retryCatalogText: {
    color: colors.paper,
    fontSize: 12,
    fontWeight: '700',
  },
  codeModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  codeModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.paper,
    borderRadius: 14,
    padding: 18,
    gap: 10,
  },
  codeModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    fontFamily: serifFont,
  },
  codeModalDesc: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  codeInput: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: 1.5,
  },
  codeErrorText: {
    fontSize: 11,
    color: colors.rose,
    fontWeight: '600',
  },
  codeBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  codeBtn: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeBtnCancel: {
    backgroundColor: colors.hover,
  },
  codeBtnCancelText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.ink,
  },
  codeBtnConfirm: {
    backgroundColor: colors.primary,
  },
  codeBtnConfirmText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
