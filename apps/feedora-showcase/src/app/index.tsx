import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, StyleSheet, Modal, TextInput, Pressable } from 'react-native';
import { router } from 'expo-router';
import {
  MultiStepFormManager,
  type IFeedbackNotifierPort,
  type RewardPayload,
  type QuestionMetadata,
} from '@intuitui-labs/form-builder-engine';
import { StudioShareCodec } from '@intuitui-labs/form-builder-engine/studio';
import {
  ActionButton,
  AppPage,
  BrandHeader,
  EntityCard,
  FieldControl,
  LevelProgress,
  Panel,
  PointsToast,
  SectionHeading,
  StepMeter,
  Tag,
} from '../components/FeedoraUi';
import { AccountBar } from '../components/AccountBar';
import { HMSAM_FORM_SCHEMA, HMSAM_ITEM_COUNT } from '../fixtures/hmsam';
import { FEEDORA_FEATURES } from '../fixtures/seed';
import {
  authPort,
  contributionPort,
  entities,
  measurementPort,
  notifyDataChanged,
  progressPort,
  rewardPort,
  store,
  transportPort,
  useFeedora,
  psychometricAuditor,
  qrAirDropPort,
} from '../feedora';
import { FEEDORA_REMOTE, remoteEnabled } from '../config';
import { pointsForAnswer } from '../domain/points';
import { convertRemoteSurveyToSchema } from '../domain/surveySchemaConverter';
import { colors, serifFont } from '../theme';
import type { ConstructReport } from '../domain/ports/measurementTypes';

type Values = Record<string, unknown>;

/** Bridges the engine's reward stream into React state (toast). */
class CollectingRewardNotifier implements IFeedbackNotifierPort {
  constructor(private readonly onReward: (reward: RewardPayload) => void) {}
  notifyRewardUnlocked(reward: RewardPayload): void {
    this.onReward(reward);
  }
}

