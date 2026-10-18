import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FormField } from '@intuitui-labs/form-builder-engine';
import type { Entity, Standing } from '../domain/types';
import { colors, radii, sansFont, serifFont } from '../theme';

export function AppPage({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function FeedoraMark({ size = 26 }: { size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size / 3 }]}>
      <View style={[styles.markBar, { height: size * 0.35 }]} />
      <View style={[styles.markBar, { height: size * 0.65 }]} />
      <View style={[styles.markBar, { height: size * 0.45 }]} />
    </View>
  );
}

export function BrandHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.brandHeader}>
      <View style={styles.brandLine}>
        <View style={styles.brandGroup}>
          <FeedoraMark />
          <Text style={styles.brandLogo}>Feedora</Text>
          <Text style={styles.brandNameMuted}>/ VOICE ECONOMY</Text>
        </View>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>HMSAM</Text>
        </View>
      </View>
      <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroSubtitle}>{subtitle}</Text>
    </View>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function Tag({
  children,
  tone = 'violet',
}: {
  children: ReactNode;
  tone?: 'violet' | 'teal' | 'gold' | 'slate' | 'rose';
}) {
  const box =
    tone === 'teal'
      ? styles.tagTeal
      : tone === 'gold'
        ? styles.tagGold
        : tone === 'slate'
          ? styles.tagSlate
          : tone === 'rose'
            ? styles.tagRose
            : styles.tagViolet;
  const text =
    tone === 'teal'
      ? styles.tagTextTeal
      : tone === 'gold'
        ? styles.tagTextGold
        : tone === 'slate'
          ? styles.tagTextSlate
          : tone === 'rose'
            ? styles.tagTextRose
            : styles.tagTextViolet;
  return (
    <View style={[styles.tag, box]}>
      <Text style={[styles.tagText, text]}>{children}</Text>
    </View>
  );
}

