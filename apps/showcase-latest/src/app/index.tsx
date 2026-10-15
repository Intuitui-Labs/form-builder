import { useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet, TextInput, Pressable, Modal, ActivityIndicator } from 'react-native';
import {
  MultiStepFormManager,
  type FormState,
  type BranchSwitchImpact,
} from '@intuitui-labs/form-builder-engine';
import {
  WebSpeechAdapter,
  SimulatedNetworkAdapter,
  SimulatedBatteryAdapter,
} from '@intuitui-labs/form-builder-engine/adapters';
import {
  SearchGroundedFormCompiler,
  type GroundedCompilationResult,
} from '@intuitui-labs/form-builder-engine/ai';
import {
  ActionButton,
  AppPage,
  AutofillToolbar,
  BrandHeader,
  CoverPageCard,
  DomainPicker,
  FieldControl,
  Panel,
  PeekNoticeBar,
  ProgressSteps,
  SectionHeading,
  Tag,
} from '../components/EngineUi';
import { SHOWCASE_CATALOG, type Values } from '../forms';
import { colors, radii } from '../theme';

const AI_STUDIO_PRESETS = [
  { label: 'SB 1047 AI Safety', prompt: 'California SB 1047 & Frontier AI Safety Intake' },
  { label: 'HIPAA Telehealth', prompt: 'Clinical HIPAA Patient Intake with Telehealth Consent' },
  { label: 'EV Fleet Carbon', prompt: 'Commercial EV Fleet Electrification & Low Carbon Fuel Standard' },
  { label: 'Cloud Zero-Trust', prompt: 'FedRAMP High Baseline Cloud Security & Zero-Trust Certification' },
];

const GHOST_SAMPLE_TEXTS = [
  {
    label: 'AI Frontier Lab Note',
    text: 'Applicant Dr. Alex Morgan, reachable at alex.morgan@frontier-safety.org or (415) 890-4321. Headquartered at 500 Howard Street, Suite 400, San Francisco CA 94105. System compute capacity is 150000 FLOPS with enterprise governance tier.',
  },
  {
    label: 'HIPAA Patient Note',
    text: 'Patient: Eleanor Vance. Primary contact: eleanor.vance@soundcare.org, tel: (617) 555-0199. Address: 742 Evergreen Terrace, Boston, MA 02108, United States.',
  },
  {
    label: 'EV Commercial Fleet',
    text: 'Fleet Operator: Marcus Vance Taylor (m.taylor@greenlogistics.io, 512-555-0143). Operating out of 100 Silicon Vista Blvd, Austin, TX 78701. Target delivery: 45 commercial electric delivery vans.',
  },
];

