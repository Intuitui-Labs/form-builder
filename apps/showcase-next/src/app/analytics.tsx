import { useMemo, useState } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { AnalyticsEngine } from '@intuitui-labs/form-builder-engine/analytics';
import type { FormTelemetryEvent } from '@intuitui-labs/form-builder-engine';
import { ActionButton, AppPage, BrandHeader, CodeBlock, Notice, Panel, SectionHeading, Tag } from '../components/EngineUi';
import { ANALYTICS_FIELDS, ANALYTICS_RESPONSES } from '../forms';
import { colors } from '../theme';

// Representative in-flight telemetry events to demonstrate survivorship-bias-free funnel and struggle index
const SAMPLE_TELEMETRY_EVENTS: FormTelemetryEvent[] = [
  // Variant: control (4 starts, 2 drop-offs, 2 completions)
  { type: 'form_mounted', formId: 'launch-readiness', schemaVersion: '1.0', experimentLineage: { experimentKey: 'onboarding_v2', variantId: 'control' }, timestamp: 1000 },
  { type: 'step_viewed', formId: 'launch-readiness', stepIndex: 0, stepId: 'identity', timestamp: 1010 },
  { type: 'field_focused', formId: 'launch-readiness', stepIndex: 0, fieldName: 'workEmail', timestamp: 1020 },
  { type: 'field_error', formId: 'launch-readiness', stepIndex: 0, fieldName: 'workEmail', errorRule: 'email', timestamp: 1030 },
  { type: 'field_error', formId: 'launch-readiness', stepIndex: 0, fieldName: 'workEmail', errorRule: 'email', timestamp: 1040 },
  { type: 'field_blurred', formId: 'launch-readiness', stepIndex: 0, fieldName: 'workEmail', dwellMs: 8200, hasValue: true, timestamp: 1050 },
  { type: 'step_completed', formId: 'launch-readiness', stepIndex: 0, stepId: 'identity', durationMs: 9500, timestamp: 1060 },
  { type: 'step_viewed', formId: 'launch-readiness', stepIndex: 1, stepId: 'project', timestamp: 1070 },
  { type: 'field_focused', formId: 'launch-readiness', stepIndex: 1, fieldName: 'projectName', timestamp: 1080 },
  { type: 'field_blurred', formId: 'launch-readiness', stepIndex: 1, fieldName: 'projectName', dwellMs: 3100, hasValue: true, timestamp: 1090 },
  { type: 'step_completed', formId: 'launch-readiness', stepIndex: 1, stepId: 'project', durationMs: 4200, timestamp: 1100 },
  { type: 'form_submitted', formId: 'launch-readiness', totalDurationMs: 13700, success: true, errorCount: 0, experimentLineage: { experimentKey: 'onboarding_v2', variantId: 'control' }, timestamp: 1110 },

  // User 2: Abandons on step 0 due to email validation friction
  { type: 'form_mounted', formId: 'launch-readiness', schemaVersion: '1.0', experimentLineage: { experimentKey: 'onboarding_v2', variantId: 'control' }, timestamp: 2000 },
  { type: 'step_viewed', formId: 'launch-readiness', stepIndex: 0, stepId: 'identity', timestamp: 2010 },
  { type: 'field_focused', formId: 'launch-readiness', stepIndex: 0, fieldName: 'workEmail', timestamp: 2020 },
  { type: 'field_error', formId: 'launch-readiness', stepIndex: 0, fieldName: 'workEmail', errorRule: 'email', timestamp: 2030 },
  { type: 'field_blurred', formId: 'launch-readiness', stepIndex: 0, fieldName: 'workEmail', dwellMs: 14000, hasValue: false, timestamp: 2040 },
  { type: 'form_abandoned', formId: 'launch-readiness', lastStepIndex: 0, completedSteps: 0, totalDurationMs: 14000, experimentLineage: { experimentKey: 'onboarding_v2', variantId: 'control' }, timestamp: 2050 },

  // Variant: express_v1 (3 starts, 0 drop-offs, 3 completions)
  { type: 'form_mounted', formId: 'launch-readiness', schemaVersion: '1.0', experimentLineage: { experimentKey: 'onboarding_v2', variantId: 'express_v1' }, timestamp: 3000 },
  { type: 'step_viewed', formId: 'launch-readiness', stepIndex: 0, stepId: 'express-all-in-one', timestamp: 3010 },
  { type: 'field_focused', formId: 'launch-readiness', stepIndex: 0, fieldName: 'contactName', timestamp: 3020 },
  { type: 'field_blurred', formId: 'launch-readiness', stepIndex: 0, fieldName: 'contactName', dwellMs: 1800, hasValue: true, timestamp: 3030 },
  { type: 'step_completed', formId: 'launch-readiness', stepIndex: 0, stepId: 'express-all-in-one', durationMs: 2500, timestamp: 3040 },
  { type: 'form_submitted', formId: 'launch-readiness', totalDurationMs: 2500, success: true, errorCount: 0, experimentLineage: { experimentKey: 'onboarding_v2', variantId: 'express_v1' }, timestamp: 3050 },
];

