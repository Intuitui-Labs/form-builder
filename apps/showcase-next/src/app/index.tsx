import { useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet, TextInput, Pressable } from 'react-native';
import {
  MultiStepFormManager,
  type FormState,
  type BranchSwitchImpact,
} from '@intuitui-labs/form-builder-engine';
import {
  WebSpeechAdapter,
  SimulatedNetworkAdapter,
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

export default function BuilderScreen() {
  const [selectedFormId, setSelectedFormId] = useState<string>('launch-readiness');
  const [receipt, setReceipt] = useState<{ formId: string; values: Values } | null>(null);

  // AI Scaffolder Studio State
  const [aiPrompt, setAiPrompt] = useState('California SB 1047 & Frontier AI Safety Intake');
  const [customStudioResult, setCustomStudioResult] = useState<GroundedCompilationResult | null>(null);

  // Hexagonal Adapters
  const speechAdapter = useMemo(() => new WebSpeechAdapter(), []);
  const networkAdapter = useMemo(() => new SimulatedNetworkAdapter(true), []);

  const [isOnline, setIsOnline] = useState(true);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isFlushingOutbox, setIsFlushingOutbox] = useState(false);

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
            enableOutbox: true,
          },
          experience: {
            speechSynthesis: speechAdapter,
          },
        },
      ),
    [activeSchema, currentMeta.id, networkAdapter, speechAdapter],
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

  const handleFlushOutbox = async () => {
    setIsFlushingOutbox(true);
    try {
      await manager.flushOutbox();
      setPendingOutboxCount(manager.getPendingOutboxCount());
    } finally {
      setIsFlushingOutbox(false);
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
        <View style={styles.resilienceStatus}>
          <View style={[styles.networkDot, isOnline ? styles.networkDotOnline : styles.networkDotOffline]} />
          <Text style={styles.networkStatusText}>
            {isOnline ? 'DIRECT NETWORK (Online)' : 'OFFLINE MODE (Enqueuing to DLQ)'}
          </Text>
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
          {pendingOutboxCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={handleFlushOutbox}
              disabled={isFlushingOutbox || !isOnline}
              style={[
                styles.drainBtn,
                !isOnline ? styles.drainBtnDisabled : null,
              ]}
            >
              <Text style={styles.drainBtnText}>
                {isFlushingOutbox ? '⚡ Draining…' : `⚡ Drain Outbox (${pendingOutboxCount})`}
              </Text>
            </Pressable>
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
            <AutofillToolbar
              onAutofillAddress={handleAutofillAddress}
              onAutofillContact={handleAutofillContact}
              onAutofillSample={loadSample}
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
});
