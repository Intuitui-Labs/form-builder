import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import {
  MultiStepFormManager,
  type IFeedbackNotifierPort,
  type RewardPayload,
} from '@intuitui-labs/form-builder-engine';
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
  contributionPort,
  entities,
  measurementPort,
  notifyDataChanged,
  progressPort,
  rewardPort,
  store,
  transportPort,
  useFeedora,
} from '../feedora';
import { FEEDORA_REMOTE, remoteEnabled } from '../config';
import { pointsForAnswer } from '../domain/points';
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
  const { entityId, setEntityId, profile, contributorCounts, authUser } = useFeedora();
  const [runKey, setRunKey] = useState(0);
  const [toast, setToast] = useState<{ points: number; label: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [totalEarned, setTotalEarned] = useState(0);
  const [lastConstructs, setLastConstructs] = useState<ConstructReport[] | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleReward = (reward: RewardPayload) => {
    const data = reward.data as Record<string, unknown>;
    const points = Number(data?.points ?? 0);
    setToast({ points, label: reward.title });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  };

  const handleSubmit = async (values: Values) => {
    const report = measurementPort.score(values);
    setLastConstructs(report.constructs);

    const numericItems: Record<string, number> = {};
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === 'number' && !Number.isNaN(value)) numericItems[key] = value;
    }
    await store.addResponse(numericItems);

    // Her submit_response() total: sum per-answered-question points, no bonus.
    let earned = 0;
    for (const page of HMSAM_FORM_SCHEMA.pages) {
      for (const field of page.fields) {
        const value = values[field.name];
        if (value === undefined || value === null || value === '') continue;
        earned += pointsForAnswer(FEEDORA_FEATURES, field.type, value);
      }
    }

    const currentUserId = authUser?.id || 'guest-user';
    const currentName = authUser?.displayName || 'Contributor';
    const currentAvatar = authUser?.avatar || '🎙️';

    await contributionPort.recordContribution({
      userId: currentUserId,
      displayName: currentName,
      avatar: currentAvatar,
      entityId,
      formId: HMSAM_FORM_SCHEMA.id,
      points: earned,
      isCompletion: true,
    });
    notifyDataChanged();

    if (remoteEnabled) {
      try {
        const result = await transportPort.submitResponse(FEEDORA_REMOTE.surveyUuid, values);
        setSyncNote(
          result.ok
            ? 'Synced to the Feedora research database.'
            : `Saved locally — server responded ${result.status}.`,
        );
      } catch {
        setSyncNote('Saved locally — research server unreachable, will retry.');
      }
    } else {
      setSyncNote('Saved to this device (remote sync is off).');
    }

    setTotalEarned(earned);
    setSubmitted(true);
  };

  const notifier = useMemo(() => new CollectingRewardNotifier(handleReward), []);

  const manager = useMemo(
    () =>
      new MultiStepFormManager<Values>(HMSAM_FORM_SCHEMA, handleSubmit, {
        experience: {
          feedbackNotifier: notifier,
          progressStrategy: progressPort,
          rewardEngine: rewardPort,
        },
      }),
    [runKey, notifier],
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

        {profile ? (
          <View style={styles.standingWrap}>
            <LevelProgress standing={profile.standing} totalPoints={profile.totalPoints} />
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
              <ActionButton label="Take another survey" secondary onPress={startOver} />
            </View>
          </View>
        ) : (
          <>
            <View style={styles.meterHeader}>
              <Tag tone="violet">HMSAM · {HMSAM_ITEM_COUNT} ITEMS</Tag>
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
    </AppPage>
  );
}

const styles = StyleSheet.create({
  creatorBanner: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryMid,
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
});
