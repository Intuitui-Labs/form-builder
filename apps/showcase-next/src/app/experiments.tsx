import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import {
  ExperimentFormHydrator,
  DeterministicHashExperimentAdapter,
  CallbackExperimentAdapter,
  MemoryTelemetryAdapter,
  type FormSchema,
  type FormTelemetryEvent,
} from '@intuitui-labs/form-builder-engine';
import {
  AppPage,
  BrandHeader,
  Panel,
  ActionButton,
  Tag,
  SectionHeading,
} from '../components/EngineUi';
import { READINESS_SCHEMA } from '../forms';
import { colors, radii } from '../theme';

// Express 1-step variant patch
const EXPRESS_VARIANT_SCHEMA: FormSchema = {
  ...READINESS_SCHEMA,
  id: 'launch-readiness-express',
  title: 'Express Launch Review (Variant B)',
  pages: [
    {
      id: 'express-all-in-one',
      title: 'Quick 1-Step Intake',
      fields: [
        READINESS_SCHEMA.pages[0].fields[0], // Contact Name
        READINESS_SCHEMA.pages[0].fields[1], // Work Email
        READINESS_SCHEMA.pages[1].fields[0], // Project Name
      ],
    },
  ],
};

const experimentAdapter = new DeterministicHashExperimentAdapter({
  experiments: [
    {
      experimentKey: 'onboarding_flow_v2',
      defaultVariant: 'control',
      variants: [
        { id: 'control', weight: 50 },
        { id: 'express_v1', weight: 50 },
      ],
    },
  ],
});

