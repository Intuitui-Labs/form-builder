import { Text, View, StyleSheet } from 'react-native';
import { AppPage, BrandHeader, Notice, Panel, SectionHeading, Tag } from '../components/EngineUi';
import { colors } from '../theme';

const rows = [
  ['Local engine package', '@intuitui-labs/form-builder-engine (local file:..)'],
  ['Expo / React Native', '57.0.27 / 0.86.3'],
  ['React', '19.2.3'],
  ['Form Core / Zod', '0.42.1 / 4.6.5'],
  ['Field presentation', 'Supplied by this showcase (React Native controls)'],
];

export default function CompatibilityScreen() {
  return (
    <AppPage>
      <BrandHeader
        eyebrow="Compatibility notes"
        title="What the package is—and isn’t."
        subtitle="A practical test report for the published artifact, plus evidence on the React Native form-builder landscape."
      />

      <Notice
        title="The absolute claim is too broad"
        body="React Native form-builder packages do exist. A more defensible differentiator is a fresh, headless, schema-driven engine intended to power native renderers—rather than claiming the category is empty."
        tone="amber"
      />

      <Notice
        title="Submit regression verified resolved"
        body="After a field reports an error, correcting it now synchronizes internal TanStack errorMap state and clears field errors. Subsequent submit attempts successfully proceed to execute onSubmit."
        tone="teal"
      />

      <Notice
        title="TanStack advisory patched"
        body="@tanstack/form-core upgraded to ^0.42.1, resolving CVE-2024-57068 / GHSA-ggv3-vmgw-xv2q. Prototype pollution guards added to FormHydrator and formula injection protection enabled on AnalyticsEngine exports."
        tone="teal"
      />

      <Panel>
        <View style={styles.summaryHead}><Tag tone="teal">INSTALL + BUNDLE CHECK</Tag><Text style={styles.summaryVersion}>0.1.0</Text></View>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.factRow}>
            <Text style={styles.factLabel}>{label}</Text>
            <Text style={styles.factValue}>{value}</Text>
          </View>
        ))}
      </Panel>

      <SectionHeading title="Naming mismatch to fix" detail="The published artifact installs under one name; its embedded README points to another." />
      <Panel style={styles.mismatchPanel}>
        <Text style={styles.mismatchTitle}>The package you can install</Text>
        <Text selectable style={styles.packageName}>@intuitui-labs/form-builder-engine</Text>
        <Text style={styles.mismatchBody}>The singular spelling (@intuitui-lab/…) returns npm 404. Also, the published README tells readers to install @intuitui-labs/form-builder and import its subpaths; that separate package currently returns 404. Use the engine package name above in the README and examples.</Text>
      </Panel>

      <SectionHeading title="Verified engine surface" detail="The package is framework-agnostic in presentation and does not ship native widgets." />
      <Panel>
        <View style={styles.bullet}><Text style={styles.bulletMark}>01</Text><Text style={styles.bulletText}><Text style={styles.bold}>State + validation:</Text> set field values, subscribe to state, validate fields/forms, and submit.</Text></View>
        <View style={styles.bullet}><Text style={styles.bulletMark}>02</Text><Text style={styles.bulletText}><Text style={styles.bold}>Wizard flow:</Text> page-by-page validation and next/back navigation through MultiStepFormManager.</Text></View>
        <View style={styles.bullet}><Text style={styles.bulletMark}>03</Text><Text style={styles.bulletText}><Text style={styles.bold}>Hydration:</Text> JSON field arrays, defaults, rule definitions, and registered custom validators.</Text></View>
        <View style={styles.bullet}><Text style={styles.bulletMark}>04</Text><Text style={styles.bulletText}><Text style={styles.bold}>Data utilities:</Text> response aggregation, CSV, SpreadsheetML XML, and static React source output.</Text></View>
        <View style={styles.boundary}><Text style={styles.boundaryTitle}>Renderer responsibilities in this version</Text><Text style={styles.boundaryBody}>The app supplies inputs, selects, ratings, spacing, and accessibility semantics. The package’s schema includes a conditions property, but the current multi-step manager flattens all page fields and validates each one; conditional visibility/repeater behavior is not handled here. Date, file, checkbox, and repeat-group controls are not among the declared field types.</Text></View>
      </Panel>

      <SectionHeading title="Existing native packages" detail="Counterexamples to “there isn’t any React Native form builder.” These are real packages, but their npm releases are old." />
      <Panel>
        <Alternative name="react-native-form-builder" version="1.0.16" date="Last registry modification: 2022-06-26" url="github.com/bietkul/react-native-form-builder" />
        <Alternative name="react-native-paper-form-builder" version="2.1.2" date="Last registry modification: 2022-05-14" url="github.com/fateh999/react-native-paper-form-builder" />
        <Alternative name="react-native-jsonschema-form" version="0.0.8" date="Last registry modification: 2022-05-14" url="npmjs.com/package/react-native-jsonschema-form" last />
      </Panel>

      <Text style={styles.footer}>These alternatives refute “none exist”; their age and different feature scope leave room for a modern headless engine. Package metadata and docs were checked on 2026-10-10.</Text>
    </AppPage>
  );
}

function Alternative({ name, version, date, url, last = false }: { name: string; version: string; date: string; url: string; last?: boolean }) {
  return (
    <View style={[styles.altRow, last && styles.altRowLast]}>
      <View style={styles.altTop}><Text style={styles.altName}>{name}</Text><Text style={styles.altVersion}>{version}</Text></View>
      <Text style={styles.altDate}>{date}</Text>
      <Text selectable style={styles.altUrl}>{url}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  summaryVersion: { color: colors.teal, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line },
  factLabel: { flex: 0.82, color: colors.muted, fontSize: 10, fontWeight: '600' },
  factValue: { flex: 1.18, color: colors.ink, fontSize: 10, fontWeight: '800', textAlign: 'right' },
  mismatchPanel: { borderColor: '#F5DDC1', backgroundColor: '#FFFCF7' },
  mismatchTitle: { color: colors.amber, fontSize: 11, fontWeight: '900', marginBottom: 8 },
  packageName: { color: colors.ink, fontSize: 12, fontFamily: 'monospace', fontWeight: '800', marginBottom: 9 },
  mismatchBody: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 13 },
  bulletMark: { width: 24, color: colors.violet, fontSize: 9, fontWeight: '900', paddingTop: 2 },
  bulletText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17 },
  bold: { color: colors.ink, fontWeight: '800' },
  boundary: { borderRadius: 14, padding: 13, backgroundColor: colors.slateSoft, marginTop: 4 },
  boundaryTitle: { color: colors.ink, fontSize: 10, fontWeight: '900', marginBottom: 5 },
  boundaryBody: { color: colors.muted, fontSize: 10, lineHeight: 16 },
  altRow: { borderBottomColor: colors.line, borderBottomWidth: 1, paddingVertical: 12 },
  altRowLast: { borderBottomWidth: 0, paddingBottom: 1 },
  altTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  altName: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: '800' },
  altVersion: { color: colors.violet, fontSize: 10, fontWeight: '900' },
  altDate: { color: colors.muted, fontSize: 9, marginTop: 4 },
  altUrl: { color: colors.faint, fontSize: 9, fontFamily: 'monospace', marginTop: 4 },
  footer: { color: colors.faint, fontSize: 9, lineHeight: 14, paddingHorizontal: 4, marginBottom: 18 },
});