export default function BuilderScreen() {
  const [selectedFormId, setSelectedFormId] = useState<string>('launch-readiness');
  const [receipt, setReceipt] = useState<{ formId: string; values: Values } | null>(null);

  // AI Scaffolder Studio State
  const [aiPrompt, setAiPrompt] = useState('California SB 1047 & Frontier AI Safety Intake');
  const [customStudioResult, setCustomStudioResult] = useState<GroundedCompilationResult | null>(null);

  // Hexagonal Adapters
  const speechAdapter = useMemo(() => new WebSpeechAdapter(), []);
  const networkAdapter = useMemo(() => new SimulatedNetworkAdapter(true), []);
  const batteryAdapter = useMemo(
    () => new SimulatedBatteryAdapter({ initialLevel: 0.85, initialCharging: true, initialLowPowerMode: false }),
    [],
  );

  const [isOnline, setIsOnline] = useState(true);
  const [batteryLevel, setBatteryLevel] = useState(0.85);
  const [isCharging, setIsCharging] = useState(true);
  const [isLowPowerMode, setIsLowPowerMode] = useState(false);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isFlushingOutbox, setIsFlushingOutbox] = useState(false);

  // Ghost Form Ingestion State
  const [isGhostModalOpen, setIsGhostModalOpen] = useState(false);
  const [ghostInputText, setGhostInputText] = useState(GHOST_SAMPLE_TEXTS[0]!.text);
  const [ghostRollback, setGhostRollback] = useState<(() => void) | null>(null);
  const [ghostBannerMsg, setGhostBannerMsg] = useState<string | null>(null);
  const [isExtractingGhost, setIsExtractingGhost] = useState(false);

  const currentMeta = useMemo(
    () => SHOWCASE_CATALOG.find((item) => item.id === selectedFormId) ?? SHOWCASE_CATALOG[0]!,
    [selectedFormId],
  );

  const activeSchema = useMemo(() => {
    if (selectedFormId === 'ai-studio' && customStudioResult) {
      return customStudioResult.schema;
    }
    return currentMeta.schema;
  }, [selectedFormId, customStudioResult, currentMeta.schema]);

  const manager = useMemo(
    () =>
      new MultiStepFormManager<Values>(
        activeSchema,
        async (values) => {
          await new Promise((resolve) => setTimeout(resolve, 450));
          setReceipt({ formId: currentMeta.id, values });
        },
        {
          resilience: {
            networkStatus: networkAdapter,
            batteryStatus: batteryAdapter,
            enableOutbox: true,
          },
          experience: {
            speechSynthesis: speechAdapter,
          },
        },
      ),
    [activeSchema, currentMeta.id, networkAdapter, batteryAdapter, speechAdapter],
  );

  const form = manager.getFormManager();
  const [formState, setFormState] = useState<FormState<Values>>(() => form.getState());
  const [stepIndex, setStepIndex] = useState(() => manager.getCurrentPageIndex());
  const [isPeeking, setIsPeeking] = useState(() => manager.isPeeking());
  const [inspectedIndex, setInspectedIndex] = useState(() => manager.getInspectedPageIndex());

  const [confirmWarning, setConfirmWarning] = useState<BranchSwitchImpact | null>(null);

  useEffect(() => {
    setFormState(form.getState());
    setStepIndex(manager.getCurrentPageIndex());
    setIsPeeking(manager.isPeeking());
    setInspectedIndex(manager.getInspectedPageIndex());
    setIsOnline(networkAdapter.isOnline());
    setPendingOutboxCount(manager.getPendingOutboxCount());
    setReceipt(null);
    setConfirmWarning(null);

    const unsubscribeForm = form.subscribe(setFormState);
    const unsubscribeSteps = manager.subscribe((current) => {
      setStepIndex(current.getCurrentPageIndex());
      setIsPeeking(current.isPeeking());
      setInspectedIndex(current.getInspectedPageIndex());
      setIsOnline(current.isOnline());
      setPendingOutboxCount(current.getPendingOutboxCount());
      setIsSpeaking(current.isSpeaking());
    });

    const unsubscribeNet = networkAdapter.subscribe((online: boolean) => {
      setIsOnline(online);
    });

    return () => {
      unsubscribeForm();
      unsubscribeSteps();
      unsubscribeNet();
      manager.stopSpeaking();
      manager.destroy();
    };
  }, [form, manager, networkAdapter]);

  const branchImpact = useMemo(() => {
    if (!isPeeking) return null;
    return manager.explainPeekStep(inspectedIndex);
  }, [isPeeking, inspectedIndex, formState.values, manager]);

  const handleSwitchBranch = () => {
    if (!branchImpact) return;
    if (branchImpact.hasDataLoss) {
      setConfirmWarning(branchImpact);
    } else {
      manager.confirmBranchSwitch(inspectedIndex, { autoSatisfyPrerequisites: true });
    }
  };

  const handleToggleSpeak = () => {
    if (manager.isSpeaking()) {
      manager.stopSpeaking();
      setIsSpeaking(false);
    } else {
      manager.speakPeekExplanation(inspectedIndex);
      setIsSpeaking(true);
    }
  };

  const handleToggleNetwork = () => {
    networkAdapter.toggle();
  };

  const toggleBatteryCondition = () => {
    if (batteryLevel > 0.15) {
      // Drop to 12% discharging (triggers critical power conservation)
      batteryAdapter.setBatteryStatus({ level: 0.12, charging: false, lowPowerMode: false });
      setBatteryLevel(0.12);
      setIsCharging(false);
      setIsLowPowerMode(false);
    } else {
      // Restore to 85% AC charging
      batteryAdapter.setBatteryStatus({ level: 0.85, charging: true, lowPowerMode: false });
      setBatteryLevel(0.85);
      setIsCharging(true);
      setIsLowPowerMode(false);
    }
  };

  const isBatteryThrottled = !isCharging && (batteryLevel <= 0.15 || isLowPowerMode);

  const handleFlushOutbox = async (force = false) => {
    setIsFlushingOutbox(true);
    try {
      await manager.flushOutbox(force);
      setPendingOutboxCount(manager.getPendingOutboxCount());
    } finally {
      setIsFlushingOutbox(false);
    }
  };

  const handleApplyGhost = async () => {
    if (!ghostInputText.trim()) return;
    setIsExtractingGhost(true);
    try {
      const result = await manager.enrichFromFreeformText(ghostInputText, {
        overwritePolicy: 'preserve-user-edits',
      });
      if (result.appliedCount > 0) {
        setGhostRollback(() => () => {
          result.rollback();
          manager.pruneHiddenFieldValues();
        });
        setGhostBannerMsg(
          `Extracted & mapped ${result.appliedCount} field(s) (${result.appliedFields.join(', ')}). ${
            result.skippedFields.length > 0
              ? `${result.skippedFields.length} user-edited field(s) preserved.`
              : ''
          }`,
        );
        setIsGhostModalOpen(false);
      } else {
        setGhostBannerMsg('No matching fields detected in the unstructured snippet.');
      }
    } catch (err: any) {
      setGhostBannerMsg(`Extraction failed: ${err.message || String(err)}`);
    } finally {
      setIsExtractingGhost(false);
    }
  };

  const handleSynthesizePrompt = (promptText: string = aiPrompt) => {
    const result = SearchGroundedFormCompiler.compileFromPrompt(promptText);
    setCustomStudioResult(result);
    setReceipt(null);
    setConfirmWarning(null);
  };

  const stepNames = activeSchema.pages.map((p) => p.title ?? 'Step');
  const inspectedPage = manager.getInspectedPage();
  const visibleFields = manager.getVisibleFields(inspectedIndex);

  const loadSample = () => {
    Object.entries(currentMeta.samples).forEach(([name, value]) => {
      form.setFieldValue(name, value);
    });
    manager.pruneHiddenFieldValues();
  };

  const handleAutofillAddress = () => {
    form.enrichFromAddress({
      addressLine1: '100 Silicon Vista Blvd',
      city: 'Austin',
      stateOrProvince: 'TX',
      postalCode: '78701',
      country: 'United States',
    });
    manager.pruneHiddenFieldValues();
  };

  const handleAutofillContact = () => {
    form.enrichFromContact({
      name: 'Jordan Vance Taylor',
      email: 'jordan.taylor@quantumlabs.dev',
      tel: '+1 (555) 839-2041',
      address: {
        addressLine: ['100 Silicon Vista Blvd'],
        city: 'Austin',
        region: 'TX',
        postalCode: '78701',
      },
    });
    manager.pruneHiddenFieldValues();
  };

  const moveForward = async () => {
    if (isPeeking) {
      manager.stopSpeaking();
      setIsSpeaking(false);
      manager.stopPeeking();
      return;
    }
    if (manager.isLastStep()) {
      await manager.submit();
      setPendingOutboxCount(manager.getPendingOutboxCount());
    } else {
      manager.nextStep();
    }
  };

  const startOver = () => {
    form.reset();
    manager.goToStep(0);
    manager.stopPeeking();
    manager.stopSpeaking();
    setIsSpeaking(false);
    setReceipt(null);
  };

  const handleDomainSelect = (id: string) => {
    if (id !== selectedFormId) {
      manager.stopSpeaking();
      setIsSpeaking(false);
      setSelectedFormId(id);
      setReceipt(null);
    }
  };

  return (
    <AppPage>
      <BrandHeader
        eyebrow="Multi-Domain Form Engine Showcase"
        title="Schema-Driven Native Forms"
        subtitle="Experience diverse domain forms testing rich-text markdown, dynamic visibleIf conditions, branching jumpRules, speech synthesis, and offline-first DLQ outbox."
      />

      {/* Resilience Offline & DLQ Status Strip */}
      <View style={styles.resilienceStrip}>
        <View style={styles.resilienceStatusCol}>
          <View style={styles.resilienceStatus}>
            <View style={[styles.networkDot, isOnline ? styles.networkDotOnline : styles.networkDotOffline]} />
            <Text style={styles.networkStatusText}>
              {isOnline ? 'DIRECT NETWORK (Online)' : 'OFFLINE MODE (Enqueuing to DLQ)'}
            </Text>
          </View>
          <View style={styles.batteryStatusRow}>
            <View
              style={[
                styles.batteryDot,
                isBatteryThrottled
                  ? styles.batteryDotThrottled
                  : isCharging
                  ? styles.batteryDotCharging
                  : styles.batteryDotNormal,
              ]}
            />
            <Text
              style={[
                styles.batteryStatusText,
                isBatteryThrottled ? styles.batteryStatusTextThrottled : null,
              ]}
            >
              {isCharging ? '⚡' : '🔋'} {Math.round(batteryLevel * 100)}%{' '}
              {isCharging
                ? 'AC Power'
                : isBatteryThrottled
                ? 'CRITICAL (Outbox Paused)'
                : 'Discharging'}
            </Text>
          </View>
        </View>

        <View style={styles.resilienceActions}>
          <Pressable
            accessibilityRole="button"
            onPress={handleToggleNetwork}
            style={[styles.resilienceBtn, !isOnline ? styles.resilienceBtnActive : null]}
          >
            <Text style={styles.resilienceBtnText}>
              {isOnline ? '📡 Simulate Offline' : '🟢 Go Online'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={toggleBatteryCondition}
            style={[styles.resilienceBtn, isBatteryThrottled ? styles.resilienceBtnThrottled : null]}
          >
            <Text style={styles.resilienceBtnText}>
              {batteryLevel <= 0.15 ? '🔋 Restore 85%' : '🪫 Simulate 12%'}
            </Text>
          </Pressable>

          {pendingOutboxCount > 0 ? (
            <View style={styles.outboxButtonCluster}>
              <Pressable
                accessibilityRole="button"
                onPress={() => handleFlushOutbox(false)}
                disabled={isFlushingOutbox || !isOnline || isBatteryThrottled}
                style={[
                  styles.drainBtn,
                  (!isOnline || isBatteryThrottled) ? styles.drainBtnDisabled : null,
                ]}
              >
                <Text style={styles.drainBtnText}>
                  {isFlushingOutbox ? '⚡ Draining…' : `⚡ Drain (${pendingOutboxCount})`}
                </Text>
              </Pressable>

              {isBatteryThrottled && isOnline ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleFlushOutbox(true)}
                  disabled={isFlushingOutbox}
                  style={styles.forceSyncBtn}
                >
                  <Text style={styles.forceSyncBtnText}>⚡ Force Sync</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      <DomainPicker
        domains={SHOWCASE_CATALOG}
        selectedId={selectedFormId}
        onSelect={handleDomainSelect}
      />

      {/* AI Scaffolder Studio Interactive Bar */}
      {selectedFormId === 'ai-studio' ? (
        <View style={styles.aiStudioCard}>
          <View style={styles.aiStudioHeader}>
            <Text style={styles.aiStudioTitle}>✨ Real-Time Search-Grounded AI Compiler</Text>
            <Tag tone="teal">2026 GROUNDED</Tag>
          </View>
          <Text style={styles.aiStudioSubtitle}>
            Type any statutory, technical, or regulatory prompt to synthesize multi-step forms with dynamic cognitive chunking and assessment gauges:
          </Text>

          <View style={styles.promptInputRow}>
            <TextInput
              style={styles.promptInput}
              value={aiPrompt}
              onChangeText={setAiPrompt}
              placeholder="e.g. California SB 1047 AI Safety Assessment"
              placeholderTextColor={colors.muted}
            />
            <Pressable
              accessibilityRole="button"
              style={styles.synthesizeBtn}
              onPress={() => handleSynthesizePrompt(aiPrompt)}
            >
              <Text style={styles.synthesizeBtnText}>✨ Synthesize</Text>
            </Pressable>
          </View>

          <View style={styles.presetRow}>
            <Text style={styles.presetLabel}>Presets:</Text>
            {AI_STUDIO_PRESETS.map((p) => (
              <Pressable
                key={p.label}
                accessibilityRole="button"
                style={[styles.presetChip, aiPrompt === p.prompt ? styles.presetChipActive : null]}
                onPress={() => {
                  setAiPrompt(p.prompt);
                  handleSynthesizePrompt(p.prompt);
                }}
              >
                <Text style={[styles.presetChipText, aiPrompt === p.prompt ? styles.presetChipTextActive : null]}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {customStudioResult ? (
            <View style={styles.groundingMeta}>
              <Text style={styles.groundingMetaTitle}>Grounding Lineage:</Text>
              <Text style={styles.groundingMetaText}>
                Topic: <Text style={{ fontWeight: '700' }}>{customStudioResult.grounding.topic}</Text> · Anchor: {customStudioResult.grounding.temporalAnchor} · {customStudioResult.grounding.fieldsCount} Fields across {customStudioResult.grounding.pagesCount} Steps · Gauges: {customStudioResult.grounding.hasAssessmentGauge ? 'Active' : 'None'}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <Panel>
        <View style={styles.topLine}>
          <View style={styles.topBadgeGroup}>
            <Tag tone="violet">{currentMeta.domain.toUpperCase()}</Tag>
            <Tag tone="teal">{currentMeta.badge.toUpperCase()}</Tag>
          </View>
          <View style={styles.topActions}>
            <ActionButton label="Fill sample" secondary compact onPress={loadSample} />
          </View>
        </View>

        <View style={styles.domainIntro}>
          <Text style={styles.domainHeadline}>{currentMeta.icon} {currentMeta.headline}</Text>
          <Text style={styles.domainDescription}>{currentMeta.description}</Text>
        </View>

        {formState.submitSuccess && receipt ? (
          <View style={styles.successWrap}>
            <View style={styles.successMark}><Text style={styles.successCheck}>✓</Text></View>
            <Text style={styles.successEyebrow}>VERIFIED & PERSISTED</Text>
            <Text style={styles.successTitle}>{currentMeta.title} Completed</Text>
            <Text style={styles.successCopy}>
              The engine validated every constraint, dynamic condition, and sanitization rule across all stages.
            </Text>
            <View style={styles.receipt}>
              <Text style={styles.receiptLabel}>SUBMISSION PAYLOAD PREVIEW</Text>
              {Object.entries(receipt.values)
                .slice(0, 4)
                .map(([k, v]) => (
                  <View key={k} style={styles.receiptRow}>
                    <Text style={styles.receiptFieldKey}>{k}:</Text>
                    <Text numberOfLines={1} style={styles.receiptFieldValue}>
                      {typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}
                    </Text>
                  </View>
                ))}
            </View>
            <ActionButton label="Run this form again" onPress={startOver} />
          </View>
        ) : (
          <>
            {ghostRollback ? (
              <View style={styles.ghostBannerCard}>
                <View style={styles.ghostBannerHeader}>
                  <Text style={styles.ghostBannerTitle}>👻 Ghost Autofill Applied</Text>
                  <Tag tone="teal">HEURISTIC REVERSIBLE</Tag>
                </View>
                <Text style={styles.ghostBannerDesc}>{ghostBannerMsg}</Text>
                <View style={styles.ghostBannerActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      if (ghostRollback) ghostRollback();
                      setGhostRollback(null);
                      setGhostBannerMsg(null);
                    }}
                    style={styles.ghostRollbackBtn}
                  >
                    <Text style={styles.ghostRollbackBtnText}>↩ Undo / Rollback</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setGhostRollback(null);
                      setGhostBannerMsg(null);
                    }}
                    style={styles.ghostKeepBtn}
                  >
                    <Text style={styles.ghostKeepBtnText}>Keep Changes ✓</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <AutofillToolbar
              onAutofillAddress={handleAutofillAddress}
              onAutofillContact={handleAutofillContact}
              onAutofillSample={loadSample}
              onAutofillGhost={() => setIsGhostModalOpen(true)}
              activeOrigin={formState.isDirty ? 'active session' : undefined}
            />

            <ProgressSteps
              steps={stepNames}
              current={stepIndex}
              inspectedIndex={inspectedIndex}
              onStepPress={(idx) => {
                if (idx === stepIndex) {
                  manager.stopSpeaking();
                  setIsSpeaking(false);
                  manager.stopPeeking();
                } else {
                  manager.peekStep(idx);
                }
              }}
            />

            {isPeeking ? (
              <PeekNoticeBar
                stepIndex={inspectedIndex}
                totalSteps={stepNames.length}
                stepTitle={inspectedPage?.title ?? `Step ${inspectedIndex + 1}`}
                impact={branchImpact}
                onSwitchBranch={handleSwitchBranch}
                onSpeak={handleToggleSpeak}
                isSpeaking={isSpeaking}
                onReturn={() => {
                  manager.stopSpeaking();
                  setIsSpeaking(false);
                  setConfirmWarning(null);
                  manager.stopPeeking();
                }}
              />
            ) : null}

            {confirmWarning ? (
              <View style={styles.dataLossCard}>
                <Text style={styles.dataLossTitle}>⚠️ Branch Switch Confirmation & Data Loss</Text>
                <Text style={styles.dataLossDesc}>
                  Switching to "{confirmWarning.targetPageTitle}" diverges from your active path. Progress on {confirmWarning.prunedFields.length} answered field(s) will be discarded:
                </Text>
                {confirmWarning.prunedFields.map((f) => (
                  <Text key={f.name} style={styles.dataLossItem}>
                    • <Text style={{ fontWeight: '700' }}>{f.label}</Text>: "{String(f.value)}"
                  </Text>
                ))}
                <View style={styles.dataLossActions}>
                  <ActionButton
                    label="Confirm & Discard Data"
                    compact
                    onPress={() => {
                      manager.confirmBranchSwitch(confirmWarning.targetPageIndex, { autoSatisfyPrerequisites: true });
                      setConfirmWarning(null);
                    }}
                  />
                  <ActionButton
                    label="Cancel & Keep Progress"
                    secondary
                    compact
                    onPress={() => setConfirmWarning(null)}
                  />
                </View>
              </View>
            ) : null}

            {inspectedPage?.role === 'cover' ? (
              <CoverPageCard
                title={inspectedPage.title ?? currentMeta.title}
                description={inspectedPage.description ?? currentMeta.description}
                badge="SURVEY COVER"
                estimatedTime="3 mins"
                onStart={() => {
                  manager.stopPeeking();
                  manager.nextStep();
                }}
              />
            ) : (
              <>
                <SectionHeading
                  title={inspectedPage?.title ?? 'Details'}
                  detail={`Step ${inspectedIndex + 1} of ${stepNames.length} · ${isPeeking ? 'Read-only inspection preview' : 'Dynamic state verified by engine.'}`}
                />

                {visibleFields.map((field) => (
                  <FieldControl
                    key={field.id}
                    field={field}
                    value={formState.values[field.name]}
                    error={formState.errors[field.name as keyof Values]}
                    readOnly={isPeeking}
                    onChange={(value) => {
                      if (isPeeking) return;
                      form.setFieldValue(field.name, value);
                      manager.pruneHiddenFieldValues();
                    }}
                  />
                ))}

                {formState.submitError ? <Text style={styles.submitError}>{formState.submitError}</Text> : null}

                <View style={styles.buttonRow}>
                  {isPeeking ? (
                    <View style={{ flex: 1 }}>
                      <ActionButton
                        label="Return to Active Step"
                        onPress={() => {
                          manager.stopSpeaking();
                          setIsSpeaking(false);
                          manager.stopPeeking();
                        }}
                      />
                    </View>
                  ) : (
                    <>
                      {stepIndex > 0 ? (
                        <View style={styles.backButton}>
                          <ActionButton label="Back" secondary onPress={() => manager.prevStep()} />
                        </View>
                      ) : null}
                      <View style={styles.forwardButton}>
                        <ActionButton
                          label={formState.isSubmitting ? 'Validating…' : manager.isLastStep() ? (isOnline ? 'Submit completed form' : 'Queue to Offline Outbox') : 'Continue'}
                          disabled={formState.isSubmitting}
                          onPress={moveForward}
                        />
                      </View>
                    </>
                  )}
                </View>
                <Text style={styles.formFootnote}>
                  {isPeeking
                    ? 'Inspection mode: Tap 🔊 Speak for voice explanation or tap any step to peek ahead.'
                    : isOnline
                    ? 'Connected: All transitions & validations execute locally with real-time feedback.'
                    : 'Offline active: Submissions are securely buffered in outbox DLQ until reconnected.'}
                </Text>
              </>
            )}
          </>
        )}
      </Panel>

      <View style={styles.noteRow}>
        <View style={styles.noteIcon}><Text style={styles.noteIconText}>⚡</Text></View>
        <View style={styles.noteContent}>
          <Text style={styles.noteTitle}>Active Architectural Capabilities</Text>
          <Text style={styles.noteBody}>
            This archetype specifically activates and exercises these engine components:
          </Text>
        </View>
      </View>

      <View style={styles.supportStrip}>
        <View style={styles.supportTags}>
          {currentMeta.capabilities.map((cap) => (
            <Tag key={cap} tone="slate">{cap}</Tag>
          ))}
        </View>
      </View>

      {/* Ghost Form Freeform Ingestion Modal */}
      <Modal
        visible={isGhostModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsGhostModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.ghostModalCard}>
            <View style={styles.ghostModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ghostModalTitle}>👻 Unstructured Ghost Form Ingestion</Text>
                <Text style={styles.ghostModalSub}>
                  Paste raw unformatted text, emails, or clinical summaries. The heuristic NLP engine extracts and maps target fields with 1-click transactional rollback.
                </Text>
              </View>
              <Pressable onPress={() => setIsGhostModalOpen(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>×</Text>
              </Pressable>
            </View>

            <Text style={styles.ghostModalSectionLabel}>Quick Sample Snippets</Text>
            <View style={styles.ghostSampleRow}>
              {GHOST_SAMPLE_TEXTS.map((sample) => (
                <Pressable
                  key={sample.label}
                  onPress={() => setGhostInputText(sample.text)}
                  style={[
                    styles.ghostSampleChip,
                    ghostInputText === sample.text ? styles.ghostSampleChipActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.ghostSampleChipText,
                      ghostInputText === sample.text ? styles.ghostSampleChipTextActive : null,
                    ]}
                  >
                    {sample.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.ghostModalSectionLabel}>Freeform Unstructured Text</Text>
            <TextInput
              style={styles.ghostTextInput}
              multiline
              numberOfLines={4}
              value={ghostInputText}
              onChangeText={setGhostInputText}
              placeholder="Paste raw conversation, emails, notes, or address details..."
              placeholderTextColor={colors.muted}
            />

            <View style={styles.ghostModalActions}>
              <ActionButton
                label="Cancel"
                secondary
                onPress={() => setIsGhostModalOpen(false)}
              />
              <ActionButton
                label={isExtractingGhost ? 'Extracting…' : '✨ Extract & Populate Form'}
                disabled={isExtractingGhost || !ghostInputText.trim()}
                onPress={handleApplyGhost}
              />
            </View>
          </View>
        </View>
      </Modal>
    </AppPage>
  );
}

const styles = StyleSheet.create({
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  topBadgeGroup: { flexDirection: 'row', gap: 6 },
  topActions: { flexDirection: 'row', alignItems: 'center' },
  domainIntro: { marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  domainHeadline: { fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 4 },
  domainDescription: { fontSize: 12, lineHeight: 17, color: colors.muted },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  backButton: { flex: 0.8 },
  forwardButton: { flex: 1.3 },
  formFootnote: { fontSize: 10, color: colors.faint, textAlign: 'center', marginTop: 11 },
  submitError: { color: colors.red, fontSize: 12, marginBottom: 10 },
  successWrap: { alignItems: 'center', paddingVertical: 18 },
  successMark: { height: 54, width: 54, borderRadius: 18, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 15, transform: [{ rotate: '-5deg' }] },
  successCheck: { color: colors.teal, fontSize: 24, fontWeight: '900' },
  successEyebrow: { fontSize: 9, letterSpacing: 1.6, color: colors.teal, fontWeight: '900' },
  successTitle: { color: colors.ink, fontSize: 22, fontWeight: '800', marginTop: 6, textAlign: 'center' },
  successCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 360, marginTop: 7, marginBottom: 18 },
  receipt: { backgroundColor: colors.slateSoft, borderRadius: 15, padding: 14, width: '100%', marginBottom: 18 },
  receiptLabel: { fontSize: 8, letterSpacing: 1, color: colors.faint, fontWeight: '900', marginBottom: 8 },
  receiptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 3 },
  receiptFieldKey: { fontSize: 11, fontWeight: '700', color: colors.muted },
  receiptFieldValue: { fontSize: 11, fontWeight: '800', color: colors.ink, maxWidth: '60%', textAlign: 'right' },
  noteRow: { flexDirection: 'row', paddingHorizontal: 5, paddingVertical: 9, marginBottom: 8 },
  noteIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violetSoft, marginRight: 11 },
  noteIconText: { color: colors.violet, fontSize: 14, fontWeight: '900' },
  noteContent: { flex: 1 },
  noteTitle: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  noteBody: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  supportStrip: { paddingHorizontal: 3, paddingBottom: 16 },
  supportTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dataLossCard: { backgroundColor: '#FFF1F2', borderColor: '#FECDD3', borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 14 },
  dataLossTitle: { fontSize: 13, fontWeight: '800', color: '#BE123C', marginBottom: 4 },
  dataLossDesc: { fontSize: 11, color: '#9F1239', lineHeight: 16, marginBottom: 8 },
  dataLossItem: { fontSize: 11, color: '#881337', marginBottom: 3, paddingLeft: 4 },
  dataLossActions: { flexDirection: 'row', gap: 8, marginTop: 10 },

  // Resilience & Outbox Status
  resilienceStrip: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.medium,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  resilienceStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  networkDot: { width: 8, height: 8, borderRadius: 4 },
  networkDotOnline: { backgroundColor: colors.teal },
  networkDotOffline: { backgroundColor: '#F59E0B' },
  networkStatusText: { fontSize: 11, fontWeight: '700', color: colors.ink },
  resilienceActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resilienceBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.slateSoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  resilienceBtnActive: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  resilienceBtnText: { fontSize: 11, fontWeight: '700', color: colors.ink },
  drainBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.violet,
  },
  drainBtnDisabled: { opacity: 0.5 },
  drainBtnText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },

  // AI Studio Prompt Bar
  aiStudioCard: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: radii.large,
    padding: 14,
    marginBottom: 14,
  },
  aiStudioHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  aiStudioTitle: { fontSize: 13, fontWeight: '800', color: colors.ink },
  aiStudioSubtitle: { fontSize: 11, color: colors.muted, lineHeight: 16, marginBottom: 10 },
  promptInputRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  promptInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.small,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: colors.ink,
  },
  synthesizeBtn: {
    backgroundColor: colors.ink,
    borderRadius: radii.small,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  synthesizeBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  presetRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  presetLabel: { fontSize: 11, fontWeight: '700', color: colors.faint, marginRight: 2 },
  presetChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.line,
  },
  presetChipActive: { backgroundColor: colors.violetSoft, borderColor: colors.violet },
  presetChipText: { fontSize: 10, fontWeight: '700', color: colors.muted },
  presetChipTextActive: { color: colors.violet },
  groundingMeta: {
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  groundingMetaTitle: { fontSize: 10, fontWeight: '800', color: '#4338CA', marginBottom: 2 },
  groundingMetaText: { fontSize: 10, color: '#3730A3', lineHeight: 14 },

  // Battery Status Styles
  resilienceStatusCol: { gap: 4 },
  batteryStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  batteryDot: { width: 7, height: 7, borderRadius: 3.5 },
  batteryDotNormal: { backgroundColor: colors.teal },
  batteryDotCharging: { backgroundColor: '#10B981' },
  batteryDotThrottled: { backgroundColor: '#EF4444' },
  batteryStatusText: { fontSize: 10, fontWeight: '700', color: colors.muted },
  batteryStatusTextThrottled: { color: '#DC2626' },
  resilienceBtnThrottled: { backgroundColor: '#FEE2E2', borderColor: '#FECACA' },
  outboxButtonCluster: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  forceSyncBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#EF4444',
  },
  forceSyncBtnText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },

  // Ghost Autofill Banner Card
  ghostBannerCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: radii.medium,
    padding: 12,
    marginBottom: 12,
  },
  ghostBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  ghostBannerTitle: { fontSize: 13, fontWeight: '800', color: '#166534' },
  ghostBannerDesc: { fontSize: 11, color: '#15803D', lineHeight: 16, marginBottom: 8 },
  ghostBannerActions: { flexDirection: 'row', gap: 8 },
  ghostRollbackBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ghostRollbackBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  ghostKeepBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ghostKeepBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },

  // Ghost Ingestion Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  ghostModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.large,
    padding: 18,
    width: '100%',
    maxWidth: 540,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
  },
  ghostModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  ghostModalTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 4 },
  ghostModalSub: { fontSize: 11, color: colors.muted, lineHeight: 16 },
  modalCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.slateSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: { fontSize: 18, fontWeight: '600', color: colors.ink },
  ghostModalSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 6,
  },
  ghostSampleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  ghostSampleChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.slateSoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  ghostSampleChipActive: { backgroundColor: colors.tealSoft, borderColor: colors.teal },
  ghostSampleChipText: { fontSize: 10, fontWeight: '700', color: colors.muted },
  ghostSampleChipTextActive: { color: colors.teal, fontWeight: '800' },
  ghostTextInput: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.small,
    padding: 12,
    fontSize: 12,
    color: colors.ink,
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  ghostModalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
});