export default function AnalyticsScreen() {
  const [showSpreadsheet, setShowSpreadsheet] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');

  // 1. Static response set aggregations
  const stats = useMemo(() => AnalyticsEngine.aggregate(ANALYTICS_FIELDS, ANALYTICS_RESPONSES), []);
  const csv = useMemo(() => AnalyticsEngine.toCSV(ANALYTICS_FIELDS, ANALYTICS_RESPONSES), []);
  const spreadsheetXml = useMemo(() => AnalyticsEngine.toXLSX(ANALYTICS_FIELDS, ANALYTICS_RESPONSES), []);
  const teamStats = stats.find((item) => item.fieldId === 'team-size')?.data as { average: number; min: number; max: number; count: number } | undefined;
  const mix = stats.find((item) => item.fieldId === 'project-type')?.data as Record<string, number> | undefined;
  const csvPreview = csv.split('\n').slice(0, 5).join('\n');

  // 2. In-flight telemetry funnel and friction calculations
  const funnels = useMemo(() => AnalyticsEngine.calculateFunnel(SAMPLE_TELEMETRY_EVENTS), []);
  const frictionReport = useMemo(() => AnalyticsEngine.calculateFrictionIndex(SAMPLE_TELEMETRY_EVENTS), []);

  const copyCsv = async () => {
    try {
      const ok = await Clipboard.setStringAsync(csv);
      setCopyStatus(ok ? 'CSV copied to clipboard' : 'Clipboard permission was not granted');
    } catch {
      setCopyStatus('Clipboard is not available in this runtime');
    }
  };

  return (
    <AppPage>
      <BrandHeader
        eyebrow="Telemetry & Intelligence"
        title="Signals Beyond Submissions"
        subtitle="Detect mid-funnel drop-offs, user hesitation, and field struggle scores without survivorship bias."
      />

      <Panel>
        <SectionHeading title="A/B Funnel Drop-off Waterfall" detail="calculateFunnel() across in-flight variants" />
        <View style={styles.funnelContainer}>
          {Object.values(funnels).map((f) => (
            <View key={f.variantId} style={styles.variantFunnelCard}>
              <View style={styles.funnelHeaderRow}>
                <Text style={styles.funnelVariantTitle}>{f.variantId.toUpperCase()}</Text>
                <Tag tone={f.overallConversionRatePercent >= 70 ? 'teal' : 'amber'}>
                  {f.overallConversionRatePercent}% Conv.
                </Tag>
              </View>
              <Text style={styles.funnelSub}>
                Starts: {f.totalStarts} · Submissions: {f.totalSubmissions}
              </Text>
              <View style={styles.stepWaterfall}>
                {f.steps.map((st) => (
                  <View key={st.stepId} style={styles.stepBarRow}>
                    <Text style={styles.stepBarLabel}>Step {st.stepIndex} ({st.stepId})</Text>
                    <View style={styles.stepBarTrack}>
                      <View style={[styles.stepBarFill, { width: `${Math.max(15, 100 - st.dropOffRatePercent)}%` }]} />
                    </View>
                    <Text style={styles.stepDropRate}>
                      {st.dropOffRatePercent > 0 ? `-${st.dropOffRatePercent}% drop` : '100% passed'}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </Panel>

      <Panel style={{ marginTop: 14 }}>
        <SectionHeading title="Field Friction & Struggle Index" detail="calculateFrictionIndex() composite score" />
        <View style={styles.frictionList}>
          {frictionReport.map((item, idx) => (
            <View key={item.fieldName} style={styles.frictionItem}>
              <View style={styles.frictionTop}>
                <Text style={styles.frictionFieldName}>#{idx + 1} {item.fieldName}</Text>
                <Tag tone={item.frictionScore > 50 ? 'amber' : 'teal'}>
                  Score: {item.frictionScore}/100
                </Tag>
              </View>
              <View style={styles.frictionDetails}>
                <Text style={styles.frictionStat}>Errors: {item.errorCount} ({item.errorRatePercent}%)</Text>
                <Text style={styles.frictionStat}>Avg Dwell: {(item.totalDwellMs / item.focusCount / 1000).toFixed(1)}s</Text>
              </View>
            </View>
          ))}
        </View>
      </Panel>

      <View style={[styles.metricGrid, { marginTop: 14 }]}>
        <Panel style={styles.metricCard}>
          <Text style={styles.metricValue}>{ANALYTICS_RESPONSES.length}</Text>
          <Text style={styles.metricLabel}>SAMPLE RESPONSES</Text>
          <View style={styles.metricMini}><Text style={styles.metricMiniText}>COMPLETED DATA</Text></View>
        </Panel>
        <Panel style={styles.metricCard}>
          <Text style={styles.metricValue}>{teamStats ? teamStats.average.toFixed(1) : '—'}</Text>
          <Text style={styles.metricLabel}>AVG. TEAM SIZE</Text>
          <View style={styles.metricMini}><Text style={styles.metricMiniText}>PEOPLE</Text></View>
        </Panel>
      </View>

      <SectionHeading title="Export Responses" detail="OWASP-sanitized CSV & SpreadsheetML exports." />
      <Panel>
        <View style={styles.exportHeader}>
          <Text style={styles.exportTitle}>launch-readiness.csv</Text>
          <Tag>4 ROWS</Tag>
        </View>
        <CodeBlock>{csvPreview}</CodeBlock>
        <View style={styles.exportActions}>
          <View style={styles.copyButton}><ActionButton label="Copy CSV" onPress={() => void copyCsv()} /></View>
          <View style={styles.spreadsheetButton}><ActionButton label={showSpreadsheet ? 'Hide XML' : 'Inspect XML'} secondary onPress={() => setShowSpreadsheet((v) => !v)} /></View>
        </View>
        {copyStatus ? <Text style={styles.copyStatus}>{copyStatus}</Text> : null}
        {showSpreadsheet ? (
          <>
            <Notice tone="amber" title="Excel-compatible XML" body="toXLSX() emits clean SpreadsheetML XML with OWASP single-quote sanitization." />
            <CodeBlock>{spreadsheetXml.slice(0, 900) + (spreadsheetXml.length > 900 ? '\n…' : '')}</CodeBlock>
          </>
        ) : null}
      </Panel>
    </AppPage>
  );
}

const styles = StyleSheet.create({
  funnelContainer: { gap: 12, marginTop: 8 },
  variantFunnelCard: { backgroundColor: colors.canvas, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.line },
  funnelHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  funnelVariantTitle: { fontSize: 13, fontWeight: '800', color: colors.ink },
  funnelSub: { fontSize: 11, color: colors.muted, marginTop: 2, marginBottom: 8 },
  stepWaterfall: { gap: 6 },
  stepBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBarLabel: { fontSize: 10, color: colors.ink, width: 100, fontWeight: '600' },
  stepBarTrack: { flex: 1, height: 6, backgroundColor: colors.line, borderRadius: 3, overflow: 'hidden' },
  stepBarFill: { height: 6, backgroundColor: colors.violet, borderRadius: 3 },
  stepDropRate: { fontSize: 10, color: colors.muted, width: 70, textAlign: 'right', fontWeight: '700' },
  frictionList: { gap: 8, marginTop: 8 },
  frictionItem: { backgroundColor: colors.canvas, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.line },
  frictionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  frictionFieldName: { fontSize: 12, fontWeight: '700', color: colors.ink },
  frictionDetails: { flexDirection: 'row', gap: 12, marginTop: 4 },
  frictionStat: { fontSize: 10, color: colors.muted },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  metricCard: { width: '48.5%', padding: 14, marginBottom: 10 },
  metricValue: { color: colors.ink, fontSize: 27, lineHeight: 32, fontWeight: '800', letterSpacing: -0.8 },
  metricLabel: { color: colors.muted, fontSize: 8, letterSpacing: 0.8, fontWeight: '900', marginTop: 4 },
  metricMini: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 12, paddingTop: 9 },
  metricMiniText: { color: colors.teal, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  exportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  exportTitle: { color: colors.ink, fontFamily: 'monospace', fontSize: 11, fontWeight: '700' },
  exportActions: { flexDirection: 'row', gap: 9 },
  copyButton: { flex: 1 },
  spreadsheetButton: { flex: 1 },
  copyStatus: { color: colors.teal, fontSize: 10, fontWeight: '700', marginTop: 9, textAlign: 'center' },
});
