import type { ReactNode } from 'react';
import { useState, useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaskTokenizer } from '@intuitui-labs/form-builder-engine';
import { CountryDialRegistry, type CountryDialItem, type BranchSwitchImpact } from '@intuitui-labs/form-builder-engine';
import { colors, radii } from '../theme';

export type DisplayField = {
  id?: string;
  name: string;
  type: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  content?: string;
  options?: { label: string; value: string; description?: string; badge?: string; imageSrc?: string }[];
  min?: number;
  max?: number;
  scaleType?: 'emoji' | 'numeric';
  formatMask?: string;
  helperText?: string;
  sensitive?: boolean;
  privacyRationale?: string;
  semanticIntent?: string;
  clarification?: {
    title?: string;
    body: string;
    media?: { type: string; url: string; alt: string; caption?: string };
    defaultExpanded?: boolean;
  };
  media?: {
    type: string;
    url: string;
    alt: string;
    caption?: string;
  };
  visualization?: {
    visualizationType: string;
    title: string;
    description?: string;
    metrics: { label: string; value: number | string; unit?: string }[];
  };
};

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

export function BrandHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <View style={styles.brandHeader}>
      <View style={styles.brandLine}>
        <View style={styles.brandMark}><View style={styles.brandMarkInner} /></View>
        <Text style={styles.brandName}>FIELDNOTES <Text style={styles.brandNameMuted}>/ ENGINE LAB</Text></Text>
        <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>SDK 57</Text></View>
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

export function Tag({ children, tone = 'violet' }: { children: ReactNode; tone?: 'violet' | 'teal' | 'amber' | 'slate' }) {
  const toneStyle = tone === 'teal' ? styles.tagTeal : tone === 'amber' ? styles.tagAmber : tone === 'slate' ? styles.tagSlate : styles.tagViolet;
  return <View style={[styles.tag, toneStyle]}><Text style={[styles.tagText, tone === 'teal' ? styles.tagTextTeal : tone === 'amber' ? styles.tagTextAmber : tone === 'slate' ? styles.tagTextSlate : styles.tagTextViolet]}>{children}</Text></View>;
}

