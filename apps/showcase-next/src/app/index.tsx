import { useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { MultiStepFormManager, type FormState, type BranchSwitchImpact } from '@intuitui-labs/form-builder-engine';
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
import { colors } from '../theme';

export default function BuilderScreen() {
  const [selectedFormId, setSelectedFormId] = useState<string>('launch-readiness');
  const [receipt, setReceipt] = useState<{ formId: string; values: Values } | null>(null);

  const currentMeta = useMemo(
    () => SHOWCASE_CATALOG.find((item) => item.id === selectedFormId) ?? SHOWCASE_CATALOG[0]!,
    [selectedFormId],
  );

  const manager = useMemo(
    () =>
      new MultiStepFormManager<Values>(currentMeta.schema, async (values) => {
        await new Promise((resolve) => setTimeout(resolve, 450));
        setReceipt({ formId: currentMeta.id, values });
      }),
    [currentMeta],
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
    setReceipt(null);
    setConfirmWarning(null);

    const unsubscribeForm = form.subscribe(setFormState);
    const unsubscribeSteps = manager.subscribe((current) => {
      setStepIndex(current.getCurrentPageIndex());
      setIsPeeking(current.isPeeking());
      setInspectedIndex(current.getInspectedPageIndex());
    });

    return () => {
      unsubscribeForm();
      unsubscribeSteps();
      manager.destroy();
    };
  }, [form, manager]);

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

  const stepNames = currentMeta.schema.pages.map((p) => p.title ?? 'Step');
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

  const moveForward = () => {
    if (isPeeking) {
      manager.stopPeeking();
      return;
    }
    if (manager.isLastStep()) {
      void manager.submit();
    } else {
      manager.nextStep();
    }
  };

  const startOver = () => {
    form.reset();
    manager.goToStep(0);
    manager.stopPeeking();
    setReceipt(null);
  };

  const handleDomainSelect = (id: string) => {
    if (id !== selectedFormId) {
      setSelectedFormId(id);
      setReceipt(null);
    }
  };

  return (
    <AppPage>
      <BrandHeader
        eyebrow="Multi-Domain Form Engine Showcase"
        title="Schema-Driven Native Forms"
        subtitle="Experience 6 diverse domain forms testing rich-text markdown, dynamic visibleIf conditions, branching jumpRules, Luhn algorithms, and heuristic autofill."
      />

      <DomainPicker
        domains={SHOWCASE_CATALOG}
        selectedId={selectedFormId}
        onSelect={handleDomainSelect}
      />

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
                onReturn={() => {
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
                        onPress={() => manager.stopPeeking()}
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
                          label={formState.isSubmitting ? 'Validating…' : manager.isLastStep() ? 'Submit completed form' : 'Continue'}
                          disabled={formState.isSubmitting}
                          onPress={moveForward}
                        />
                      </View>
                    </>
                  )}
                </View>
                <Text style={styles.formFootnote}>
                  {isPeeking
                    ? 'Inspection mode: Tap any step above to peek ahead without losing your progress.'
                    : 'Simulation mode: All validations and transitions run locally.'}
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
});