export function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  disabled = false,
  secondary = false,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        secondary ? styles.actionButtonSecondary : styles.actionButtonPrimary,
        compact && styles.actionButtonCompact,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
    >
      <Text
        style={[
          styles.actionText,
          secondary ? styles.actionTextSecondary : styles.actionTextPrimary,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Meter({
  percent,
  color = colors.primary,
  height = 7,
}: {
  percent: number;
  color?: string;
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View
      style={[styles.meterTrack, { height }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
    >
      <View style={[styles.meterFill, { width: `${clamped}%`, backgroundColor: color, height }]} />
    </View>
  );
}

export function StepMeter({
  percent,
  effortCompleted,
  effortTotal,
  eta,
}: {
  percent: number;
  effortCompleted: number;
  effortTotal: number;
  eta?: string;
}) {
  return (
    <View style={styles.stepMeter}>
      <View style={styles.stepMeterRow}>
        <Text style={styles.stepMeterLabel}>Survey progress</Text>
        <Text style={styles.stepMeterValue}>{percent}%</Text>
      </View>
      <Meter percent={percent} color={colors.primary} height={8} />
      <View style={styles.stepMeterFootRow}>
        <Text style={styles.stepMeterFoot}>
          {effortCompleted} / {effortTotal} items answered
        </Text>
        {eta ? <Text style={styles.stepMeterFoot}>{eta}</Text> : null}
      </View>
    </View>
  );
}

export function LevelProgress({
  standing,
  totalPoints,
  compact = false,
}: {
  standing: Standing;
  totalPoints: number;
  compact?: boolean;
}) {
  return (
    <View style={[styles.levelProgress, compact && styles.levelProgressCompact]}>
      <View style={styles.levelRow}>
        <View style={[styles.levelDot, { backgroundColor: standing.color }]} />
        <Text style={[styles.levelName, { color: standing.color }]}>{standing.title}</Text>
        <Text style={styles.levelPoints}>
          L{standing.level} · {totalPoints.toLocaleString()} pts
        </Text>
      </View>
      {standing.next_title ? (
        <>
          <Meter percent={standing.progress} color={standing.color} height={6} />
          <Text style={styles.levelNext}>
            {standing.points_needed.toLocaleString()} pts to {standing.next_title}
          </Text>
        </>
      ) : (
        <Text style={styles.levelNext}>Top level reached 🏆</Text>
      )}
    </View>
  );
}

export function PointsToast({
  points,
  label,
  onDismiss,
}: {
  points: number;
  label?: string;
  onDismiss: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.toast}>
      <Text style={styles.toastPoints}>+{points}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.toastTitle}>Voice points earned</Text>
        {label ? (
          <Text numberOfLines={2} style={styles.toastLabel}>
            {label}
          </Text>
        ) : null}
      </View>
      <Text style={styles.toastDismiss}>✕</Text>
    </Pressable>
  );
}

export function EntityCard({
  entity,
  memberCount,
  selected,
  onSelect,
}: {
  entity: Entity;
  memberCount: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.entityCard,
        selected && { borderColor: colors.ink, backgroundColor: colors.paper },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={[styles.entityBadge, { backgroundColor: colors.primarySoft }]}>
        <Text style={[styles.entityBadgeText, { color: colors.primaryDeep }]}>
          {entity.type.slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.entityName}>{entity.name}</Text>
        <Text style={styles.entityTagline}>{entity.tagline}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.entityMembers}>{memberCount}</Text>
        <Text style={styles.entityMembersLabel}>contributors</Text>
      </View>
    </Pressable>
  );
}

export function ConstructBar({
  label,
  mean,
  score,
  interpretation,
  color,
  answered,
  itemCount,
}: {
  label: string;
  mean: number;
  score: number;
  interpretation: string;
  color: string;
  answered: number;
  itemCount: number;
}) {
  return (
    <View style={styles.construct}>
      <View style={styles.constructRow}>
        <Text style={styles.constructLabel}>{label}</Text>
        <Text style={[styles.constructMean, { color }]}>{score}%</Text>
      </View>
      <Meter percent={score} color={color} height={7} />
      <Text style={styles.constructFoot}>
        mean {mean.toFixed(2)}/5 · {interpretation} · {answered}/{itemCount} items
      </Text>
    </View>
  );
}

export function ContributorRow({
  rank,
  avatar,
  name,
  points,
  standing,
  isYou,
}: {
  rank: number;
  avatar: string;
  name: string;
  points: number;
  standing: Standing;
  isYou: boolean;
}) {
  return (
    <View style={[styles.contributor, isYou && styles.contributorYou]}>
      <Text style={styles.rank}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}</Text>
      <Text style={styles.avatar}>{avatar}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.contributorName}>
          {name} {isYou ? <Text style={styles.youTag}>YOU</Text> : null}
        </Text>
        <View style={styles.contributorMetaRow}>
          <View style={[styles.miniDot, { backgroundColor: standing.color }]} />
          <Text style={styles.contributorMeta}>{standing.title}</Text>
        </View>
      </View>
      <Text style={styles.contributorPoints}>{points.toLocaleString()}</Text>
    </View>
  );
}

const EMOJI_MAP: Record<number, string> = { 1: '😠', 2: '🙁', 3: '😐', 4: '🙂', 5: '😊' };