export default function SurveyScreen() {
  const {
    entityId,
    setEntityId,
    profile,
    contributorCounts,
    authUser,
    activeSurveyUuid,
    activeSurveyMeta,
    airDropSchema,
    openAirDropSurvey,
    resetToDefaultSurvey,
    openAuthModal,
  } = useFeedora();
  const [runKey, setRunKey] = useState(0);
  const [toast, setToast] = useState<{ points: number; label: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [totalEarned, setTotalEarned] = useState(0);
  const [lastConstructs, setLastConstructs] = useState<ConstructReport[] | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [auditNotice, setAuditNotice] = useState<string | null>(null);

  // AirDrop Import Modal State
  const [isAirDropModalOpen, setIsAirDropModalOpen] = useState(false);
  const [airDropInput, setAirDropInput] = useState('');
  const [airDropError, setAirDropError] = useState<string | null>(null);

  const currentSchema = useMemo(() => {
    if (airDropSchema) {
      return airDropSchema;
    }
    if (activeSurveyMeta) {
      return convertRemoteSurveyToSchema(activeSurveyMeta);
    }
    return HMSAM_FORM_SCHEMA;
  }, [airDropSchema, activeSurveyMeta]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleReward = (reward: RewardPayload) => {
    const data = reward.data as Record<string, unknown>;
    const points = Number(data?.points ?? 0);
    setToast({ points, label: reward.title });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  };

  const handleImportAirDrop = () => {
    setAirDropError(null);
    const trimmed = airDropInput.trim();
    if (!trimmed) {
      setAirDropError('Please paste an AirDrop code or URL');
      return;
    }

    const res = qrAirDropPort.decodeManifest(trimmed);
    if (!res.success || !res.schema) {
      const urlRes = StudioShareCodec.extractFromUrl(trimmed);
      if (urlRes.success && urlRes.schema) {
        openAirDropSurvey(urlRes.schema);
        setIsAirDropModalOpen(false);
        setAirDropInput('');
        startOver();
        return;
      }
      setAirDropError(res.error || 'Failed to decode or verify AirDrop manifest');
      return;
    }

    openAirDropSurvey(res.schema);
    setIsAirDropModalOpen(false);
    setAirDropInput('');
    startOver();
  };

  const handleSubmit = async (values: Values) => {
    if (currentSchema.id === HMSAM_FORM_SCHEMA.id) {
      const report = measurementPort.score(values);
      setLastConstructs(report.constructs);
    } else {
      setLastConstructs(null);
    }

    const numericItems: Record<string, number> = {};
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === 'number' && !Number.isNaN(value)) numericItems[key] = value;
    }
    await store.addResponse(numericItems);

    // Run psychometric quality & anti-fraud audit
    const questionsMeta: QuestionMetadata[] = [];
    for (const page of currentSchema.pages) {
      for (const field of page.fields) {
        questionsMeta.push({
          id: field.id,
          name: field.name,
          type: field.type,
          construct: (field as { construct?: string }).construct,
        });
      }
    }

    const audit = psychometricAuditor.auditSubmission({
      answers: values,
      questions: questionsMeta,
    });

    let earned = 0;
    for (const page of currentSchema.pages) {
      for (const field of page.fields) {
        const value = values[field.name];
        if (value === undefined || value === null || value === '') continue;
        earned += pointsForAnswer(FEEDORA_FEATURES, field.type, value);
      }
    }

    let auditNote: string | null = null;
    if (audit.flags.includes('STRAIGHT_LINING') && audit.flags.includes('SPEEDER')) {
      auditNote = '⚠️ Quality Flag: Both straight-lining and rapid speeder pattern detected. Points withheld for review.';
      earned = 0; // Fraud protection
    } else if (audit.flags.includes('STRAIGHT_LINING')) {
      auditNote = `⚠️ Psychometric Notice: High answer uniformity detected (${Math.round(audit.metrics.longStringRatio * 100)}% identical scale items). Marked for reliability review.`;
    } else if (audit.flags.includes('SPEEDER')) {
      auditNote = `⚠️ Velocity Notice: Rapid completion speed (${audit.metrics.averageDwellMs}ms avg dwell). Flagged for research audit.`;
    }
    setAuditNotice(auditNote);

    const currentUserId = authUser?.id || 'guest-user';
    const currentName = authUser?.displayName || 'Contributor';
    const currentAvatar = authUser?.avatar || '🎙️';

    await contributionPort.recordContribution({
      userId: currentUserId,
      displayName: currentName,
      avatar: currentAvatar,
      entityId,
      formId: currentSchema.id,
      points: earned,
      isCompletion: true,
    });

    await store.recordSurveyResponse({
      entityId,
      surveyId: currentSchema.id,
      surveyTitle: currentSchema.title,
      userId: currentUserId,
      pointsEarned: earned,
      completedAt: new Date().toISOString(),
    });

    const targetUuid = activeSurveyUuid || FEEDORA_REMOTE.surveyUuid;

    if (remoteEnabled && !airDropSchema) {
      try {
        const result = await transportPort.submitResponse(targetUuid, values);
        setSyncNote(
          result.ok
            ? "Synced directly to Gihini's Django research database."
            : `Saved locally — server responded ${result.status}.`,
        );
        await authPort.init();
      } catch {
        setSyncNote('Saved locally — research server unreachable, will retry.');
      }
    } else if (airDropSchema) {
      setSyncNote('Saved to local offline SQLite storage (AirDrop peer survey).');
    } else {
      setSyncNote('Saved to this device (remote sync is off).');
    }

    notifyDataChanged();
    setTotalEarned(earned);
    setSubmitted(true);
  };

  const notifier = useMemo(() => new CollectingRewardNotifier(handleReward), []);

  const manager = useMemo(
    () =>
      new MultiStepFormManager<Values>(currentSchema, handleSubmit, {
        experience: {
          feedbackNotifier: notifier,
          progressStrategy: progressPort,
          rewardEngine: rewardPort,
        },
      }),
    [currentSchema, runKey, notifier],
  );

  const form = manager.getFormManager();
  const [formState, setFormState] = useState(() => form.getState());
  const [stepIndex, setStepIndex] = useState(() => manager.getCurrentPageIndex());
  const [progress, setProgress] = useState(() => manager.getProgress());

  useEffect(() => {
    setFormState(form.getState());
    setStepIndex(manager.getCurrentPageIndex());
    setProgress(manager.getProgress());

    const unsubscribeForm = form.subscribe(setFormState);
    const unsubscribeSteps = manager.subscribe(() => {
      setStepIndex(manager.getCurrentPageIndex());
      setProgress(manager.getProgress());
    });

    return () => {
      unsubscribeForm();
      unsubscribeSteps();
      if (toastTimer.current) clearTimeout(toastTimer.current);
      manager.destroy();
    };
  }, [form, manager]);

  const currentPage = manager.getCurrentPage();
  const visibleFields = manager.getVisibleFields(stepIndex);

  const moveForward = async () => {
    if (manager.isLastStep()) {
      await manager.submit();
    } else {
      manager.nextStep();
    }
  };

  const startOver = () => {
    setToast(null);
    setSubmitted(false);
    setTotalEarned(0);
    setLastConstructs(null);
    setSyncNote(null);
    setAuditNotice(null);
    setRunKey((k) => k + 1);
  };

  const isCover = currentPage?.role === 'cover';

  return (
    <AppPage>
      <BrandHeader
        eyebrow="HMSAM voice economy"
        title="Your voice matters"
        subtitle="Contribute to real HMSAM research, earn voice points as you go, and climb your entity's leaderboard."
      />

      <AccountBar />

      {airDropSchema && (
        <Panel style={styles.activeSurveyBanner}>
          <View style={styles.activeSurveyRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Tag tone="teal">OFFLINE AIRDROP SURVEY</Tag>
                <Tag tone="slate">CRC32 VERIFIED</Tag>
              </View>
              <Text style={styles.activeSurveyTitle}>{airDropSchema.title}</Text>
              <Text style={styles.activeSurveyDetail}>
                Peer-to-peer schema loaded · {airDropSchema.pages.reduce((acc, p) => acc + p.fields.length, 0)} Questions
              </Text>
            </View>
            <View style={{ alignSelf: 'center' }}>
              <ActionButton
                label="Exit"
                secondary
                onPress={() => {
                  resetToDefaultSurvey();
                  startOver();
                }}
              />
            </View>
          </View>
        </Panel>
      )}

      {activeSurveyMeta && !airDropSchema && (
        <Panel style={styles.activeSurveyBanner}>
          <View style={styles.activeSurveyRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Tag tone="violet">ACTIVE DJANGO SURVEY</Tag>
                {activeSurveyMeta.survey.is_hmsam && <Tag tone="slate">HMSAM</Tag>}
              </View>
              <Text style={styles.activeSurveyTitle}>{activeSurveyMeta.survey.title}</Text>
              <Text style={styles.activeSurveyDetail}>
                Code: {activeSurveyMeta.survey.access_code || activeSurveyMeta.survey.uuid.slice(0, 8)} · {activeSurveyMeta.questions.length} Questions
              </Text>
            </View>
            <View style={{ alignSelf: 'center' }}>
              <ActionButton
                label="Reset"
                secondary
                onPress={() => {
                  resetToDefaultSurvey();
                  startOver();
                }}
              />
            </View>
          </View>
        </Panel>
      )}

      {authUser?.role === 'creator' && (
        <Panel style={styles.creatorBanner}>
          <SectionHeading
            title="🔬 Form Creator Dashboard"
            detail={`Logged in as ${authUser.displayName} (${authUser.organizationName || 'Organization'}). Below is your active HMSAM research instrument. Live respondent answers update your Cronbach's α report on the Insights tab.`}
          />
        </Panel>
      )}

      {/* Entity switcher */}
      <Panel>
        <SectionHeading
          title="Contributing as"
          detail="Pick the organization whose research you're supporting."
        />
        {entities.map((entity) => (
          <EntityCard
            key={entity.id}
            entity={entity}
            memberCount={contributorCounts[entity.id] ?? 0}
            selected={entity.id === entityId}
            onSelect={() => setEntityId(entity.id)}
          />
        ))}

        <View style={styles.airDropRow}>
          <Text style={styles.airDropPrompt}>Have an offline survey manifest?</Text>
          <ActionButton label="📲 Import AirDrop" secondary onPress={() => setIsAirDropModalOpen(true)} />
        </View>

        {profile && authUser ? (
          <View style={styles.standingWrap}>
            <LevelProgress standing={profile.standing} totalPoints={profile.totalPoints} />
          </View>
        ) : profile && !authUser && profile.totalPoints > 0 ? (
          <View style={styles.guestClaimCard}>
            <View style={styles.guestClaimRow}>
              <Text style={styles.guestClaimIcon}>💎</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.guestClaimTitle}>
                  {profile.totalPoints} Unsaved Voice Points (Guest Session)
                </Text>
                <Text style={styles.guestClaimDesc}>
                  Your responses earned voice points! Sign in or register to permanently bind them to your academic profile.
                </Text>
              </View>
            </View>
            <View style={{ marginTop: 8 }}>
              <ActionButton label="Sign In to Claim Points →" onPress={openAuthModal} />
            </View>
          </View>
        ) : null}
      </Panel>

      {/* Main survey card */}
      <Panel>
        {toast ? (
          <PointsToast
            points={toast.points}
            label={toast.label}
            onDismiss={() => setToast(null)}
          />
        ) : null}

        {submitted ? (
          <View style={styles.completedBox}>
            <Text style={styles.completedEmoji}>🎉</Text>
            <Text style={styles.completedTitle}>Response recorded</Text>
            <Text style={styles.completedBody}>
              Thank you! You earned{' '}
              <Text style={{ fontWeight: '800', color: colors.ink }}>{totalEarned} voice points</Text>{' '}
              for this submission. Your responses were scored and added to this session's dataset.
            </Text>

            {syncNote ? (
              <View style={styles.syncBox}>
                <Text style={styles.syncText}>ℹ️ {syncNote}</Text>
              </View>
            ) : null}

            {auditNotice ? (
              <View style={styles.auditBox}>
                <Text style={styles.auditText}>{auditNotice}</Text>
              </View>
            ) : null}

            {lastConstructs ? (
              <View style={styles.summaryBox}>
                <Text style={styles.summaryTitle}>YOUR CONSTRUCT SCORES</Text>
                {lastConstructs.slice(0, 4).map((c) => (
                  <View key={c.constructId} style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>{c.label}</Text>
                    <Text style={styles.summaryVal}>{c.score}%</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.completedActions}>
              <ActionButton
                label="View reliability in Insights →"
                onPress={() => router.push('/dashboard')}
              />
              {activeSurveyMeta && (
                <ActionButton
                  label="Return to Default Survey (HMSAM)"
                  secondary
                  onPress={() => {
                    resetToDefaultSurvey();
                    startOver();
                  }}
                />
              )}
              <ActionButton label="Take another survey" secondary onPress={startOver} />
            </View>
          </View>
        ) : (
          <>
            <View style={styles.meterHeader}>
              <Tag tone="violet">
                {activeSurveyMeta
                  ? activeSurveyMeta.survey.is_hmsam
                    ? 'HMSAM SURVEY'
                    : 'CUSTOM SURVEY'
                  : `HMSAM · ${HMSAM_ITEM_COUNT} ITEMS`}
              </Tag>
              <Text style={styles.stepCount}>
                {stepIndex + 1} / {manager.getTotalPages()}
              </Text>
            </View>

            <StepMeter
              percent={progress.percentage}
              effortCompleted={progress.effortCompleted}
              effortTotal={progress.effortTotal}
              eta={progress.estimatedTimeRemainingText}
            />

            {currentPage?.title ? (
              <Text style={styles.pageTitle}>{currentPage.title}</Text>
            ) : null}
            {currentPage?.description ? (
              <Text style={styles.pageDesc}>{currentPage.description}</Text>
            ) : null}

            <View style={styles.fieldsContainer}>
              {visibleFields.map((field) => (
                <FieldControl
                  key={field.name}
                  field={field}
                  value={formState.values[field.name]}
                  error={formState.errors[field.name as keyof Values]}
                  readOnly={false}
                  onChange={(val) => {
                    form.setFieldValue(field.name, val);
                    manager.pruneHiddenFieldValues();
                  }}
                />
              ))}
            </View>

            <View style={styles.navRow}>
              {!isCover && stepIndex > 0 ? (
                <View style={{ flex: 1 }}>
                  <ActionButton
                    label="Back"
                    secondary
                    onPress={() => manager.prevStep()}
                  />
                </View>
              ) : null}
              <View style={{ flex: 2 }}>
                <ActionButton
                  label={manager.isLastStep() ? 'Submit response' : isCover ? 'Start survey →' : 'Next →'}
                  onPress={moveForward}
                />
              </View>
            </View>
          </>
        )}
      </Panel>

      <Modal
        visible={isAirDropModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAirDropModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📲 Import AirDrop Survey</Text>
              <Pressable onPress={() => setIsAirDropModalOpen(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.modalDesc}>
              Paste a compressed AirDrop manifest (starting with FDR1:) or a shareable link from another researcher or device.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Paste FDR1:... or https://feedora.app/#f=..."
              placeholderTextColor={colors.faint}
              value={airDropInput}
              onChangeText={setAirDropInput}
              multiline
              numberOfLines={4}
            />
            {airDropError && (
              <Text style={styles.modalErrorText}>⚠️ {airDropError}</Text>
            )}
            <View style={styles.modalBtnRow}>
              <View style={{ flex: 1 }}>
                <ActionButton label="Cancel" secondary onPress={() => setIsAirDropModalOpen(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton label="Import & Launch Offline" onPress={handleImportAirDrop} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </AppPage>
  );
}

const styles = StyleSheet.create({
  creatorBanner: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryMid,
  },
  activeSurveyBanner: {
    backgroundColor: colors.paper,
    borderColor: colors.primaryMid,
    borderWidth: 1.5,
  },
  activeSurveyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  activeSurveyTitle: {
    fontSize: 16,
    fontFamily: serifFont,
    color: colors.ink,
    marginTop: 4,
  },
  activeSurveyDetail: {
    fontSize: 11.5,
    color: colors.muted,
    fontWeight: '500',
  },
  standingWrap: { marginTop: 12, paddingTop: 14, borderTopColor: colors.line, borderTopWidth: 1 },
  meterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  stepCount: { fontSize: 11, fontWeight: '700', color: colors.faint },
  pageTitle: { fontSize: 22, fontWeight: '400', color: colors.ink, fontFamily: serifFont, marginTop: 4, marginBottom: 4 },
  pageDesc: { fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: 16 },
  fieldsContainer: { marginTop: 6 },
  navRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  completedBox: { alignItems: 'center', paddingVertical: 20, gap: 10 },
  completedEmoji: { fontSize: 48 },
  completedTitle: { fontSize: 24, fontWeight: '400', color: colors.ink, fontFamily: serifFont },
  completedBody: { fontSize: 13.5, lineHeight: 21, color: colors.muted, textAlign: 'center', maxWidth: 460 },
  syncBox: { backgroundColor: colors.canvas, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginTop: 4 },
  syncText: { fontSize: 11.5, color: colors.ink, fontWeight: '500' },
  summaryBox: { width: '100%', backgroundColor: colors.canvas, borderRadius: 10, padding: 14, marginTop: 8 },
  summaryTitle: { fontSize: 10, letterSpacing: 1, color: colors.faint, fontWeight: '800', marginBottom: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { fontSize: 12, color: colors.ink, fontWeight: '600' },
  summaryVal: { fontSize: 12, color: colors.primaryDeep, fontWeight: '800' },
  completedActions: { width: '100%', gap: 8, marginTop: 14 },
  guestClaimCard: {
    marginTop: 14,
    padding: 12,
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryMid,
    borderWidth: 1,
    borderRadius: 10,
    gap: 8,
  },
  guestClaimRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  guestClaimIcon: {
    fontSize: 22,
    marginTop: 2,
  },
  guestClaimTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  guestClaimDesc: {
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.muted,
    marginTop: 2,
  },
  auditBox: {
    backgroundColor: '#fffbeb',
    borderColor: '#f59e0b',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 4,
    width: '100%',
  },
  auditText: {
    fontSize: 11.5,
    color: '#92400e',
    fontWeight: '600',
    textAlign: 'center',
  },
  airDropRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  airDropPrompt: {
    fontSize: 12,
    color: colors.muted,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.paper,
    borderRadius: 14,
    padding: 20,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    fontFamily: serifFont,
  },
  modalCloseIcon: {
    fontSize: 18,
    color: colors.muted,
    padding: 4,
  },
  modalDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.muted,
  },
  modalInput: {
    backgroundColor: colors.canvas,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    color: colors.ink,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalErrorText: {
    fontSize: 12,
    color: colors.primaryDeep,
    fontWeight: '600',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
});