export default function ExperimentsScreen() {
  const [userId, setUserId] = useState('usr_mobile_42');
  const [manualVariant, setManualVariant] = useState<'hash' | 'control' | 'express_v1'>('hash');
  const [statusText, setStatusText] = useState('Ready');
  const [telemetryEvents, setTelemetryEvents] = useState<FormTelemetryEvent[]>([]);

  const telemetry = useMemo(() => {
    return new MemoryTelemetryAdapter({
      onEvent: (evt) => {
        setTelemetryEvents((prev) => [evt, ...prev.slice(0, 19)]);
      },
    });
  }, []);

  const handleModeChange = (mode: 'hash' | 'control' | 'express_v1') => {
    setManualVariant(mode);
    if (mode === 'hash') {
      experimentAdapter.clearOverrides();
    } else {
      experimentAdapter.overrideVariant('onboarding_flow_v2', mode);
    }
  };

  const activeVariantId = useMemo(() => {
    return experimentAdapter.getVariant('onboarding_flow_v2', { userId }, 'control');
  }, [userId, manualVariant]);

  const hydrationResult = useMemo(() => {
    return ExperimentFormHydrator.hydrate({
      experimentKey: 'onboarding_flow_v2',
      variants: {
        control: READINESS_SCHEMA,
        express_v1: EXPRESS_VARIANT_SCHEMA,
      },
      defaultVariant: 'control',
      experimentPort: new CallbackExperimentAdapter({
        getVariant: (k, c, fallback) => experimentAdapter.getVariant(k, c, fallback),
        trackExposure: (_k, v) => {
          setStatusText(`Exposure tracked for variant "${v}" (QA override: ${manualVariant !== 'hash' ? 'YES' : 'NO'})`);
        },
      }),
      context: { userId },
      isMultiStep: true,
      telemetry,
      onSubmit: async () => {
        setStatusText(`Submitted successfully under ${activeVariantId}!`);
      },
    });
  }, [activeVariantId, userId, telemetry, manualVariant]);

  return (
    <AppPage>
      <BrandHeader
        eyebrow="Hexagonal A/B Testing"
        title="Dynamic Variants & Flags"
        subtitle="Experience zero-flicker deterministic variant assignment and decoupled exposure tracking."
      />

      <Panel>
        <SectionHeading title="Experiment Context" detail="OpenFeature compliant" />
        <Text style={styles.label}>Evaluation Identity (User ID)</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={userId}
            onChangeText={setUserId}
            placeholder="e.g. user_101"
            placeholderTextColor={colors.muted}
          />
          <Pressable
            style={styles.randomButton}
            onPress={() => setUserId(`usr_${Math.floor(Math.random() * 9000 + 1000)}`)}
          >
            <Text style={styles.randomText}>🎲 Randomize</Text>
          </Pressable>
        </View>

        <View style={styles.variantSelector}>
          <Text style={styles.label}>Variant Override Mode (QA Port):</Text>
          <View style={styles.chipRow}>
            {(['hash', 'control', 'express_v1'] as const).map((mode) => (
              <Pressable
                key={mode}
                style={[styles.chip, manualVariant === mode && styles.chipActive]}
                onPress={() => handleModeChange(mode)}
              >
                <Text style={[styles.chipText, manualVariant === mode && styles.chipTextActive]}>
                  {mode === 'hash' ? '⚡ Hash (Auto)' : mode === 'control' ? 'Control (3-Step)' : 'Variant B (1-Step)'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.resolutionBanner}>
          <View>
            <Text style={styles.resolvedLabel}>ASSIGNED VARIANT</Text>
            <Text style={styles.resolvedValue}>{activeVariantId.toUpperCase()}</Text>
          </View>
          <Tag tone={hydrationResult.hasTrackedExposure() ? 'teal' : 'amber'}>
            {hydrationResult.hasTrackedExposure() ? 'Exposed' : 'Unexposed'}
          </Tag>
        </View>

        <View style={{ marginTop: 12 }}>
          <ActionButton
            label="Track Exposure Event"
            onPress={() => hydrationResult.trackExposure()}
          />
        </View>
      </Panel>

      <Panel style={{ marginTop: 14 }}>
        <SectionHeading title="Active Form Blueprint" detail={`${hydrationResult.schema.pages.length} Pages`} />
        <Text style={styles.formTitle}>{hydrationResult.schema.title}</Text>
        <Text style={styles.formSubtitle}>{hydrationResult.schema.description}</Text>

        <View style={styles.stepsPreview}>
          {hydrationResult.schema.pages.map((p, idx) => (
            <View key={p.id} style={styles.stepPill}>
              <Text style={styles.stepIndex}>#{idx + 1}</Text>
              <Text style={styles.stepTitle}>{p.title}</Text>
              <Text style={styles.fieldCount}>({p.fields.length} fields)</Text>
            </View>
          ))}
        </View>
      </Panel>

      <Panel style={{ marginTop: 14 }}>
        <SectionHeading title="In-Flight Telemetry Stream" detail={`${telemetryEvents.length} events`} />
        {telemetryEvents.length === 0 ? (
          <Text style={styles.emptyFeed}>Interact with the form to see real-time Zero-PII events.</Text>
        ) : (
          <View style={styles.eventList}>
            {telemetryEvents.slice(0, 5).map((e, idx) => (
              <View key={`${e.type}_${idx}`} style={styles.eventRow}>
                <Text style={styles.eventType}>{e.type}</Text>
                <Text style={styles.eventTime}>{new Date(e.timestamp).toLocaleTimeString()}</Text>
              </View>
            ))}
          </View>
        )}
      </Panel>

      <Text style={styles.statusFooter}>{statusText}</Text>
    </AppPage>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', marginBottom: 6 },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  input: { flex: 1, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, borderRadius: radii.small, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: colors.ink },
  randomButton: { backgroundColor: colors.violetSoft, paddingHorizontal: 12, justifyContent: 'center', borderRadius: radii.small },
  randomText: { fontSize: 11, fontWeight: '700', color: colors.violet },
  variantSelector: { marginVertical: 8 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line },
  chipActive: { backgroundColor: colors.violet, borderColor: colors.violet },
  chipText: { fontSize: 11, fontWeight: '700', color: colors.muted },
  chipTextActive: { color: colors.paper },
  resolutionBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.slateSoft, padding: 12, borderRadius: radii.small, marginTop: 10 },
  resolvedLabel: { fontSize: 9, fontWeight: '800', color: colors.muted, letterSpacing: 0.8 },
  resolvedValue: { fontSize: 16, fontWeight: '900', color: colors.ink, marginTop: 2 },
  formTitle: { fontSize: 14, fontWeight: '800', color: colors.ink, marginTop: 4 },
  formSubtitle: { fontSize: 12, color: colors.muted, marginTop: 2, marginBottom: 10 },
  stepsPreview: { gap: 6 },
  stepPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.canvas, padding: 8, borderRadius: radii.small },
  stepIndex: { fontSize: 10, fontWeight: '800', color: colors.violet },
  stepTitle: { fontSize: 12, fontWeight: '700', color: colors.ink },
  fieldCount: { fontSize: 11, color: colors.muted },
  emptyFeed: { fontSize: 12, color: colors.muted, fontStyle: 'italic', paddingVertical: 8 },
  eventList: { gap: 6, marginTop: 6 },
  eventRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.line },
  eventType: { fontSize: 11, fontWeight: '700', color: colors.ink },
  eventTime: { fontSize: 10, color: colors.muted },
  statusFooter: { textAlign: 'center', fontSize: 11, color: colors.muted, marginVertical: 16, fontStyle: 'italic' },
});
