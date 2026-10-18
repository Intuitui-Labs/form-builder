import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
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
import { colors, radii, serifFont } from '../theme';
import type { ConstructReport } from '../domain/ports/measurementTypes';
import { FEEDORA_BADGES, type BadgeDefinition } from '../domain/types';

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
    entitiesList,
    joinEntity,
    profile,
    contributorCounts,
    authUser,
    activeSurveyUuid,
    activeSurveyMeta,
    airDropSchema,
    openSurvey,
    openSurveyByCode,
    openAirDropSurvey,
    resetToDefaultSurvey,
    openAuthModal,
    outboxPort,
  } = useFeedora();
  const [runKey, setRunKey] = useState(0);
  const [toast, setToast] = useState<{ points: number; label: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [totalEarned, setTotalEarned] = useState(0);
  const [lastConstructs, setLastConstructs] = useState<ConstructReport[] | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [auditNotice, setAuditNotice] = useState<string | null>(null);
  const [unlockedBadge, setUnlockedBadge] = useState<BadgeDefinition | null>(null);
  const [voucherCopied, setVoucherCopied] = useState(false);

  // Institution Selector & Research Arm State (Defects 1 & 15 UX)
  const [isInstitutionPickerOpen, setIsInstitutionPickerOpen] = useState(false);
  const [consented, setConsented] = useState(true);
  const [researchArm, setResearchArm] = useState<'gamified' | 'control'>('gamified');
  const surveyStartTimeRef = useRef(Date.now());

  const experimentVariant = activeSurveyMeta?.experiment?.variant ?? researchArm;
  const isGamified = experimentVariant === 'gamified';

  // AirDrop / QR Import Modal State
  const [isAirDropModalOpen, setIsAirDropModalOpen] = useState(false);
  const [airDropInput, setAirDropInput] = useState('');
  const [airDropError, setAirDropError] = useState<string | null>(null);
  const [importingLoading, setImportingLoading] = useState(false);

  // Universal Link & QR Deep Linking Auto-Loader
  const params = useLocalSearchParams<{ code?: string; survey?: string }>();
  useEffect(() => {
    if (params.code) {
      openSurveyByCode(params.code).catch(() => {});
    } else if (params.survey) {
      openSurvey(params.survey).catch(() => {});
    }
  }, [params.code, params.survey]);

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
    if (!isGamified) return;
    const data = reward.data as Record<string, unknown>;
    const points = Number(data?.points ?? 0);
    setToast({ points, label: reward.title });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  };

  const handleImportAirDrop = async () => {
    setAirDropError(null);
    const trimmed = airDropInput.trim();
    if (!trimmed) {
      setAirDropError('Please enter an access code, URL, or offline manifest.');
      return;
    }

    // 1. Try QR AirDrop Manifest (FDR1:...)
    const res = qrAirDropPort.decodeManifest(trimmed);
    if (res.success && res.schema) {
      openAirDropSurvey(res.schema);
      setIsAirDropModalOpen(false);
      setAirDropInput('');
      startOver();
      return;
    }

    // 2. Try Studio Share URL or Code
    const urlRes = StudioShareCodec.extractFromUrl(trimmed);
    if (urlRes.success && urlRes.schema) {
      openAirDropSurvey(urlRes.schema);
      setIsAirDropModalOpen(false);
      setAirDropInput('');
      startOver();
      return;
    }

    // 3. Try Remote Access Code or URL with ?code= or ?survey=
    let codeOrUuid = trimmed;
    try {
      if (trimmed.includes('?')) {
        const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `http://localhost/${trimmed}`);
        const codeParam = urlObj.searchParams.get('code');
        const surveyParam = urlObj.searchParams.get('survey');
        if (codeParam) codeOrUuid = codeParam;
        else if (surveyParam) codeOrUuid = surveyParam;
      }
    } catch {
      // Ignore URL parsing errors, use trimmed
    }

    // Check if it's a UUID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(codeOrUuid)) {
      setImportingLoading(true);
      try {
        await openSurvey(codeOrUuid);
        setIsAirDropModalOpen(false);
        setAirDropInput('');
        startOver();
        return;
      } catch (err) {
        setAirDropError(`Survey lookup failed: ${(err as Error).message}`);
        return;
      } finally {
        setImportingLoading(false);
      }
    }

    // Check if it's an access code (e.g. 4 to 10 alphanumeric characters)
    if (/^[A-Za-z0-9]{4,10}$/.test(codeOrUuid)) {
      setImportingLoading(true);
      try {
        await openSurveyByCode(codeOrUuid);
        setIsAirDropModalOpen(false);
        setAirDropInput('');
        startOver();
        return;
      } catch (err) {
        setAirDropError(`Code lookup failed: ${(err as Error).message}`);
        return;
      } finally {
        setImportingLoading(false);
      }
    }

    setAirDropError(res.error || 'Failed to decode manifest or recognize access code.');
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
    if (isGamified) {
      for (const page of currentSchema.pages) {
        for (const field of page.fields) {
          const value = values[field.name];
          if (value === undefined || value === null || value === '') continue;
          earned += pointsForAnswer(FEEDORA_FEATURES, field.type, value);
        }
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

    const prevCompleted = profile?.surveysCompleted ?? 0;
    const recordedProfile = await contributionPort.recordContribution({
      userId: currentUserId,
      displayName: currentName,
      avatar: currentAvatar,
      entityId,
      formId: currentSchema.id,
      points: earned,
      isCompletion: true,
    });
    const newCompleted = recordedProfile.surveysCompleted;
    const newlyUnlocked = isGamified
      ? (FEEDORA_BADGES.find(
          (b) => prevCompleted < b.minResponses && newCompleted >= b.minResponses,
        ) || null)
      : null;
    setUnlockedBadge(newlyUnlocked);

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
        const durationMs = Date.now() - surveyStartTimeRef.current;
        const result = await transportPort.submitResponse(targetUuid, values, {
          variant: experimentVariant,
          platform: 'mobile',
          durationMs,
          dwellMs: audit.metrics ? { avgDwellMs: audit.metrics.averageDwellMs } : {},
          qualityFlags: audit.flags,
          consentVersion: '1.0',
        });
        if (result.ok) {
          let note = "Synced directly to Gihini's Django research database.";
          if (result.variableBonus && result.variableBonus > 0) {
            note += ` (${result.bonusLabel ?? '🎲 Surprise Insight Boost!'} +${result.variableBonus} pts)`;
          }
          if (result.negativeReinforcement?.enabled && result.negativeReinforcement.perk_description) {
            note += ` · ${result.negativeReinforcement.perk_description}`;
          }
          setSyncNote(note);
        } else {
          await outboxPort.enqueue({
            id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            formId: targetUuid,
            values: values as Record<string, unknown>,
            submittedAt: new Date().toISOString(),
            retryCount: 0,
            experimentMetadata: {
              experimentKey: 'hmsam-gamification-study',
              variantId: experimentVariant,
            },
          });
          setSyncNote(`Saved to resilient offline outbox (server HTTP ${result.status}) — will auto-sync upon reconnection.`);
        }
        await authPort.init();
      } catch {
        await outboxPort.enqueue({
          id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          formId: targetUuid,
          values: values as Record<string, unknown>,
          submittedAt: new Date().toISOString(),
          retryCount: 0,
          experimentMetadata: {
            experimentKey: 'hmsam-gamification-study',
            variantId: experimentVariant,
          },
        });
        setSyncNote('Saved to resilient offline outbox — research server unreachable, will auto-sync upon reconnection.');
      }
    } else if (airDropSchema) {
      setSyncNote('Saved to local offline SQLite storage (AirDrop peer survey).');
    } else {
      setSyncNote('Saved to this device (remote sync is off).');
    }

    notifyDataChanged();
    setTotalEarned(earned);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
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
      LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
      await manager.submit();
    } else {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      manager.nextStep();
    }
  };

  const startOver = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setToast(null);
    setSubmitted(false);
    setTotalEarned(0);
    setLastConstructs(null);
    setSyncNote(null);
    setAuditNotice(null);
    setUnlockedBadge(null);
    setVoucherCopied(false);
    surveyStartTimeRef.current = Date.now();
    setRunKey((k) => k + 1);
  };

  const isCover = currentPage?.role === 'cover';
  const allEntities = entitiesList || entities;
  const currentEntity = allEntities.find((e) => e.id === entityId) || allEntities[0];

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
                <Tag tone={isGamified ? 'teal' : 'slate'}>ARM: {experimentVariant.toUpperCase()}</Tag>
                {activeSurveyMeta.features?.rewards?.mode === 'variable' && (
                  <Tag tone="gold">🎲 VARIABLE</Tag>
                )}
                {activeSurveyMeta.features?.negative_reinforcement?.enabled && (
                  <Tag tone="teal">🛡️ RANK SHIELD</Tag>
                )}
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

      {/* Spacious Active Institution & Research Identity Banner */}
      <Panel style={styles.institutionBannerPanel}>
        <View style={styles.activeInstitutionRow}>
          <Text style={styles.institutionEmoji}>
            {currentEntity?.type === 'university' ? '🏛️' : currentEntity?.type === 'research' ? '🔬' : '🏢'}
          </Text>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.institutionEyebrow}>CONTRIBUTING AS</Text>
              <Tag tone="teal">PARTNER LAB</Tag>
            </View>
            <Text style={styles.institutionName}>{currentEntity?.name || 'University of Moratuwa'}</Text>
            <Text style={styles.institutionDetail}>
              {contributorCounts[entityId] ?? 0} active members · {currentEntity?.tagline || currentEntity?.country || 'Academic Partner'}
            </Text>
          </View>
          <Pressable
            style={styles.switchInstitutionBtn}
            onPress={() => setIsInstitutionPickerOpen((v) => !v)}
          >
            <Text style={styles.switchInstitutionText}>
              {isInstitutionPickerOpen ? 'Done ▲' : 'Change ▾'}
            </Text>
          </Pressable>
        </View>

        {/* Collapsible Institution Selector */}
        {isInstitutionPickerOpen && (
          <View style={styles.institutionPickerAccordion}>
            <Text style={styles.pickerSectionHeader}>SELECT RESEARCH INSTITUTION</Text>
            {allEntities.map((entity) => (
              <EntityCard
                key={entity.id}
                entity={entity}
                memberCount={contributorCounts[entity.id] ?? 0}
                selected={entity.id === entityId}
                onSelect={() => {
                  joinEntity(entity.id);
                  setIsInstitutionPickerOpen(false);
                }}
              />
            ))}
          </View>
        )}

        <View style={styles.scanCodeCard}>
          <View style={styles.scanCodeHeader}>
            <Text style={styles.scanCodeIcon}>📲</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.scanCodeTitle}>Join Study by QR or Code</Text>
              <Text style={styles.scanCodeSub}>
                Scan a researcher's QR code or enter a 6-character access code (e.g. HMSAM1)
              </Text>
            </View>
          </View>
          <Pressable
            style={styles.scanCodeBtn}
            onPress={() => setIsAirDropModalOpen(true)}
          >
            <Text style={styles.scanCodeBtnText}>📲 Open Code & Link Scanner</Text>
          </Pressable>
        </View>

        {isGamified && profile && authUser ? (
          <View style={styles.standingWrap}>
            <LevelProgress standing={profile.standing} totalPoints={profile.totalPoints} />
          </View>
        ) : isGamified && profile && !authUser && profile.totalPoints > 0 ? (
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

      {/* Academic Ethics / Participant Consent (Task 3.5 in Agent Brief) */}
      {!consented && !submitted && (
        <Panel style={styles.consentPanel}>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Tag tone="violet">ETHICS PROTOCOL · V1.0</Tag>
              <Tag tone="slate">ANONYMOUS</Tag>
            </View>
            <Text style={styles.consentTitle}>HMSAM Study Participant Consent</Text>
            <Text style={styles.consentDesc}>
              You are invited to contribute data to our empirical study on hedonic-motivation systems. All responses are cryptographically pseudonymized, completely voluntary, and stored securely under academic research guidelines.
            </Text>
            <View style={{ marginTop: 8 }}>
              <ActionButton
                label="✓ I Agree & Begin Survey"
                onPress={() => setConsented(true)}
              />
            </View>
          </View>
        </Panel>
      )}

      {/* Main survey card */}
      <Panel>
        {isGamified && toast ? (
          <PointsToast
            points={toast.points}
            label={toast.label}
            onDismiss={() => setToast(null)}
          />
        ) : null}

        {submitted ? (
          <View style={styles.completedBox}>
            {!isGamified ? (
              <View style={styles.academicSuccessCard}>
                <Text style={styles.academicSuccessIcon}>🎓</Text>
                <Text style={styles.completedTitle}>Response Recorded (Control Arm)</Text>
                <Text style={styles.completedBody}>
                  Thank you! Your survey responses have been cryptographically pseudonymized and submitted to the HMSAM research study database.
                </Text>
              </View>
            ) : (
              <>
                {activeSurveyMeta?.features?.mascot?.enabled ? (
                  <View style={styles.mascotWrap}>
                    <Text style={styles.mascotAvatar}>🐱</Text>
                    <View style={styles.mascotBubble}>
                      <Text style={styles.mascotBubbleText}>
                        Thank you for your co-operation! Have a nice day! 🌟
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.completedEmoji}>🎉</Text>
                )}

                <Text style={styles.completedTitle}>Response recorded</Text>
                <Text style={styles.completedBody}>
                  Thank you! You earned{' '}
                  <Text style={{ fontWeight: '800', color: colors.ink }}>{totalEarned} voice points</Text>{' '}
                  for this submission. Your responses were scored and added to this session's dataset.
                </Text>

                {unlockedBadge ? (
                  <View style={styles.badgeUnlockCard}>
                    <Text style={styles.badgeUnlockIcon}>{unlockedBadge.icon}</Text>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.badgeUnlockTitle}>
                        🎉 New Badge Unlocked: {unlockedBadge.label} Contributor!
                      </Text>
                      <Text style={styles.badgeUnlockRule}>{unlockedBadge.rule}</Text>
                    </View>
                  </View>
                ) : null}

                {Boolean(activeSurveyMeta?.features?.voucher?.enabled && activeSurveyMeta?.features?.voucher?.code) && (
                  <View style={styles.voucherCard}>
                    <Text style={styles.voucherHeading}>🎁 SURVEY REWARD VOUCHER</Text>
                    <Text style={styles.voucherSub}>Here's your reward voucher!:</Text>
                    <Text style={styles.voucherCode}>{String(activeSurveyMeta?.features?.voucher?.code || '')}</Text>
                    {activeSurveyMeta?.features?.voucher?.discount ? (
                      <Text style={styles.voucherDiscount}>
                        {String(activeSurveyMeta.features.voucher.discount)}% discount
                      </Text>
                    ) : null}
                    <Pressable
                      style={styles.voucherCopyBtn}
                      onPress={() => {
                        const code = String(activeSurveyMeta?.features?.voucher?.code || '');
                        try {
                          if (typeof navigator !== 'undefined' && navigator.clipboard) {
                            navigator.clipboard.writeText(code);
                          }
                        } catch {}
                        setVoucherCopied(true);
                        setTimeout(() => setVoucherCopied(false), 2500);
                      }}
                    >
                      <Text style={styles.voucherCopyText}>
                        {voucherCopied ? '✓ Copied to clipboard!' : 'Copy voucher code'}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}

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
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>📲 Scan or Enter Survey Code</Text>
                <Text style={styles.modalSub}>Universal Android & iOS Optical Scanner</Text>
              </View>
              <Pressable onPress={() => setIsAirDropModalOpen(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.modalDesc}>
              Enter a 6-character access code (e.g. <Text style={{ fontWeight: '800', color: colors.ink }}>HMSAM1</Text>), paste a survey link, or import an <Text style={{ fontWeight: '800', color: colors.ink }}>FDR1:...</Text> offline manifest.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. HMSAM1, https://..., or FDR1:..."
              placeholderTextColor={colors.faint}
              value={airDropInput}
              onChangeText={setAirDropInput}
              multiline
              numberOfLines={3}
              autoCapitalize="characters"
            />
            {airDropError && (
              <Text style={styles.modalErrorText}>⚠️ {airDropError}</Text>
            )}
            <View style={styles.modalBtnRow}>
              <View style={{ flex: 1 }}>
                <ActionButton label="Cancel" secondary onPress={() => setIsAirDropModalOpen(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton
                  label={importingLoading ? 'Loading…' : 'Load & Launch 🚀'}
                  onPress={handleImportAirDrop}
                  disabled={importingLoading}
                />
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
  modalSub: {
    fontSize: 11.5,
    color: colors.muted,
    marginTop: 2,
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
  mascotWrap: {
    alignItems: 'center',
    marginVertical: 10,
    gap: 6,
  },
  mascotAvatar: {
    fontSize: 48,
  },
  mascotBubble: {
    backgroundColor: '#FAF5FF',
    borderColor: '#7A4FA8',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: 320,
    shadowColor: '#7A4FA8',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  mascotBubbleText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1A1A2E',
    textAlign: 'center',
    lineHeight: 19,
  },
  badgeUnlockCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  badgeUnlockIcon: {
    fontSize: 32,
  },
  badgeUnlockTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#92400E',
  },
  badgeUnlockRule: {
    fontSize: 11.5,
    color: '#B45309',
    marginTop: 2,
  },
  voucherCard: {
    backgroundColor: '#FAF5FF',
    borderColor: '#D8D4F0',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  voucherHeading: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#7A4FA8',
    textTransform: 'uppercase',
  },
  voucherSub: {
    fontSize: 12,
    color: colors.muted,
  },
  voucherCode: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 3,
    color: '#7A4FA8',
    marginVertical: 4,
    fontFamily: serifFont,
  },
  voucherDiscount: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  voucherCopyBtn: {
    marginTop: 6,
    backgroundColor: '#7A4FA8',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  voucherCopyText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  institutionBannerPanel: {
    padding: 16,
  },
  activeInstitutionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  institutionEmoji: {
    fontSize: 32,
  },
  institutionEyebrow: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.faint,
    letterSpacing: 0.8,
  },
  institutionName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
    fontFamily: serifFont,
  },
  institutionDetail: {
    fontSize: 11,
    color: colors.muted,
  },
  switchInstitutionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.slateSoft,
    borderRadius: radii.small,
  },
  switchInstitutionText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  institutionPickerAccordion: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 6,
  },
  pickerSectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.faint,
    marginBottom: 4,
  },
  scanCodeCard: {
    backgroundColor: '#FAF5FF',
    borderWidth: 1.5,
    borderColor: '#E9D5FF',
    borderRadius: radii.medium,
    padding: 14,
    marginTop: 14,
    gap: 12,
  },
  scanCodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scanCodeIcon: {
    fontSize: 26,
  },
  scanCodeTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.ink,
  },
  scanCodeSub: {
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.muted,
  },
  scanCodeBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.small,
    paddingVertical: 10,
    alignItems: 'center',
  },
  scanCodeBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  consentPanel: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
    borderWidth: 1.5,
  },
  consentTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#6B21A8',
    fontFamily: serifFont,
  },
  consentDesc: {
    fontSize: 12,
    lineHeight: 18,
    color: '#581C87',
  },
  academicSuccessCard: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  academicSuccessIcon: {
    fontSize: 44,
  },
});