export function FieldControl({
  field,
  value,
  error,
  onChange,
  readOnly = false,
}: {
  field: FormField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  readOnly?: boolean;
}) {
  const [focused, setFocused] = useState(false);

  if (field.type === 'heading') return <Text style={styles.formHeading}>{field.label}</Text>;
  if (field.type === 'divider') return <View style={styles.fieldDivider} />;

  const current = value === undefined || value === null ? '' : String(value);
  const min = field.min ?? 1;
  const max = field.max ?? 5;
  const scaleValues = Array.from(
    { length: Math.max(1, Math.min(10, max - min + 1)) },
    (_, index) => min + index,
  );

  return (
    <View style={styles.fieldWrap}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{field.label ?? field.name}</Text>
        {field.required ? <Text style={styles.requiredMark}>REQUIRED</Text> : null}
      </View>
      {field.helperText ? <Text style={styles.fieldHelperText}>{field.helperText}</Text> : null}

      {field.type === 'likert' || field.type === 'slider' ? (
        <View>
          <View style={styles.scaleRow}>
            {scaleValues.map((point) => {
              const selected = Number(value) === point;
              return (
                <Pressable
                  key={point}
                  accessibilityRole="button"
                  disabled={readOnly}
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${field.label ?? field.name}: ${point} of ${max}`}
                  accessibilityHint="Select rating value"
                  hitSlop={{ top: 6, bottom: 6, left: 3, right: 3 }}
                  onPress={() => onChange(point)}
                  style={({ pressed }) => [
                    styles.scalePoint,
                    selected && styles.scalePointSelected,
                    pressed && !readOnly && { opacity: 0.75 },
                  ]}
                >
                  <Text style={styles.scaleNumber}>{EMOJI_MAP[point] ?? point}</Text>
                  <Text style={[styles.scaleValue, selected && styles.scaleValueSelected]}>
                    {point}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.scaleCaptionRow}>
            <Text style={styles.scaleCaption}>STRONGLY DISAGREE</Text>
            <Text style={styles.scaleCurrent}>
              {current === '' ? 'Select score' : `${current} / ${max}`}
            </Text>
            <Text style={styles.scaleCaption}>STRONGLY AGREE</Text>
          </View>
        </View>
      ) : field.type === 'select' ? (
        <View style={styles.choiceList}>
          {(field.options ?? []).map((option) => {
            const selected = current === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                disabled={readOnly}
                accessibilityState={{ selected }}
                onPress={() => onChange(option.value)}
                style={({ pressed }) => [
                  styles.choice,
                  selected && styles.choiceSelected,
                  pressed && !readOnly && { opacity: 0.85 },
                ]}
              >
                <View
                  style={[styles.choiceIndicator, selected && styles.choiceIndicatorSelected]}
                >
                  {selected ? <View style={styles.choiceIndicatorCore} /> : null}
                </View>
                <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <TextInput
          accessibilityLabel={field.label ?? field.name}
          editable={!readOnly}
          value={current}
          onChangeText={(text) =>
            onChange(field.type === 'number' && text !== '' ? Number(text) : text)
          }
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={field.placeholder ?? ''}
          placeholderTextColor={colors.faint}
          keyboardType={field.type === 'number' ? 'numeric' : 'default'}
          multiline={field.type === 'textarea'}
          style={[styles.input, focused && styles.inputFocused, error && styles.inputError]}
        />
      )}

      {error ? (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  scrollContent: { flexGrow: 1, paddingBottom: 48 },
  content: {
    width: '100%',
    maxWidth: 740,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 12,
  },

  brandHeader: { paddingTop: 6, paddingBottom: 16 },
  brandLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mark: {
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 2.5,
    borderRadius: 7,
  },
  markBar: { width: 3, borderRadius: 2, backgroundColor: '#FFFFFF' },
  brandLogo: {
    fontSize: 22,
    color: colors.ink,
    fontFamily: serifFont,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  brandNameMuted: {
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.muted,
    fontWeight: '700',
    marginLeft: 2,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.primarySoft,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryDeep,
    letterSpacing: 0.6,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  heroTitle: {
    color: colors.ink,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '400',
    fontFamily: serifFont,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    color: colors.muted,
    fontSize: 14.5,
    lineHeight: 22,
    marginTop: 8,
    maxWidth: 580,
    fontFamily: sansFont,
  },

  panel: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.medium,
    padding: 22,
    marginBottom: 16,
    shadowColor: '#14140F',
    shadowOpacity: 0.03,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },

  tag: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  tagViolet: { backgroundColor: colors.primarySoft },
  tagTeal: { backgroundColor: colors.greenLight },
  tagGold: { backgroundColor: colors.amberLight },
  tagSlate: { backgroundColor: colors.slateSoft },
  tagRose: { backgroundColor: colors.roseSoft },
  tagText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.3 },
  tagTextViolet: { color: colors.primaryDeep },
  tagTextTeal: { color: colors.green },
  tagTextGold: { color: colors.amber },
  tagTextSlate: { color: colors.muted },
  tagTextRose: { color: colors.rose },

  sectionHeading: { marginTop: 4, marginBottom: 12 },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontFamily: sansFont,
  },
  sectionDetail: {
    color: colors.muted,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
  },

  actionButton: {
    minHeight: 46,
    borderRadius: radii.small,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonPrimary: { backgroundColor: colors.ink },
  actionButtonSecondary: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderWidth: 1,
  },
  actionButtonCompact: { minHeight: 38, borderRadius: radii.small, paddingHorizontal: 12 },
  actionButtonDisabled: { opacity: 0.5 },
  actionButtonPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  actionText: { fontSize: 13.5, fontWeight: '600', letterSpacing: 0.2 },
  actionTextPrimary: { color: '#FFFFFF' },
  actionTextSecondary: { color: colors.ink },

  meterTrack: { borderRadius: radii.pill, backgroundColor: colors.hover, overflow: 'hidden' },
  meterFill: { borderRadius: radii.pill },

  stepMeter: { marginBottom: 16, gap: 8 },
  stepMeterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepMeterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  stepMeterValue: { fontSize: 13, fontWeight: '800', color: colors.primaryDeep },
  stepMeterFootRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stepMeterFoot: { fontSize: 11.5, color: colors.faint, fontWeight: '500' },

  levelProgress: { gap: 8 },
  levelProgressCompact: { gap: 6 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  levelDot: { width: 9, height: 9, borderRadius: 5 },
  levelName: { fontSize: 14, fontWeight: '700' },
  levelPoints: { marginLeft: 'auto', fontSize: 12.5, fontWeight: '700', color: colors.ink },
  levelNext: { fontSize: 11.5, color: colors.muted, fontWeight: '500' },

  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.amberLight,
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: radii.medium,
    padding: 12,
    marginBottom: 14,
  },
  toastPoints: { fontSize: 20, fontWeight: '800', color: colors.amber },
  toastTitle: { fontSize: 11.5, fontWeight: '700', color: colors.ink },
  toastLabel: { fontSize: 11, color: colors.muted, marginTop: 1 },
  toastDismiss: { fontSize: 13, color: colors.amber, fontWeight: '700', paddingHorizontal: 4 },

  entityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.medium,
    padding: 14,
    marginBottom: 10,
  },
  entityBadge: {
    width: 38,
    height: 38,
    borderRadius: radii.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entityBadgeText: { fontSize: 12, fontWeight: '800' },
  entityName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  entityTagline: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  entityMembers: { fontSize: 15, fontWeight: '800', color: colors.ink },
  entityMembersLabel: {
    fontSize: 9.5,
    color: colors.faint,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  construct: { marginBottom: 16, gap: 7 },
  constructRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  constructLabel: { fontSize: 13.5, fontWeight: '700', color: colors.ink, flex: 1 },
  constructMean: { fontSize: 14.5, fontWeight: '800' },
  constructFoot: { fontSize: 10.5, color: colors.faint, fontWeight: '500' },

  contributor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  contributorYou: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.small,
    paddingHorizontal: 10,
    borderBottomWidth: 0,
  },
  rank: { width: 26, textAlign: 'center', fontSize: 13, fontWeight: '700', color: colors.muted },
  avatar: { fontSize: 22 },
  contributorName: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  youTag: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.primaryDeep,
    backgroundColor: colors.paper,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  contributorMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  miniDot: { width: 6, height: 6, borderRadius: 3 },
  contributorMeta: { fontSize: 11, color: colors.muted, fontWeight: '500' },
  contributorPoints: { fontSize: 13.5, fontWeight: '800', color: colors.ink },

  formHeading: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '500',
    marginTop: 18,
    marginBottom: 6,
    fontFamily: serifFont,
  },
  fieldDivider: { height: 1, backgroundColor: colors.line, marginVertical: 12 },
  fieldWrap: { marginBottom: 18 },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 13.5,
    fontWeight: '600',
    flex: 1,
    paddingRight: 8,
  },
  requiredMark: { fontSize: 9.5, color: colors.rose, fontWeight: '700', letterSpacing: 0.5 },
  fieldHelperText: { fontSize: 11.5, color: colors.muted, marginBottom: 8, marginTop: -2 },

  scaleRow: { flexDirection: 'row', gap: 6 },
  scalePoint: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 52,
    minHeight: 46,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  scalePointSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  scaleNumber: { fontSize: 15 },
  scaleValue: { fontSize: 10, color: colors.muted, fontWeight: '700' },
  scaleValueSelected: { color: '#FFFFFF' },
  scaleCaptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  scaleCaption: { color: colors.faint, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.6 },
  scaleCurrent: { color: colors.primaryDeep, fontSize: 11, fontWeight: '700' },

  choiceList: { gap: 8 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  choiceIndicatorSelected: { borderColor: colors.primary },
  choiceIndicatorCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  choiceText: { flex: 1, fontSize: 13.5, color: colors.ink, fontWeight: '500' },
  choiceTextSelected: { color: colors.primaryDeep, fontWeight: '700' },

  input: {
    minHeight: 46,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.ink,
    fontSize: 14,
  },
  inputFocused: { borderColor: colors.primary, borderWidth: 1.5 },
  inputError: { borderColor: colors.rose },
  errorText: { color: colors.rose, fontSize: 11.5, lineHeight: 16, marginTop: 6, fontWeight: '500' },
});
