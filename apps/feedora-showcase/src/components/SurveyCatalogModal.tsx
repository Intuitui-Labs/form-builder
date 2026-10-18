import { useEffect, useState, useMemo } from 'react';
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
import { BatteryEngine, FormKind, FormAccessPolicy } from '@intuitui-labs/form-builder-engine';

interface SurveyCatalogItem {
  id: number;
  uuid: string;
  accessCode: string;
  title: string;
  description: string;
  isHmsam: boolean;
  kind?: FormKind;
  accessPolicy?: FormAccessPolicy;
  questionsCount: number;
  // Dynamic lock criteria
  prerequisiteId?: number | null;
  prerequisiteTitle?: string;
  unlockCodeRequired?: boolean;
}

interface SurveyCatalogModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectSurvey: (uuid: string) => Promise<void>;
  completedSurveyIds?: Set<number | string>;
}

export function SurveyCatalogModal({
  visible,
  onClose,
  onSelectSurvey,
  completedSurveyIds = new Set(),
}: SurveyCatalogModalProps) {
  const { activeSurveyUuid } = useFeedora();
  const [surveys, setSurveys] = useState<SurveyCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedSurveyForCode, setSelectedSurveyForCode] = useState<SurveyCatalogItem | null>(null);
  const [enteredCode, setEnteredCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'hmsam' | 'custom'>('all');

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    transportPort
      .fetchPublicSurveys()
      .then((items) => {
        // Enrich items with logical progression locks
        // Seed survey ID 1 (or isHmsam) is baseline (no prereq)
        // Others have gentle progression rules for research validity
        const enriched: SurveyCatalogItem[] = items.map((item, idx) => {
          let prerequisiteId: number | null = null;
          let prerequisiteTitle: string | undefined;
          let unlockCodeRequired = false;

          if (!item.isHmsam && idx > 2) {
            // Surveys created later require baseline HMSAM completion first
            prerequisiteId = 1;
            prerequisiteTitle = 'Baseline HMSAM Survey';
          }

          if (item.title.toLowerCase().includes('points') || item.title.toLowerCase().includes('gamification')) {
            unlockCodeRequired = false;
          }

          const kind: FormKind = item.isHmsam
            ? 'survey'
            : item.title.toLowerCase().includes('quiz')
            ? 'quiz'
            : item.title.toLowerCase().includes('exam')
            ? 'exam'
            : item.title.toLowerCase().includes('intake')
            ? 'intake'
            : 'survey';

          const accessPolicy = BatteryEngine.getDefaultAccessPolicy(kind);

          return {
            ...item,
            kind,
            accessPolicy,
            prerequisiteId,
            prerequisiteTitle,
            unlockCodeRequired,
          };
        });

        setSurveys(enriched);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible]);

  const filtered = useMemo(() => {
    return surveys.filter((s) => {
      const matchSearch =
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.accessCode.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      if (activeTab === 'hmsam') return s.isHmsam;
      if (activeTab === 'custom') return !s.isHmsam;
      return true;
    });
  }, [surveys, search, activeTab]);

  const handleSurveyClick = async (survey: SurveyCatalogItem) => {
    // Check prerequisite
    if (survey.prerequisiteId && !completedSurveyIds.has(survey.prerequisiteId) && !completedSurveyIds.has('hmsam')) {
      alert(`🔒 Locked: Please complete the "${survey.prerequisiteTitle || 'Prerequisite Survey'}" first to unlock this research instrument.`);
      return;
    }

    // Check allowRedo policy
    const isCompleted = completedSurveyIds.has(survey.id) || (survey.isHmsam && completedSurveyIds.has('hmsam'));
    if (isCompleted && survey.accessPolicy && !survey.accessPolicy.allowRedo) {
      alert(`🔒 Completed: This ${survey.kind || 'instrument'} has already been completed and retakes are restricted by the research protocol.`);
      return;
    }

    // Check code lock if required
    if (survey.unlockCodeRequired) {
      setSelectedSurveyForCode(survey);
      setEnteredCode('');
      setCodeError(null);
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
    if (enteredCode.trim().toUpperCase() === selectedSurveyForCode.accessCode.toUpperCase()) {
      setSelectedSurveyForCode(null);
      await onSelectSurvey(selectedSurveyForCode.uuid);
      onClose();
    } else {
      setCodeError(`Invalid code. Expected access code for "${selectedSurveyForCode.title}".`);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.eyebrow}>RESEARCH COMMONS</Text>
              <Tag tone="teal">LIVE DJANGO CATALOG</Tag>
            </View>
            <Text style={styles.title}>All Available Surveys</Text>
            <Text style={styles.subtitle}>
              Browse all instruments created by researchers. Choose a study to begin or view its requirements.
            </Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        {/* Search & Tabs */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by title, access code (e.g. XIHJLP), or topic…"
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
              All Studies ({surveys.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'hmsam' && styles.tabActive]}
            onPress={() => setActiveTab('hmsam')}
          >
            <Text style={[styles.tabText, activeTab === 'hmsam' && styles.tabTextActive]}>
              HMSAM Validated
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'custom' && styles.tabActive]}
            onPress={() => setActiveTab('custom')}
          >
            <Text style={[styles.tabText, activeTab === 'custom' && styles.tabTextActive]}>
              Custom Lab Surveys
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
            {filtered.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEmoji}>🔎</Text>
                <Text style={styles.emptyTitle}>No matching studies found</Text>
                <Text style={styles.emptyDesc}>Try adjusting your search query or switch tabs.</Text>
              </View>
            ) : (
              filtered.map((item) => {
                const isActive = item.uuid === activeSurveyUuid;
                const isCompleted = completedSurveyIds.has(item.id) || (item.isHmsam && completedSurveyIds.has('hmsam'));
                const isLocked = Boolean(item.prerequisiteId && !completedSurveyIds.has(item.prerequisiteId) && !completedSurveyIds.has('hmsam'));

                return (
                  <Pressable
                    key={item.uuid}
                    style={[
                      styles.card,
                      isActive && styles.cardActive,
                      isLocked && styles.cardLocked,
                    ]}
                    onPress={() => handleSurveyClick(item)}
                  >
                    <View style={styles.cardHeader}>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Tag tone={item.isHmsam ? 'violet' : item.kind === 'quiz' ? 'gold' : 'teal'}>
                          {item.kind ? item.kind.toUpperCase() : 'SURVEY'}
                        </Tag>
                        <Tag tone={item.isHmsam ? 'violet' : 'teal'}>
                          {item.isHmsam ? 'HMSAM 38-ITEMS' : `${item.questionsCount} QUESTIONS`}
                        </Tag>
                        <Tag tone="slate">CODE: {item.accessCode}</Tag>
                        {isActive && <Tag tone="gold">ACTIVE NOW</Tag>}
                        {isCompleted && (
                          <Tag tone={item.accessPolicy?.allowRedo ? 'teal' : 'slate'}>
                            {item.accessPolicy?.allowRedo ? '✓ DONE (RETAKE ALLOWED)' : '✓ LOCKED (COMPLETED)'}
                          </Tag>
                        )}
                      </View>
                      <Text style={styles.statusIndicator}>
                        {isLocked ? '🔒' : isActive ? '🌟' : isCompleted ? (item.accessPolicy?.allowRedo ? '🔄' : '✅') : '→'}
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
                          🔒 Prerequisite required: Complete {item.prerequisiteTitle || 'Baseline HMSAM'} to unlock.
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
                  placeholder={`e.g. ${selectedSurveyForCode.accessCode}`}
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