export function SectionHeading({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionHeadingText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function ActionButton({ label, onPress, disabled = false, secondary = false, compact = false }: {
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
      <Text style={[styles.actionText, secondary ? styles.actionTextSecondary : styles.actionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

export function ProgressSteps({
  steps,
  current,
  inspectedIndex,
  onStepPress,
}: {
  steps: string[];
  current: number;
  inspectedIndex?: number;
  onStepPress?: (index: number) => void;
}) {
  const viewIndex = inspectedIndex ?? current;
  const isPeeking = inspectedIndex !== undefined && inspectedIndex !== current;

  return (
    <View style={styles.progressWrap} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: steps.length, now: current + 1 }}>
      <View style={styles.progressRail}>
        {steps.map((step, index) => {
          const isInspected = index === viewIndex;
          const isDone = index < current;
          const isCurrentActive = index === current;

          return (
            <Pressable
              key={step}
              accessibilityRole="tab"
              accessibilityState={{ selected: isInspected }}
              accessibilityLabel={`Step ${index + 1}: ${step}`}
              onPress={() => onStepPress?.(index)}
              style={styles.progressItem}
            >
              <View
                style={[
                  styles.progressDot,
                  (isInspected || isCurrentActive) && styles.progressDotActive,
                  isDone && styles.progressDotDone,
                  isPeeking && isInspected && styles.progressDotPeeking,
                ]}
              >
                <Text style={[styles.progressNumber, (isInspected || isCurrentActive || isDone) && styles.progressNumberActive]}>
                  {isDone ? '✓' : index + 1}
                </Text>
              </View>
              <Text numberOfLines={1} style={[styles.progressLabel, isInspected && styles.progressLabelActive]}>
                {step}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${((current + 1) / steps.length) * 100}%` }]} /></View>
    </View>
  );
}

export function PeekNoticeBar({
  stepIndex,
  totalSteps,
  stepTitle,
  onReturn,
  impact,
  onSwitchBranch,
}: {
  stepIndex: number;
  totalSteps: number;
  stepTitle: string;
  onReturn: () => void;
  impact?: BranchSwitchImpact | null;
  onSwitchBranch?: () => void;
}) {
  return (
    <View style={styles.peekNotice}>
      <View style={styles.peekNoticeLeft}>
        <View style={styles.peekBadgeRow}>
          <Text style={styles.peekNoticeBadge}>👁️ PEEK PREVIEW</Text>
          <Text style={styles.peekReadOnlyTag}>READ-ONLY</Text>
          {impact?.isConditional ? (
            <Text style={styles.peekBranchTag}>🌿 ALTERNATE BRANCH</Text>
          ) : impact?.isActivePath ? (
            <Text style={styles.peekActivePathTag}>⏩ ACTIVE TRAJECTORY</Text>
          ) : null}
        </View>
        <Text style={styles.peekNoticeTitle}>Step {stepIndex + 1} of {totalSteps}: {stepTitle}</Text>
        {impact?.prerequisites && impact.prerequisites.length > 0 ? (
          <Text style={styles.peekPrereqText}>
            ⚡ Prerequisite: {impact.prerequisites.map((p) => `${p.fieldLabel || p.field} = ${p.expectedValue} (current: ${String(p.currentValue ?? 'unset')})`).join('; ')}
          </Text>
        ) : null}
        <Text style={styles.peekNoticeDesc}>
          {impact?.spokenExplanation ?? 'Inspect future questions. Values are protected until validation passes.'}
        </Text>
      </View>
      <View style={styles.peekActionsRow}>
        {impact?.canSwitch && onSwitchBranch ? (
          <Pressable
            accessibilityRole="button"
            onPress={onSwitchBranch}
            style={[styles.peekSwitchBtn, impact.hasDataLoss ? styles.peekSwitchBtnWarning : null]}
          >
            <Text style={styles.peekSwitchBtnText}>
              {impact.hasDataLoss ? 'Switch branch ⚠️' : 'Switch branch →'}
            </Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onReturn} style={styles.peekNoticeBtn}>
          <Text style={styles.peekNoticeBtnText}>Return to step</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function CoverPageCard({
  title,
  description,
  badge,
  estimatedTime,
  onStart,
}: {
  title: string;
  description?: string;
  badge?: string;
  estimatedTime?: string;
  onStart: () => void;
}) {
  return (
    <View style={styles.coverCard}>
      <View style={styles.coverBadgeRow}>
        <View style={styles.coverBadge}>
          <Text style={styles.coverBadgeText}>{badge || 'WELCOME'}</Text>
        </View>
        {estimatedTime ? <Text style={styles.coverTimeText}>⏱️ {estimatedTime}</Text> : null}
      </View>
      <Text style={styles.coverTitle}>{title}</Text>
      {description ? <Text style={styles.coverDesc}>{description}</Text> : null}
      <View style={styles.coverActionRow}>
        <ActionButton label="Begin questionnaire →" onPress={onStart} />
      </View>
    </View>
  );
}

export function DomainPicker({
  domains,
  selectedId,
  onSelect,
}: {
  domains: { id: string; title: string; domain: string; badge: string; icon: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.domainPickerContainer}>
      <Text style={styles.domainPickerLabel}>EXPLORE DOMAIN CAPABILITIES</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.domainPickerScroll}
      >
        {domains.map((item) => {
          const isSelected = item.id === selectedId;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(item.id)}
              style={({ pressed }) => [
                styles.domainTab,
                isSelected && styles.domainTabSelected,
                pressed && styles.choicePressed,
              ]}
            >
              <Text style={styles.domainIcon}>{item.icon}</Text>
              <View style={styles.domainTabTextWrap}>
                <View style={styles.domainTabHeader}>
                  <Text style={[styles.domainTabDomain, isSelected && styles.domainTabDomainSelected]}>
                    {item.domain.toUpperCase()}
                  </Text>
                  <Text style={[styles.domainTabBadge, isSelected && styles.domainTabBadgeSelected]}>
                    {item.badge}
                  </Text>
                </View>
                <Text numberOfLines={1} style={[styles.domainTabTitle, isSelected && styles.domainTabTitleSelected]}>
                  {item.title}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function ClarificationAccordion({
  clarification,
}: {
  clarification: { title?: string; body: string; media?: { url: string; caption?: string } };
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.clarificationWrap}>
      <Pressable onPress={() => setOpen(!open)} style={styles.clarificationTrigger}>
        <Text style={styles.clarificationTriggerText}>💡 {clarification.title || 'Need clarification?'}</Text>
        <Text style={styles.clarificationTriggerChevron}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.clarificationBodyCard}>
          <Text style={styles.clarificationBodyText}>{clarification.body}</Text>
          {clarification.media?.caption ? (
            <Text style={styles.clarificationMediaCaption}>Reference: {clarification.media.caption}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function CountryDialModal({
  visible,
  selectedIso,
  onClose,
  onSelect,
}: {
  visible: boolean;
  selectedIso: string;
  onClose: () => void;
  onSelect: (item: CountryDialItem) => void;
}) {
  const [query, setQuery] = useState('');
  const countries = useMemo(() => CountryDialRegistry.search(query), [query]);

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Select Country Code</Text>
          <Pressable onPress={onClose}><Text style={styles.modalCloseText}>✕</Text></Pressable>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search country name or dial code (e.g. 44, France, +1)..."
          placeholderTextColor={colors.faint}
          style={styles.modalSearchInput}
          autoFocus
        />
        <ScrollView style={styles.modalCountryList} keyboardShouldPersistTaps="handled">
          {countries.map((c) => {
            const isSel = c.iso === selectedIso;
            return (
              <Pressable
                key={c.iso}
                onPress={() => {
                  onSelect(c);
                  onClose();
                }}
                style={[styles.modalCountryRow, isSel && styles.modalCountryRowSelected]}
              >
                <Text style={styles.modalCountryFlag}>{c.flag}</Text>
                <Text style={styles.modalCountryName}>{c.name}</Text>
                <Text style={styles.modalCountryDial}>{c.dialCode}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const EMOJI_MAP: Record<number, string> = {
  1: '😡',
  2: '🙁',
  3: '😐',
  4: '🙂',
  5: '🤩',
};

function renderRichContentLines(content: string) {
  const lines = content.split('\n');
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return <View key={idx} style={{ height: 6 }} />;
    }
    if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
      return (
        <Text key={idx} style={styles.richTextSubhead}>
          {trimmed.replace(/^#+\s*/, '')}
        </Text>
      );
    }
    if (trimmed.startsWith('• ') || trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      const bulletContent = trimmed.replace(/^[•*-]\s*/, '');
      return (
        <View key={idx} style={styles.richBulletRow}>
          <Text style={styles.richBulletDot}>•</Text>
          <Text style={styles.richBulletText}>{bulletContent}</Text>
        </View>
      );
    }
    return (
      <Text key={idx} style={styles.richTextBody}>
        {trimmed}
      </Text>
    );
  });
}

export function FieldControl({
  field,
  value,
  error,
  onChange,
  readOnly = false,
}: {
  field: DisplayField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  readOnly?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<CountryDialItem>(() => CountryDialRegistry.getAll()[0]!);
  const [calendarPresetsOpen, setCalendarPresetsOpen] = useState(false);

  const fieldType = field.type;

  if (fieldType === 'heading') {
    return <Text style={styles.formHeading}>{field.label}</Text>;
  }
  if (fieldType === 'divider') {
    return <View style={styles.fieldDivider} />;
  }

  if (fieldType === 'statement') {
    return (
      <View style={styles.statementCard}>
        <View style={styles.statementHeader}>
          <Text style={styles.statementBadge}>📋 VALUE STATEMENT</Text>
          {field.label ? <Text style={styles.statementHeading}>{field.label}</Text> : null}
        </View>
        <Text style={styles.statementQuote}>{field.content || field.placeholder || ''}</Text>
        {field.clarification ? <ClarificationAccordion clarification={field.clarification} /> : null}
      </View>
    );
  }

  if (fieldType === 'rich-text') {
    const rawContent = field.content || field.placeholder || '';
    return (
      <View style={styles.richTextCard}>
        {field.label ? (
          <View style={styles.richTextHeaderRow}>
            <Text style={styles.richTextBadge}>MARKDOWN BRIEF</Text>
            <Text style={styles.richTextHeading}>{field.label}</Text>
          </View>
        ) : null}
        {renderRichContentLines(rawContent)}
        {field.clarification ? <ClarificationAccordion clarification={field.clarification} /> : null}
      </View>
    );
  }

  if (fieldType === 'visualization') {
    const viz = field.visualization;
    return (
      <View style={styles.vizCard}>
        <View style={styles.vizHeader}>
          <Text style={styles.vizBadge}>📊 {viz?.visualizationType.toUpperCase() || 'METRIC'}</Text>
          <Text style={styles.vizTitle}>{viz?.title || field.label}</Text>
          {viz?.description ? <Text style={styles.vizDesc}>{viz.description}</Text> : null}
        </View>
        <View style={styles.vizMetricRow}>
          {viz?.metrics?.map((m) => (
            <View key={m.label} style={styles.vizMetricItem}>
              <Text style={styles.vizMetricVal}>{m.value}{m.unit ? ` ${m.unit}` : ''}</Text>
              <Text style={styles.vizMetricLabel}>{m.label}</Text>
            </View>
          ))}
        </View>
        {field.clarification ? <ClarificationAccordion clarification={field.clarification} /> : null}
      </View>
    );
  }

  if (fieldType === 'file' || fieldType === 'image-capture') {
    const isAttached = Boolean(value && typeof value === 'object');
    const attachment = isAttached ? (value as any) : null;
    return (
      <View style={styles.fieldWrap}>
        <View style={styles.fieldLabelRow}>
          <Text style={styles.fieldLabel}>{field.label ?? field.name}</Text>
          {field.required ? <Text style={styles.requiredMark}>REQUIRED</Text> : null}
        </View>
        {field.helperText ? <Text style={styles.fieldHelperText}>{field.helperText}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={readOnly}
          onPress={() => {
            if (isAttached) {
              onChange(undefined);
            } else {
              onChange({
                id: `att-${Date.now()}`,
                name: 'sample_spec.pdf',
                size: 245000,
                mimeType: 'application/pdf',
                localUri: 'file:///cache/sample_spec.pdf',
              });
            }
          }}
          style={({ pressed }) => [
            styles.uploadBox,
            isAttached && styles.uploadBoxAttached,
            readOnly && styles.inputDisabled,
            pressed && !readOnly && styles.choicePressed,
          ]}
        >
          <Text style={styles.uploadIcon}>{isAttached ? '📄' : '📎'}</Text>
          <View style={styles.uploadInfo}>
            <Text style={styles.uploadTitle}>
              {isAttached ? attachment.name : (field.placeholder || 'Tap to attach document / image')}
            </Text>
            <Text style={styles.uploadSub}>
              {isAttached ? `${Math.round(attachment.size / 1024)} KB • Tap to remove` : 'Supports PDF, PNG, JPG up to 10MB'}
            </Text>
          </View>
          <Text style={styles.uploadActionText}>{isAttached ? '✕' : 'Upload'}</Text>
        </Pressable>
        {field.privacyRationale ? (
          <View style={styles.privacyBadge}>
            <Text style={styles.privacyBadgeText}>🔒 {field.privacyRationale}</Text>
          </View>
        ) : null}
        {field.clarification ? <ClarificationAccordion clarification={field.clarification} /> : null}
        {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
      </View>
    );
  }

  const current = value === undefined || value === null ? '' : String(value);
  const options = field.options ?? [];
  const min = field.min ?? 1;
  const max = field.max ?? (fieldType === 'slider' ? 10 : 5);
  const scaleValues = Array.from({ length: Math.max(1, Math.min(10, max - min + 1)) }, (_, index) => min + index);
  const isEmoji = field.scaleType === 'emoji';
  const isDateField = field.semanticIntent === 'birth-date' || field.formatMask === 'YYYY-MM-DD';
  const isPhoneField = field.semanticIntent === 'contact-phone';

  return (
    <View style={styles.fieldWrap}>
      {field.media ? (
        <View style={styles.mediaCard}>
          <Text style={styles.mediaBadge}>🎬 QUESTION VISUAL STIMULUS</Text>
          {field.media.caption ? <Text style={styles.mediaCaption}>{field.media.caption}</Text> : null}
        </View>
      ) : null}
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{field.label ?? field.name}</Text>
        {field.required ? <Text style={styles.requiredMark}>REQUIRED</Text> : null}
      </View>
      {field.helperText ? <Text style={styles.fieldHelperText}>{field.helperText}</Text> : null}

      {fieldType === 'select' ? (
        <View style={styles.choiceList}>
          {options.map((option) => {
            const selected = current === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                disabled={readOnly}
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                onPress={() => onChange(option.value)}
                style={({ pressed }) => [
                  styles.choice,
                  selected && styles.choiceSelected,
                  readOnly && styles.inputDisabled,
                  pressed && !readOnly && styles.choicePressed,
                ]}
              >
                <View style={[styles.choiceIndicator, selected && styles.choiceIndicatorSelected]}>
                  {selected ? <View style={styles.choiceIndicatorCore} /> : null}
                </View>
                <View style={styles.choiceBody}>
                  <View style={styles.choiceHeaderRow}>
                    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option.label}</Text>
                    {option.badge ? <Text style={styles.choiceBadge}>{option.badge}</Text> : null}
                  </View>
                  {option.description ? <Text style={styles.choiceDesc}>{option.description}</Text> : null}
                </View>
                {selected ? <Text style={styles.choiceCheck}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : fieldType === 'likert' || fieldType === 'slider' ? (
        <View style={styles.scaleBlock}>
          <View style={styles.scaleRow}>
            {scaleValues.map((point) => {
              const selected = Number(value) === point;
              const displayText = isEmoji ? (EMOJI_MAP[point] ?? point) : point;
              return (
                <Pressable
                  key={point}
                  accessibilityRole="button"
                  disabled={readOnly}
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${field.label ?? field.name}: ${point}`}
                  onPress={() => onChange(point)}
                  style={({ pressed }) => [
                    styles.scalePoint,
                    selected && styles.scalePointSelected,
                    readOnly && styles.inputDisabled,
                    pressed && !readOnly && styles.scalePointPressed,
                  ]}
                >
                  <Text style={[styles.scaleNumber, selected && styles.scaleNumberSelected, isEmoji && styles.scaleEmoji]}>
                    {displayText}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.scaleCaptionRow}>
            <Text style={styles.scaleCaption}>
              {isEmoji ? 'NEEDS GROWTH' : fieldType === 'slider' ? 'LOW' : 'NOT AT ALL'}
            </Text>
            <Text style={styles.scaleCurrent}>{value === '' ? 'Select a score' : `${current} / ${max}`}</Text>
            <Text style={styles.scaleCaption}>
              {isEmoji ? 'EXCEPTIONAL' : fieldType === 'slider' ? 'HIGH' : 'VERY MUCH'}
            </Text>
          </View>
        </View>
      ) : isPhoneField ? (
        <View style={styles.phoneInputRow}>
          <Pressable
            disabled={readOnly}
            onPress={() => setCountryModalOpen(true)}
            style={styles.countryPickerBtn}
          >
            <Text style={styles.countryPickerFlag}>{selectedCountry.flag}</Text>
            <Text style={styles.countryPickerDial}>{selectedCountry.dialCode}</Text>
            <Text style={styles.countryPickerChevron}>▾</Text>
          </Pressable>
          <TextInput
            accessibilityLabel={field.label ?? field.name}
            editable={!readOnly}
            value={current}
            onChangeText={(text) => {
              const res = MaskTokenizer.maskPhone(text);
              onChange(res.formatted);
            }}
            placeholder="(555) 000-0000"
            placeholderTextColor={colors.faint}
            keyboardType="phone-pad"
            style={[styles.input, styles.phoneInputDigits, focused && styles.inputFocused, error && styles.inputError]}
          />
          <CountryDialModal
            visible={countryModalOpen}
            selectedIso={selectedCountry.iso}
            onClose={() => setCountryModalOpen(false)}
            onSelect={(c) => setSelectedCountry(c)}
          />
        </View>
      ) : isDateField ? (
        <View>
          <View style={styles.dateInputRow}>
            <TextInput
              accessibilityLabel={field.label ?? field.name}
              editable={!readOnly}
              value={current}
              onChangeText={(text) => {
                const res = MaskTokenizer.maskDate(text, 'YYYY-MM-DD');
                onChange(res.formatted);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.faint}
              keyboardType="numeric"
              maxLength={10}
              style={[styles.input, styles.dateInputFlex, focused && styles.inputFocused, error && styles.inputError]}
            />
            <Pressable
              disabled={readOnly}
              onPress={() => setCalendarPresetsOpen(!calendarPresetsOpen)}
              style={styles.calendarAffordanceBtn}
            >
              <Text style={styles.calendarAffordanceIcon}>📅</Text>
            </Pressable>
          </View>
          {calendarPresetsOpen ? (
            <View style={styles.calendarPresetsCard}>
              <Text style={styles.calendarPresetsLabel}>QUICK DATE SELECTIONS</Text>
              <View style={styles.calendarPresetsRow}>
                {['1990-01-01', '1995-05-15', '2000-10-20', '2026-10-13'].map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => {
                      onChange(d);
                      setCalendarPresetsOpen(false);
                    }}
                    style={styles.calendarPresetChip}
                  >
                    <Text style={styles.calendarPresetChipText}>{d}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <TextInput
          accessibilityLabel={field.label ?? field.name}
          editable={!readOnly}
          value={current}
          onChangeText={(text) => onChange(fieldType === 'number' && text !== '' ? Number(text) : text)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={field.placeholder ?? ''}
          placeholderTextColor={colors.faint}
          keyboardType={fieldType === 'email' ? 'email-address' : fieldType === 'number' ? 'numeric' : 'default'}
          autoCapitalize={fieldType === 'email' ? 'none' : 'sentences'}
          autoCorrect={fieldType !== 'email'}
          secureTextEntry={fieldType === 'password'}
          multiline={fieldType === 'textarea'}
          textAlignVertical={fieldType === 'textarea' ? 'top' : 'center'}
          style={[
            styles.input,
            fieldType === 'textarea' && styles.textarea,
            readOnly && styles.inputDisabled,
            focused && styles.inputFocused,
            error && styles.inputError,
          ]}
        />
      )}

      {field.clarification ? <ClarificationAccordion clarification={field.clarification} /> : null}

      {field.privacyRationale ? (
        <View style={styles.privacyBadge}>
          <Text style={styles.privacyBadgeText}>🔒 {field.privacyRationale}</Text>
        </View>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function Notice({ title, body, tone = 'teal' }: { title: string; body: string; tone?: 'teal' | 'amber' }) {
  const box = tone === 'amber' ? styles.noticeAmber : styles.noticeTeal;
  const titleColor = tone === 'amber' ? styles.noticeTitleAmber : styles.noticeTitleTeal;
  return <View style={[styles.notice, box]}><Text style={[styles.noticeTitle, titleColor]}>{title}</Text><Text style={styles.noticeBody}>{body}</Text></View>;
}

export function AutofillToolbar({
  onAutofillAddress,
  onAutofillContact,
  onAutofillSample,
  activeOrigin,
}: {
  onAutofillAddress: () => void;
  onAutofillContact: () => void;
  onAutofillSample?: () => void;
  activeOrigin?: string;
}) {
  return (
    <View style={styles.autofillBar}>
      <View style={styles.autofillHeader}>
        <Text style={styles.autofillBadge}>⚡ HEURISTIC AUTOFILL ENGINE</Text>
        {activeOrigin ? <Text style={styles.autofillOrigin}>✓ {activeOrigin}</Text> : null}
      </View>
      <View style={styles.autofillBtnRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Autofill Current Location via GPS or Geocoding"
          onPress={onAutofillAddress}
          style={({ pressed }) => [styles.autofillBtn, pressed && styles.autofillBtnPressed]}
        >
          <Text style={styles.autofillBtnIcon}>📍</Text>
          <Text style={styles.autofillBtnText}>GPS Address</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Autofill from Contact Picker"
          onPress={onAutofillContact}
          style={({ pressed }) => [styles.autofillBtn, pressed && styles.autofillBtnPressed]}
        >
          <Text style={styles.autofillBtnIcon}>📇</Text>
          <Text style={styles.autofillBtnText}>Contact Info</Text>
        </Pressable>

        {onAutofillSample ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fill Verified Sample Data"
            onPress={onAutofillSample}
            style={({ pressed }) => [styles.autofillBtn, styles.autofillBtnSample, pressed && styles.autofillBtnPressed]}
          >
            <Text style={styles.autofillBtnIcon}>✨</Text>
            <Text style={[styles.autofillBtnText, styles.autofillBtnTextSample]}>Sample Data</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function CodeBlock({ children }: { children: string }) {
  return <View style={styles.codeBlock}><Text selectable style={styles.codeText}>{children}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  scrollContent: { flexGrow: 1, paddingBottom: 36 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 10 },
  brandHeader: { paddingTop: 8, paddingBottom: 16 },
  brandLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  brandMark: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center', marginRight: 9, transform: [{ rotate: '-7deg' }] },
  brandMarkInner: { width: 10, height: 10, borderRadius: 4, backgroundColor: '#FFFFFF', transform: [{ rotate: '15deg' }] },
  brandName: { fontSize: 11, letterSpacing: 1.4, color: colors.ink, fontWeight: '800' },
  brandNameMuted: { color: colors.muted, fontWeight: '600' },
  livePill: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.tealSoft },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.teal },
  liveText: { fontSize: 10, fontWeight: '800', color: colors.teal, letterSpacing: 0.6 },
  eyebrow: { color: colors.violet, fontSize: 10, fontWeight: '800', letterSpacing: 1.7, marginBottom: 7 },
  heroTitle: { color: colors.ink, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -1 },
  heroSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7, maxWidth: 570 },
  panel: { backgroundColor: colors.paper, borderColor: colors.line, borderWidth: 1, borderRadius: radii.large, padding: 18, marginBottom: 14, shadowColor: '#1A2A47', shadowOpacity: 0.035, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 1 },
  tag: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 5 },
  tagViolet: { backgroundColor: colors.violetSoft },
  tagTeal: { backgroundColor: colors.tealSoft },
  tagAmber: { backgroundColor: colors.amberSoft },
  tagSlate: { backgroundColor: colors.slateSoft },
  tagText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.35 },
  tagTextViolet: { color: colors.violet },
  tagTextTeal: { color: colors.teal },
  tagTextAmber: { color: colors.amber },
  tagTextSlate: { color: colors.muted },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginTop: 8, marginBottom: 12 },
  sectionHeadingText: { flex: 1 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.35 },
  sectionDetail: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  actionButton: { minHeight: 50, borderRadius: 15, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  actionButtonPrimary: { backgroundColor: colors.violet },
  actionButtonSecondary: { backgroundColor: colors.paper, borderColor: colors.line, borderWidth: 1 },
  actionButtonCompact: { minHeight: 40, borderRadius: 12, paddingHorizontal: 12 },
  actionButtonDisabled: { opacity: 0.55 },
  actionButtonPressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  actionText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
  actionTextPrimary: { color: '#FFFFFF' },
  actionTextSecondary: { color: colors.ink },
  progressWrap: { marginBottom: 18 },
  progressRail: { flexDirection: 'row', justifyContent: 'space-between', gap: 5, marginBottom: 10 },
  progressItem: { flex: 1, alignItems: 'center', minWidth: 0 },
  progressDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  progressDotActive: { borderColor: colors.violet, backgroundColor: colors.violet },
  progressDotDone: { backgroundColor: colors.teal, borderColor: colors.teal },
  progressDotPeeking: { borderColor: '#F59E0B', backgroundColor: '#F59E0B' },
  progressNumber: { fontSize: 10, color: colors.muted, fontWeight: '800' },
  progressNumberActive: { color: '#FFFFFF' },
  progressLabel: { fontSize: 9, color: colors.faint, fontWeight: '700', marginTop: 5 },
  progressLabelActive: { color: colors.violet },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: colors.slateSoft, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: colors.violet },
  peekNotice: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  peekNoticeLeft: { flex: 1 },
  peekBadgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  peekNoticeBadge: { fontSize: 9, fontWeight: '800', color: '#B45309' },
  peekReadOnlyTag: { fontSize: 8, fontWeight: '800', color: '#92400E', backgroundColor: '#FEF3C7', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  peekBranchTag: { fontSize: 8, fontWeight: '800', color: '#047857', backgroundColor: '#D1FAE5', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  peekActivePathTag: { fontSize: 8, fontWeight: '800', color: '#4338CA', backgroundColor: '#E0E7FF', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  peekNoticeTitle: { fontSize: 12, fontWeight: '800', color: colors.ink },
  peekPrereqText: { fontSize: 10, fontWeight: '700', color: '#B45309', marginTop: 3 },
  peekNoticeDesc: { fontSize: 10, color: '#92400E', marginTop: 3, lineHeight: 14 },
  peekActionsRow: { flexDirection: 'column', gap: 6, alignItems: 'stretch' },
  peekNoticeBtn: { backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  peekNoticeBtnText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  peekSwitchBtn: { backgroundColor: colors.violet, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  peekSwitchBtnWarning: { backgroundColor: '#E11D48' },
  peekSwitchBtnText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  coverCard: { paddingVertical: 14, alignItems: 'flex-start' },
  coverBadgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 12 },
  coverBadge: { backgroundColor: colors.violetSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  coverBadgeText: { fontSize: 9, fontWeight: '800', color: colors.violet, letterSpacing: 0.8 },
  coverTimeText: { fontSize: 11, fontWeight: '700', color: colors.muted },
  coverTitle: { fontSize: 24, fontWeight: '800', color: colors.ink, lineHeight: 30, marginBottom: 8 },
  coverDesc: { fontSize: 13, lineHeight: 20, color: colors.muted, marginBottom: 18 },
  coverActionRow: { width: '100%' },
  fieldWrap: { marginBottom: 17 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  fieldLabel: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  requiredMark: { fontSize: 8, color: colors.faint, fontWeight: '800', letterSpacing: 0.75 },
  fieldHelperText: { fontSize: 10, color: colors.muted, marginBottom: 8, marginTop: -2 },
  input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FBFCFE', paddingHorizontal: 13, paddingVertical: 12, color: colors.ink, fontSize: 14 },
  inputDisabled: { opacity: 0.65, backgroundColor: '#F1F5F9' },
  textarea: { minHeight: 104, paddingTop: 13 },
  inputFocused: { borderColor: colors.violet, backgroundColor: '#FFFFFF' },
  inputError: { borderColor: colors.red },
  errorText: { color: colors.red, fontSize: 11, lineHeight: 16, marginTop: 6, fontWeight: '600' },
  phoneInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countryPickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 48, backgroundColor: '#FBFCFE', borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingHorizontal: 10 },
  countryPickerFlag: { fontSize: 18 },
  countryPickerDial: { fontSize: 12, fontWeight: '700', color: colors.ink },
  countryPickerChevron: { fontSize: 10, color: colors.muted },
  phoneInputDigits: { flex: 1 },
  dateInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateInputFlex: { flex: 1 },
  calendarAffordanceBtn: { width: 48, height: 48, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FBFCFE', alignItems: 'center', justifyContent: 'center' },
  calendarAffordanceIcon: { fontSize: 18 },
  calendarPresetsCard: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 10, marginTop: 8 },
  calendarPresetsLabel: { fontSize: 8, fontWeight: '800', color: colors.faint, letterSpacing: 0.8, marginBottom: 6 },
  calendarPresetsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  calendarPresetChip: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  calendarPresetChipText: { fontSize: 10, fontWeight: '700', color: colors.ink },
  choiceList: { gap: 8 },
  choice: { flexDirection: 'row', alignItems: 'center', minHeight: 47, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FBFCFE', paddingHorizontal: 12, paddingVertical: 10 },
  choiceSelected: { borderColor: colors.violet, backgroundColor: '#F7F5FF' },
  choicePressed: { opacity: 0.8 },
  choiceIndicator: { width: 17, height: 17, borderRadius: 9, borderWidth: 1.5, borderColor: '#BCC6D5', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  choiceIndicatorSelected: { borderColor: colors.violet },
  choiceIndicatorCore: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.violet },
  choiceText: { flex: 1, fontSize: 12, color: colors.ink, fontWeight: '600' },
  choiceTextSelected: { color: colors.violet, fontWeight: '800' },
  choiceCheck: { color: colors.violet, fontSize: 13, fontWeight: '900', marginLeft: 8 },
  scaleBlock: { paddingTop: 2 },
  scaleRow: { flexDirection: 'row', gap: 5 },
  scalePoint: { flex: 1, aspectRatio: 1, maxHeight: 42, minHeight: 31, borderRadius: 11, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FBFCFE', alignItems: 'center', justifyContent: 'center' },
  scalePointSelected: { backgroundColor: colors.violet, borderColor: colors.violet },
  scalePointPressed: { opacity: 0.78 },
  scaleNumber: { fontSize: 11, color: colors.muted, fontWeight: '800' },
  scaleNumberSelected: { color: '#FFFFFF' },
  scaleEmoji: { fontSize: 18 },
  scaleCaptionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  scaleCaption: { color: colors.faint, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  scaleCurrent: { color: colors.violet, fontSize: 10, fontWeight: '800' },
  fieldDivider: { height: 1, backgroundColor: colors.line, marginVertical: 8 },
  formHeading: { color: colors.ink, fontSize: 16, fontWeight: '800', marginTop: 4, marginBottom: 12 },
  notice: { borderRadius: 14, padding: 13, marginBottom: 14, borderWidth: 1 },
  noticeTeal: { backgroundColor: colors.tealSoft, borderColor: '#CBEAE2' },
  noticeAmber: { backgroundColor: colors.amberSoft, borderColor: '#F5DDC1' },
  noticeTitle: { fontSize: 11, fontWeight: '800', marginBottom: 4 },
  noticeTitleTeal: { color: colors.teal },
  noticeTitleAmber: { color: colors.amber },
  noticeBody: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  codeBlock: { backgroundColor: colors.navy, borderRadius: 14, padding: 14, marginBottom: 14 },
  codeText: { color: '#D9E4F7', fontFamily: 'monospace', fontSize: 10, lineHeight: 16 },
  richTextCard: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: colors.line },
  richTextHeaderRow: { marginBottom: 8 },
  richTextBadge: { fontSize: 8, fontWeight: '800', color: colors.violet, letterSpacing: 0.8, marginBottom: 3 },
  richTextHeading: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  richTextSubhead: { color: colors.ink, fontSize: 12, fontWeight: '800', marginTop: 4, marginBottom: 4 },
  richTextBody: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  richBulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 3, marginBottom: 2, paddingLeft: 2 },
  richBulletDot: { fontSize: 12, color: colors.violet, fontWeight: '900', marginRight: 6, lineHeight: 17 },
  richBulletText: { flex: 1, fontSize: 11, color: colors.muted, lineHeight: 17 },
  statementCard: { backgroundColor: '#FAF5FF', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#E9D5FF' },
  statementHeader: { marginBottom: 6 },
  statementBadge: { fontSize: 8, fontWeight: '800', color: colors.violet, letterSpacing: 0.8, marginBottom: 2 },
  statementHeading: { fontSize: 12, fontWeight: '800', color: colors.ink },
  statementQuote: { fontStyle: 'italic', fontSize: 12, lineHeight: 18, color: colors.ink },
  privacyBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderColor: colors.line, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 6 },
  privacyBadgeText: { fontSize: 9, color: colors.muted, fontWeight: '600' },
  clarificationWrap: { marginTop: 6, marginBottom: 4 },
  clarificationTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 3 },
  clarificationTriggerText: { fontSize: 10, fontWeight: '700', color: colors.violet },
  clarificationTriggerChevron: { fontSize: 9, color: colors.violet },
  clarificationBodyCard: { backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 10, padding: 10, marginTop: 4 },
  clarificationBodyText: { fontSize: 11, lineHeight: 16, color: colors.muted },
  clarificationMediaCaption: { fontSize: 9, color: colors.faint, fontStyle: 'italic', marginTop: 4 },
  vizCard: { backgroundColor: '#F5F3FF', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#DDD6FE' },
  vizHeader: { marginBottom: 10 },
  vizBadge: { color: colors.violet, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  vizTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  vizDesc: { color: colors.muted, fontSize: 11, marginTop: 2 },
  vizMetricRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  vizMetricItem: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#EDE9FE' },
  vizMetricVal: { color: colors.violet, fontSize: 15, fontWeight: '800' },
  vizMetricLabel: { color: colors.faint, fontSize: 9, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  uploadBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 13, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', backgroundColor: '#FBFCFE', padding: 12 },
  uploadBoxAttached: { borderStyle: 'solid', borderColor: colors.teal, backgroundColor: colors.tealSoft },
  uploadIcon: { fontSize: 20, marginRight: 10 },
  uploadInfo: { flex: 1 },
  uploadTitle: { fontSize: 12, fontWeight: '700', color: colors.ink },
  uploadSub: { fontSize: 10, color: colors.muted, marginTop: 2 },
  uploadActionText: { fontSize: 11, fontWeight: '800', color: colors.violet, paddingHorizontal: 8 },
  choiceBody: { flex: 1 },
  choiceHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  choiceBadge: { fontSize: 9, fontWeight: '800', color: colors.violet, backgroundColor: '#EDE9FE', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  choiceDesc: { fontSize: 10, color: colors.muted, marginTop: 2 },
  mediaCard: { backgroundColor: '#F1F5F9', borderRadius: 12, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: colors.line },
  mediaBadge: { fontSize: 9, fontWeight: '800', color: colors.slate, letterSpacing: 0.8 },
  mediaCaption: { fontSize: 11, color: colors.muted, marginTop: 2, fontWeight: '600' },
  domainPickerContainer: { marginBottom: 14 },
  domainPickerLabel: { fontSize: 9, fontWeight: '800', color: colors.faint, letterSpacing: 1.2, marginBottom: 8, paddingHorizontal: 2 },
  domainPickerScroll: { gap: 8, paddingHorizontal: 2, paddingBottom: 4 },
  domainTab: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paper, borderColor: colors.line, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, minWidth: 165 },
  domainTabSelected: { borderColor: colors.violet, backgroundColor: '#F7F5FF', shadowColor: colors.violet, shadowOpacity: 0.08, shadowRadius: 6, elevation: 1 },
  domainIcon: { fontSize: 22, marginRight: 9 },
  domainTabTextWrap: { flex: 1 },
  domainTabHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  domainTabDomain: { fontSize: 8, fontWeight: '800', color: colors.faint, letterSpacing: 0.8 },
  domainTabDomainSelected: { color: colors.violet },
  domainTabBadge: { fontSize: 7, fontWeight: '800', backgroundColor: colors.slateSoft, color: colors.muted, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  domainTabBadgeSelected: { backgroundColor: '#EDE9FE', color: colors.violet },
  domainTabTitle: { fontSize: 11, fontWeight: '700', color: colors.ink, marginTop: 3 },
  domainTabTitleSelected: { color: colors.violet, fontWeight: '800' },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: 16 },
  modalContent: { width: '100%', maxWidth: 420, maxHeight: '80%', backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 18, elevation: 5 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  modalCloseText: { fontSize: 16, color: colors.muted, padding: 4 },
  modalSearchInput: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: '#F8FAFC', paddingHorizontal: 12, fontSize: 13, color: colors.ink, marginBottom: 10 },
  modalCountryList: { flexGrow: 0, maxHeight: 300 },
  modalCountryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  modalCountryRowSelected: { backgroundColor: '#F5F3FF' },
  modalCountryFlag: { fontSize: 20, marginRight: 10 },
  modalCountryName: { flex: 1, fontSize: 13, color: colors.ink, fontWeight: '600' },
  modalCountryDial: { fontSize: 12, color: colors.violet, fontWeight: '800' },
  autofillBar: { backgroundColor: '#F5F3FF', borderRadius: 14, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#DDD6FE' },
  autofillHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  autofillBadge: { fontSize: 9, fontWeight: '800', color: colors.violet, letterSpacing: 0.8 },
  autofillOrigin: { fontSize: 9, fontWeight: '700', color: colors.teal },
  autofillBtnRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  autofillBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#C4B5FD', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  autofillBtnPressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  autofillBtnIcon: { fontSize: 13, marginRight: 5 },
  autofillBtnText: { fontSize: 11, fontWeight: '800', color: colors.violet },
  autofillBtnSample: { backgroundColor: '#EDE9FE', borderColor: '#A78BFA' },
  autofillBtnTextSample: { color: colors.ink },
});
