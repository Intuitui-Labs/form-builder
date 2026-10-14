import { useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { FormHydrator, type FormState } from '@intuitui-labs/form-builder-engine';
import { ActionButton, AppPage, BrandHeader, CodeBlock, FieldControl, Notice, Panel, SectionHeading, Tag } from '../components/EngineUi';
import { HYDRATED_FIELDS, registerShowcaseValidators, type Values } from '../forms';
import { colors } from '../theme';

registerShowcaseValidators();
const SCHEMA_PREVIEW = JSON.stringify({ version: 'remote-form-v1', fields: HYDRATED_FIELDS }, null, 2);

export default function HydrationScreen() {
  const [receipt, setReceipt] = useState<Values | null>(null);
  const manager = useMemo(
    () => FormHydrator.hydrate<Values>({ fields: HYDRATED_FIELDS }, async (values) => {
      await new Promise((resolve) => setTimeout(resolve, 350));
      setReceipt(values);
    }),
    [],
  );
  const [state, setState] = useState<FormState<Values>>(() => manager.getState());

  useEffect(() => manager.subscribe(setState), [manager]);

  const reset = () => {
    manager.reset();
    setReceipt(null);
  };
  const loadSample = () => {
    manager.setFieldValue('teamName', 'Northstar');
    manager.setFieldValue('leadEmail', 'lead@northstar.example');
    manager.setFieldValue('companySize', '11-50');
    manager.setFieldValue('readiness', 4);
    manager.setFieldValue('context', 'The evaluator checklist is ready.');
    setReceipt(null);
  };

  return (
    <AppPage>
      <BrandHeader
        eyebrow="Schema in · controls out"
        title="Hydrate from JSON."
        subtitle="A backend-shaped field definition becomes a working form through the engine’s hydrator—without a web-only component dependency."
      />

      <Notice
        title="The renderer stays yours"
        body="Hydration configures field names, defaults, required rules, options, and validators. React Native presentation is intentionally supplied by this app."
      />

      <View style={styles.sampleAction}>
        <Text style={styles.sampleLabel}>SKIP TO A VALID HAPPY PATH</Text>
        <View style={styles.sampleButton}><ActionButton label="Fill sample" secondary compact onPress={loadSample} /></View>
      </View>

      <Panel>
        <View style={styles.formTop}>
          <Tag tone="teal">FORM HYDRATOR</Tag>
          <Text style={styles.formHint}>SCHEMA v1</Text>
        </View>
        {state.submitSuccess ? (
          <View style={styles.savedBox}>
            <Text style={styles.savedLabel}>HYDRATED FORM SUBMITTED</Text>
            <Text style={styles.savedTitle}>Ready for your adapter.</Text>
            <Text style={styles.savedCopy}>{String(receipt?.teamName ?? 'Team')} · {String(receipt?.companySize ?? 'Size not set')} · readiness {String(receipt?.readiness ?? '—')}/5</Text>
            <ActionButton label="Reset form" secondary onPress={reset} />
          </View>
        ) : (
          <>
            <SectionHeading title="Pilot pulse check" detail="Generated from a plain field-definition array." />
            {HYDRATED_FIELDS.map((field) => (
              <FieldControl
                key={field.name}
                field={field}
                value={state.values[field.name]}
                error={state.errors[field.name as keyof Values]}
                onChange={(value) => manager.setFieldValue(field.name, value)}
              />
            ))}
            {state.submitError ? <Text style={styles.error}>{state.submitError}</Text> : null}
            <ActionButton label={state.isSubmitting ? 'Saving…' : 'Submit hydrated form'} disabled={state.isSubmitting} onPress={() => void manager.submit()} />
          </>
        )}
      </Panel>

      <SectionHeading title="The payload" detail="This is the shape the engine receives before it hydrates its manager." />
      <CodeBlock>{SCHEMA_PREVIEW}</CodeBlock>

      <View style={styles.customRuleCard}>
        <View style={styles.customRuleDot} />
        <View style={styles.customRuleText}>
          <Text style={styles.customRuleTitle}>Custom rule registered by the host app</Text>
          <Text style={styles.customRuleBody}>The team name rejects unsupported symbols via the engine’s named custom-validator hook.</Text>
        </View>
      </View>
    </AppPage>
  );
}

const styles = StyleSheet.create({
  formTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  formHint: { color: colors.faint, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  savedBox: { alignItems: 'center', paddingVertical: 14 },
  savedLabel: { color: colors.teal, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  savedTitle: { color: colors.ink, fontSize: 21, fontWeight: '800', marginTop: 8 },
  savedCopy: { color: colors.muted, fontSize: 12, marginTop: 6, marginBottom: 18 },
  error: { color: colors.red, fontSize: 11, marginBottom: 10 },
  customRuleCard: { flexDirection: 'row', alignItems: 'flex-start', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14, marginTop: 1, marginBottom: 20 },
  customRuleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.violet, marginTop: 4, marginRight: 10 },
  customRuleText: { flex: 1 },
  customRuleTitle: { color: colors.ink, fontSize: 11, fontWeight: '800' },
  customRuleBody: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 4 },
  sampleAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 3 },
  sampleLabel: { color: colors.faint, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  sampleButton: { width: 112 },
});
