import { useState, useEffect, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  StudioShareCodec,
  type FormStudioStore,
  type StudioState,
  type StudioAction,
  type StudioSheetType,
  type StudioViewMode,
} from '@intuitui-labs/form-builder-engine/studio';
import type { FieldDefinition, FormPage, FormSchema } from '@intuitui-labs/form-builder-engine';
import type { QuestionRubric } from '@intuitui-labs/form-builder-engine/assessment';
import {
  AiStudioCopilotDispatcher,
  type AiToolActionProposal,
} from '@intuitui-labs/form-builder-engine/ai';
import {
  compileWithAi,
  getStoredApiKey,
  saveStoredApiKey,
} from '../lib/aiCompilerService';
import { colors, radii } from '../theme';

export const COVER_PRESETS = [
  {
    id: 'gradient-pulse',
    label: '🎨 Sunset Pulse',
    url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1200&q=80',
    color: '#f43f5e',
  },
  {
    id: 'abstract',
    label: '🌌 Indigo Wave',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&q=80',
    color: '#6366f1',
  },
  {
    id: 'minimal-workspace',
    label: '💼 Minimal Desk',
    url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80',
    color: '#0ea5e9',
  },
  {
    id: 'nature',
    label: '🌿 Calm Emerald',
    url: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=1200&q=80',
    color: '#10b981',
  },
  {
    id: 'education',
    label: '🎓 Campus Learning',
    url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&q=80',
    color: '#8b5cf6',
  },
];

export const THEME_COLORS = [
  { name: 'Google Purple', color: '#673ab7' },
  { name: 'Indigo Accent', color: '#6366f1' },
  { name: 'Emerald Forest', color: '#10b981' },
  { name: 'Warm Amber', color: '#f59e0b' },
  { name: 'Crimson Rose', color: '#f43f5e' },
  { name: 'Ocean Cyan', color: '#06b6d4' },
];

export interface FormStudioUiProps {
  store: FormStudioStore;
  state: StudioState;
  onDispatch: (action: StudioAction) => void;
}

export function StudioHeaderCard({
  schema,
  onUpdateMetadata,
  onUpdateSettings,
}: {
  schema: FormSchema;
  onUpdateMetadata: (updates: {
    title?: string;
    description?: string;
    coverImage?: string;
    logoUrl?: string;
    themeColor?: string;
  }) => void;
  onUpdateSettings: (settings: {
    collectEmail?: boolean;
    showProgressBar?: boolean;
    confirmationMessage?: string;
  }) => void;
}) {
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [customCoverUrl, setCustomCoverUrl] = useState('');
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  const themeColor = schema.settings?.themeColor || '#673ab7';
  const coverImage = schema.coverImage || schema.settings?.coverImage;
  const collectEmail = Boolean(schema.settings?.collectEmail);
  const showProgressBar = schema.settings?.showProgressBar !== false;
  const confirmationMessage =
    typeof schema.settings?.confirmationMessage === 'string'
      ? schema.settings.confirmationMessage
      : 'Thank you! Your response has been recorded.';

  return (
    <View style={styles.headerCardContainer}>
      {/* Top Google Forms-style Accent Border Bar */}
      <View style={[styles.headerCardAccentBar, { backgroundColor: themeColor }]} />

      {/* Cover Banner Image */}
      {coverImage ? (
        <View style={styles.coverImageContainer}>
          <Image source={{ uri: coverImage }} style={styles.coverImage} resizeMode="cover" />
          <View style={styles.coverActionOverlay}>
            <Pressable
              onPress={() => setShowCoverPicker(true)}
              style={styles.coverOverlayBtn}
            >
              <Text style={styles.coverOverlayBtnText}>🖼️ Change Banner</Text>
            </Pressable>
            <Pressable
              onPress={() => onUpdateMetadata({ coverImage: '' })}
              style={[styles.coverOverlayBtn, styles.coverOverlayRemoveBtn]}
            >
              <Text style={styles.coverOverlayBtnText}>✕ Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.headerCardContent}>
        {/* Banner Button if no cover image */}
        {!coverImage ? (
          <View style={styles.addBannerRow}>
            <Pressable
              onPress={() => setShowCoverPicker(true)}
              style={styles.addBannerBtn}
            >
              <Text style={styles.addBannerBtnText}>+ Add Header Cover Banner</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Form Title Input */}
        <TextInput
          style={styles.formTitleInput}
          value={schema.title}
          placeholder="Untitled form"
          placeholderTextColor={colors.muted}
          onChangeText={(title) => onUpdateMetadata({ title })}
        />

        {/* Form Description Input */}
        <TextInput
          style={styles.formDescInput}
          multiline
          value={schema.description ?? ''}
          placeholder="Form description / instructions for respondents..."
          placeholderTextColor={colors.muted}
          onChangeText={(description) => onUpdateMetadata({ description })}
        />

        {/* Theme Palette & Quick Settings Bar */}
        <View style={styles.themeAndSettingsBar}>
          <View style={styles.themeSwatches}>
            {THEME_COLORS.map((tc) => {
              const isSelected = tc.color.toLowerCase() === themeColor.toLowerCase();
              return (
                <Pressable
                  key={tc.color}
                  onPress={() => onUpdateMetadata({ themeColor: tc.color })}
                  style={[
                    styles.themeColorDot,
                    { backgroundColor: tc.color },
                    isSelected && styles.themeColorDotSelected,
                  ]}
                  accessibilityLabel={`Select ${tc.name} theme`}
                />
              );
            })}
          </View>

          <View style={styles.settingsPills}>
            <Pressable
              onPress={() => onUpdateSettings({ collectEmail: !collectEmail })}
              style={[styles.settingPill, collectEmail && styles.settingPillActive]}
            >
              <Text style={[styles.settingPillText, collectEmail && styles.settingPillTextActive]}>
                ✉️ {collectEmail ? 'Collect Email: On' : 'Collect Email'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => onUpdateSettings({ showProgressBar: !showProgressBar })}
              style={[styles.settingPill, showProgressBar && styles.settingPillActive]}
            >
              <Text style={[styles.settingPillText, showProgressBar && styles.settingPillTextActive]}>
                📊 {showProgressBar ? 'Progress: On' : 'Progress: Off'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setShowSettingsDrawer(!showSettingsDrawer)}
              style={[styles.settingPill, showSettingsDrawer && styles.settingPillActive]}
            >
              <Text style={[styles.settingPillText, showSettingsDrawer && styles.settingPillTextActive]}>
                ⚙️ Response Note
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Expandable Confirmation Message Drawer */}
        {showSettingsDrawer ? (
          <View style={styles.confirmationDrawer}>
            <Text style={styles.confirmationDrawerLabel}>Submission Confirmation Note</Text>
            <TextInput
              style={styles.confirmationDrawerInput}
              value={confirmationMessage}
              placeholder="e.g. Thank you! Your response has been recorded."
              placeholderTextColor={colors.muted}
              onChangeText={(msg) => onUpdateSettings({ confirmationMessage: msg })}
            />
          </View>
        ) : null}
      </View>

      {/* Cover Image Picker Modal */}
      <Modal visible={showCoverPicker} transparent animationType="fade" onRequestClose={() => setShowCoverPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.coverModalContainer}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Choose Header Banner</Text>
                <Text style={styles.sheetSub}>Select a curated high-resolution theme banner or provide a custom image URL</Text>
              </View>
              <Pressable onPress={() => setShowCoverPicker(false)} style={styles.sheetCloseBtn}>
                <Text style={styles.sheetCloseText}>×</Text>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 380 }}>
              <Text style={styles.sheetSectionLabel}>Curated Theme Presets</Text>
              <View style={styles.coverPresetsGrid}>
                {COVER_PRESETS.map((preset) => (
                  <Pressable
                    key={preset.id}
                    onPress={() => {
                      onUpdateMetadata({ coverImage: preset.url, themeColor: preset.color });
                      setShowCoverPicker(false);
                    }}
                    style={styles.coverPresetCard}
                  >
                    <Image source={{ uri: preset.url }} style={styles.coverPresetThumb} resizeMode="cover" />
                    <View style={styles.coverPresetFooter}>
                      <Text style={styles.coverPresetLabel}>{preset.label}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.sheetSectionLabel, { marginTop: 16 }]}>Or Custom Image URL</Text>
              <View style={styles.customCoverInputRow}>
                <TextInput
                  style={styles.customCoverInput}
                  value={customCoverUrl}
                  placeholder="https://images.unsplash.com/..."
                  placeholderTextColor={colors.muted}
                  onChangeText={setCustomCoverUrl}
                />
                <Pressable
                  onPress={() => {
                    if (customCoverUrl.trim()) {
                      onUpdateMetadata({ coverImage: customCoverUrl.trim() });
                      setShowCoverPicker(false);
                      setCustomCoverUrl('');
                    }
                  }}
                  style={styles.applyCoverBtn}
                >
                  <Text style={styles.applyCoverBtnText}>Apply</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function StudioSectionHeaderCard({
  page,
  pageIndex,
  totalPages,
  themeColor = '#673ab7',
  onUpdatePage,
}: {
  page: FormPage;
  pageIndex: number;
  totalPages: number;
  themeColor?: string;
  onUpdatePage: (updates: Partial<FormPage>) => void;
}) {
  return (
    <View style={[styles.sectionHeaderCard, { borderLeftColor: themeColor }]}>
      <View style={styles.sectionEyebrowRow}>
        <View style={[styles.sectionNumberBadge, { backgroundColor: themeColor }]}>
          <Text style={styles.sectionNumberBadgeText}>
            Section {pageIndex + 1} of {totalPages}
          </Text>
        </View>
        <TextInput
          style={styles.sectionTimeInput}
          value={page.estimatedTime ?? ''}
          placeholder="⏱️ Est. time (e.g. 2 min)"
          placeholderTextColor={colors.muted}
          onChangeText={(estimatedTime) => onUpdatePage({ estimatedTime })}
        />
      </View>

      <TextInput
        style={styles.sectionTitleInput}
        value={page.title ?? ''}
        placeholder={`Section ${pageIndex + 1} Title`}
        placeholderTextColor={colors.muted}
        onChangeText={(title) => onUpdatePage({ title })}
      />

      <TextInput
        style={styles.sectionDescInput}
        multiline
        value={page.description ?? ''}
        placeholder="Section description or instructions for this stage (optional)..."
        placeholderTextColor={colors.muted}
        onChangeText={(description) => onUpdatePage({ description })}
      />
    </View>
  );
}

export function StudioToolbar({
  state,
  store,
  onDispatch,
  onExportJson,
  onOpenAiModal,
  onOpenShareModal,
}: {
  state: StudioState;
  store: FormStudioStore;
  onDispatch: (action: StudioAction) => void;
  onExportJson: () => void;
  onOpenAiModal?: () => void;
  onOpenShareModal?: () => void;
}) {
  const canUndo = store.canUndo();
  const canRedo = store.canRedo();
  const errorCount = state.lintResult.errors.length;
  const warningCount = state.lintResult.warnings.length;

  return (
    <View style={styles.toolbarContainer}>
      <View style={styles.toolbarRow}>
        <View style={styles.historyGroup}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo last change"
            disabled={!canUndo}
            onPress={() => onDispatch({ type: 'UNDO' })}
            style={({ pressed }) => [
              styles.toolBtn,
              !canUndo && styles.toolBtnDisabled,
              pressed && canUndo && styles.toolBtnPressed,
            ]}
          >
            <Text style={[styles.toolBtnText, !canUndo && styles.toolBtnTextDisabled]}>
              ↩ Undo
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Redo change"
            disabled={!canRedo}
            onPress={() => onDispatch({ type: 'REDO' })}
            style={({ pressed }) => [
              styles.toolBtn,
              !canRedo && styles.toolBtnDisabled,
              pressed && canRedo && styles.toolBtnPressed,
            ]}
          >
            <Text style={[styles.toolBtnText, !canRedo && styles.toolBtnTextDisabled]}>
              Redo ↪
            </Text>
          </Pressable>
        </View>

        <View style={styles.modeToggleGroup}>
          <Pressable
            onPress={() => onDispatch({ type: 'SET_MODE', payload: { mode: 'edit' } })}
            style={[styles.modeBtn, state.mode === 'edit' && styles.modeBtnActive]}
          >
            <Text style={[styles.modeBtnText, state.mode === 'edit' && styles.modeBtnTextActive]}>
              Canvas
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onDispatch({ type: 'SET_MODE', payload: { mode: 'preview' } })}
            style={[styles.modeBtn, state.mode === 'preview' && styles.modeBtnActive]}
          >
            <Text style={[styles.modeBtnText, state.mode === 'preview' && styles.modeBtnTextActive]}>
              Test Drive
            </Text>
          </Pressable>
        </View>

        <View style={styles.actionGroup}>
          {onOpenAiModal ? (
            <Pressable
              accessibilityRole="button"
              onPress={onOpenAiModal}
              style={({ pressed }) => [styles.aiBtn, pressed && styles.toolBtnPressed]}
            >
              <Text style={styles.aiBtnText}>✨ AI Assist</Text>
            </Pressable>
          ) : null}

          {onOpenShareModal ? (
            <Pressable
              accessibilityRole="button"
              onPress={onOpenShareModal}
              style={({ pressed }) => [styles.shareBtn, pressed && styles.toolBtnPressed]}
            >
              <Text style={styles.shareBtnText}>🔗 Share</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={onExportJson}
            style={({ pressed }) => [styles.exportBtn, pressed && styles.toolBtnPressed]}
          >
            <Text style={styles.exportBtnText}>JSON</Text>
          </Pressable>
        </View>
      </View>

      {/* Diagnostics / Status Strip */}
      <View style={styles.statusStrip}>
        <Text style={styles.statusText}>
          {state.isDirty ? '● Unsaved edits' : '✓ Synced'} · {state.schema.pages.length} Pages
        </Text>
        <View style={styles.lintBadges}>
          {errorCount > 0 ? (
            <View style={styles.badgeError}>
              <Text style={styles.badgeErrorText}>{errorCount} Errors</Text>
            </View>
          ) : (
            <View style={styles.badgeClean}>
              <Text style={styles.badgeCleanText}>✓ DAG Valid</Text>
            </View>
          )}
          {warningCount > 0 ? (
            <View style={styles.badgeWarning}>
              <Text style={styles.badgeWarningText}>{warningCount} Warnings</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function StudioPageTabs({
  pages,
  activePageId,
  onSelectPage,
  onAddPage,
  onRemovePage,
}: {
  pages: FormPage[];
  activePageId: string;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onRemovePage: (pageId: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabsScroll}
    >
      {pages.map((page, idx) => {
        const isActive = page.id === activePageId;
        const jumpCount = page.jumpRules?.length ?? 0;
        return (
          <Pressable
            key={page.id}
            onPress={() => onSelectPage(page.id)}
            style={[styles.tabItem, isActive && styles.tabItemActive]}
          >
            <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
                {idx + 1}
              </Text>
            </View>
            <Text style={[styles.tabTitle, isActive && styles.tabTitleActive]} numberOfLines={1}>
              {page.title || `Step ${idx + 1}`}
            </Text>
            {jumpCount > 0 ? (
              <View style={styles.jumpBadge}>
                <Text style={styles.jumpBadgeText}>⚡{jumpCount}</Text>
              </View>
            ) : null}
            {pages.length > 1 ? (
              <Pressable
                hitSlop={8}
                onPress={() => onRemovePage(page.id)}
                style={styles.tabRemoveBtn}
              >
                <Text style={styles.tabRemoveText}>×</Text>
              </Pressable>
            ) : null}
          </Pressable>
        );
      })}
      <Pressable onPress={onAddPage} style={styles.addTabBtn}>
        <Text style={styles.addTabBtnText}>+ Add Step</Text>
      </Pressable>
    </ScrollView>
  );
}

export function StudioFieldCard({
  field,
  isSelected,
  canMoveUp,
  canMoveDown,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
  onEditRubric,
}: {
  field: FieldDefinition;
  isSelected: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onEditRubric: () => void;
}) {
  const hasRubric = Boolean((field as any).rubric);
  const rubric = (field as any).rubric as QuestionRubric | undefined;

  return (
    <Pressable
      onPress={onSelect}
      style={[styles.fieldCard, isSelected && styles.fieldCardSelected]}
    >
      <View style={styles.fieldCardHeader}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{field.type.toUpperCase()}</Text>
        </View>
        <Text style={styles.fieldName} numberOfLines={1}>
          {field.label || field.name}
        </Text>
        {field.required ? <Text style={styles.requiredStar}>*</Text> : null}
      </View>

      <View style={styles.fieldMetaRow}>
        <Text style={styles.fieldIdText}>id: {field.id || field.name}</Text>
        {hasRubric ? (
          <Pressable onPress={onEditRubric} style={styles.rubricBadge}>
            <Text style={styles.rubricBadgeText}>
              🎯 {rubric?.points ?? 10} pts · {rubric?.kind}
            </Text>
          </Pressable>
        ) : (
          <Pressable onPress={onEditRubric} style={styles.addRubricBtn}>
            <Text style={styles.addRubricBtnText}>+ Add Quiz Rubric</Text>
          </Pressable>
        )}
      </View>

      {/* Reorder and Delete Controls */}
      <View style={styles.fieldCardControls}>
        <View style={styles.reorderGroup}>
          <Pressable
            disabled={!canMoveUp}
            onPress={onMoveUp}
            style={[styles.miniControlBtn, !canMoveUp && styles.miniControlDisabled]}
          >
            <Text style={styles.miniControlText}>▲</Text>
          </Pressable>
          <Pressable
            disabled={!canMoveDown}
            onPress={onMoveDown}
            style={[styles.miniControlBtn, !canMoveDown && styles.miniControlDisabled]}
          >
            <Text style={styles.miniControlText}>▼</Text>
          </Pressable>
        </View>

        <Pressable onPress={onDelete} style={styles.deleteFieldBtn}>
          <Text style={styles.deleteFieldText}>Delete</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export function StudioPaletteModal({
  visible,
  onClose,
  onAddField,
}: {
  visible: boolean;
  onClose: () => void;
  onAddField: (type: string, label: string) => void;
}) {
  const PALETTE_GROUPS = [
    {
      title: 'Input & Text',
      items: [
        { type: 'text', label: 'Single-line Text', icon: '📝' },
        { type: 'textarea', label: 'Multi-line Paragraph', icon: '📄' },
        { type: 'number', label: 'Numeric Quantity', icon: '🔢' },
        { type: 'email', label: 'Email Address', icon: '✉️' },
        { type: 'phone', label: 'Phone Number', icon: '📞' },
      ],
    },
    {
      title: 'Choice & Assessment',
      items: [
        { type: 'select', label: 'Single Choice Radio', icon: '🔘' },
        { type: 'multiselect', label: 'Multiple Choice Checkbox', icon: '☑️' },
        { type: 'boolean', label: 'Boolean Yes / No', icon: '⚖️' },
        { type: 'rating', label: 'Star / CSAT Rating', icon: '⭐' },
      ],
    },
    {
      title: 'Advanced & Special',
      items: [
        { type: 'payment-card', label: 'Credit Card (Luhn Guard)', icon: '💳' },
        { type: 'date', label: 'Date Picker', icon: '📅' },
        { type: 'rich-text', label: 'Rich Text / Markdown Card', icon: '💡' },
      ],
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Insert Form Component</Text>
            <Pressable onPress={onClose} style={styles.sheetCloseBtn}>
              <Text style={styles.sheetCloseText}>×</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            {PALETTE_GROUPS.map((group) => (
              <View key={group.title} style={styles.paletteSection}>
                <Text style={styles.paletteSectionTitle}>{group.title}</Text>
                <View style={styles.paletteGrid}>
                  {group.items.map((item) => (
                    <Pressable
                      key={item.type}
                      onPress={() => {
                        onAddField(item.type, item.label);
                        onClose();
                      }}
                      style={({ pressed }) => [
                        styles.paletteCard,
                        pressed && styles.paletteCardPressed,
                      ]}
                    >
                      <Text style={styles.paletteCardIcon}>{item.icon}</Text>
                      <Text style={styles.paletteCardLabel}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const AI_STUDIO_PRESETS = [
  {
    label: 'Customer NPS & CSAT',
    prompt: 'Customer satisfaction and Net Promoter Score survey with service rating, responsiveness feedback, and product recommendations',
    themeColor: '#f43f5e',
    coverImage: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1200&q=80',
    title: 'Customer Pulse & NPS Survey 2026',
    description: 'Help us elevate our software platform by sharing your feedback on speed, reliability, and support.',
  },
  {
    label: 'Frontier AI Safety (SB 1047)',
    prompt: 'California SB 1047 & Frontier AI Safety Intake with compute cluster log, cybersecurity protocols, and kill switch latency verification',
    themeColor: '#6366f1',
    coverImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&q=80',
    title: 'Frontier Model Safety & Compliance Verification',
    description: 'Mandatory risk audit intake for frontier models exceeding 10^26 FLOPS training threshold under California SB 1047.',
  },
  {
    label: 'Job Application & CV',
    prompt: 'Candidate recruitment application with contact information, portfolio links, years of experience, and code sample repository',
    themeColor: '#0ea5e9',
    coverImage: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80',
    title: 'Senior Platform Engineer Application',
    description: 'Join our distributed systems engineering team building offline-first resilience architecture.',
  },
  {
    label: 'Conference RSVP & Track',
    prompt: 'Developer conference registration with track selection (Agents, Edge Computing, Zero-Trust), dietary requirements, and keynote dinner',
    themeColor: '#8b5cf6',
    coverImage: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&q=80',
    title: 'Global Developer Summit 2026 Registration',
    description: 'Secure your pass for 3 days of intensive keynotes, hands-on architectural labs, and networking.',
  },
];

export const COPILOT_PRESETS: Array<{
  label: string;
  badge: string;
  description: string;
  createProposal: (state: StudioState) => AiToolActionProposal;
}> = [
  {
    label: '🛡️ Emergency Contact Fields',
    badge: 'SAFETY',
    description: 'Appends emergency contact name, telephone, and relationship dropdown to current step.',
    createProposal: (state) => {
      const pageId = state.activePageId || state.schema.pages[0]?.id || 'page_1';
      const page = state.schema.pages.find((p) => p.id === pageId) || state.schema.pages[0]!;
      const baseIdx = page.fields.length;
      return {
        id: `prop_emergency_${Date.now()}`,
        rationale: 'Adding standardized emergency contact fields.',
        actions: [
          {
            type: 'INSERT_FIELD',
            payload: {
              pageId,
              index: baseIdx,
              field: {
                id: `emergency_name_${Date.now().toString(36).slice(4)}`,
                name: 'emergency_name',
                type: 'text',
                label: 'Emergency Contact Full Name',
                required: true,
                placeholder: 'e.g. Alex Taylor',
              },
            },
          },
          {
            type: 'INSERT_FIELD',
            payload: {
              pageId,
              index: baseIdx + 1,
              field: {
                id: `emergency_phone_${Date.now().toString(36).slice(4)}`,
                name: 'emergency_phone',
                type: 'text',
                label: 'Emergency Contact Phone Number',
                required: true,
                placeholder: '+1 (555) 000-0000',
              },
            },
          },
          {
            type: 'INSERT_FIELD',
            payload: {
              pageId,
              index: baseIdx + 2,
              field: {
                id: `emergency_rel_${Date.now().toString(36).slice(4)}`,
                name: 'emergency_relationship',
                type: 'select',
                label: 'Relationship to Responder',
                required: true,
                options: [
                  { label: 'Spouse / Partner', value: 'spouse' },
                  { label: 'Parent / Legal Guardian', value: 'parent' },
                  { label: 'Colleague / Manager', value: 'colleague' },
                  { label: 'Other', value: 'other' },
                ],
              },
            },
          },
        ],
      };
    },
  },
  {
    label: '🔒 GDPR Consent & Legal Step',
    badge: 'LEGAL',
    description: 'Inserts an entirely new multi-step page with statutory consent checkboxes.',
    createProposal: () => {
      return {
        id: `prop_gdpr_${Date.now()}`,
        rationale: 'Adding statutory GDPR / CCPA consent page.',
        actions: [
          {
            type: 'ADD_PAGE',
            payload: {
              title: 'Regulatory Privacy & Consent',
              description: 'Review and acknowledge our statutory data handling covenants.',
            },
          },
        ],
      };
    },
  },
  {
    label: '⭐ CSAT Experience Rating',
    badge: 'SURVEY',
    description: 'Appends 1-5 satisfaction metric and open feedback textarea to active step.',
    createProposal: (state) => {
      const pageId = state.activePageId || state.schema.pages[0]?.id || 'page_1';
      const page = state.schema.pages.find((p) => p.id === pageId) || state.schema.pages[0]!;
      const baseIdx = page.fields.length;
      return {
        id: `prop_csat_${Date.now()}`,
        rationale: 'Adding customer satisfaction rating.',
        actions: [
          {
            type: 'INSERT_FIELD',
            payload: {
              pageId,
              index: baseIdx,
              field: {
                id: `csat_score_${Date.now().toString(36).slice(4)}`,
                name: 'csat_score',
                type: 'number',
                label: 'Overall Experience Rating (1 - 5)',
                required: true,
                placeholder: '5',
                rules: [{ type: 'min', value: 1 }, { type: 'max', value: 5 }],
              },
            },
          },
          {
            type: 'INSERT_FIELD',
            payload: {
              pageId,
              index: baseIdx + 1,
              field: {
                id: `csat_comments_${Date.now().toString(36).slice(4)}`,
                name: 'csat_comments',
                type: 'textarea',
                label: 'Feedback & Qualitative Observations',
                placeholder: 'Share any specifics about your experience...',
                required: false,
              },
            },
          },
        ],
      };
    },
  },
];

export function StudioAiModal({
  visible,
  store,
  onClose,
  onApplySchema,
}: {
  visible: boolean;
  store?: FormStudioStore;
  onClose: () => void;
  onApplySchema: (schema: FormSchema) => void;
}) {
  const [activeTab, setActiveTab] = useState<'scaffold' | 'copilot'>('scaffold');
  const [prompt, setPrompt] = useState(AI_STUDIO_PRESETS[0]!.prompt);
  const [copilotCustomText, setCopilotCustomText] = useState('Add feedback comments and satisfaction rating');
  const [apiKey, setApiKey] = useState('');
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setApiKey(getStoredApiKey());
      setStatusNote(null);
    }
  }, [visible]);

  const handleSaveKey = () => {
    saveStoredApiKey(apiKey);
    setShowKeyConfig(false);
    setStatusNote('API Key updated in local session.');
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setStatusNote('Synthesizing atomic form architecture with AI...');
    try {
      const result = await compileWithAi(prompt.trim(), apiKey);
      const schema = { ...result.schema };
      const matchedPreset = AI_STUDIO_PRESETS.find((p) => p.prompt === prompt);
      if (matchedPreset) {
        if (!schema.title || schema.title === 'Untitled Form' || schema.title.startsWith('Form-')) {
          schema.title = matchedPreset.title;
        }
        if (!schema.description) {
          schema.description = matchedPreset.description;
        }
        if (!schema.coverImage && matchedPreset.coverImage) {
          schema.coverImage = matchedPreset.coverImage;
          schema.settings = schema.settings || {};
          schema.settings.coverImage = matchedPreset.coverImage;
        }
        if (!schema.settings?.themeColor && matchedPreset.themeColor) {
          schema.settings = schema.settings || {};
          schema.settings.themeColor = matchedPreset.themeColor;
        }
      }
      setStatusNote(result.notes || 'Compilation succeeded!');
      onApplySchema(schema);
      onClose();
    } catch (err: any) {
      setStatusNote(`Compilation failed: ${err.message || String(err)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyCopilotPreset = (preset: (typeof COPILOT_PRESETS)[0]) => {
    if (!store) {
      setStatusNote('Studio Store is required to dispatch transactional copilot mutations.');
      return;
    }
    const state = store.getState();
    const proposal = preset.createProposal(state);
    const result = AiStudioCopilotDispatcher.applyProposal(store, proposal, {
      staleTargetPolicy: 'prune-and-continue',
    });
    if (result.success) {
      setStatusNote(
        `✓ Co-pilot applied "${preset.label}": ${result.appliedCount} action(s) committed in 1 atomic undo frame! ${
          result.prunedCount > 0 ? `(${result.prunedCount} stale actions pruned)` : ''
        }`,
      );
      setTimeout(() => {
        onClose();
      }, 700);
    } else {
      setStatusNote(`Co-pilot error: ${result.error || 'Failed to apply mutation'}`);
    }
  };

  const handleApplyCustomCopilot = () => {
    if (!store) {
      setStatusNote('Studio Store is required to dispatch transactional copilot mutations.');
      return;
    }
    const state = store.getState();
    const pageId = state.activePageId || state.schema.pages[0]?.id || 'page_1';
    const page = state.schema.pages.find((p) => p.id === pageId) || state.schema.pages[0]!;
    const lower = copilotCustomText.toLowerCase();

    const actions: StudioAction[] = [];
    let baseIdx = page.fields.length;

    if (lower.includes('feedback') || lower.includes('comment')) {
      actions.push({
        type: 'INSERT_FIELD',
        payload: {
          pageId,
          index: baseIdx++,
          field: {
            id: `field_custom_${Date.now().toString(36).slice(4)}`,
            name: 'custom_feedback',
            type: 'textarea',
            label: 'Feedback & Detailed Comments',
            placeholder: 'Please enter your thoughts...',
            required: false,
          },
        },
      });
    }

    if (lower.includes('rating') || lower.includes('score') || lower.includes('csat')) {
      actions.push({
        type: 'INSERT_FIELD',
        payload: {
          pageId,
          index: baseIdx++,
          field: {
            id: `field_custom_${Date.now().toString(36).slice(4)}`,
            name: 'custom_rating',
            type: 'number',
            label: 'Satisfaction Score (1-10)',
            placeholder: '10',
            required: true,
            rules: [{ type: 'min', value: 1 }, { type: 'max', value: 10 }],
          },
        },
      });
    }

    if (lower.includes('email')) {
      actions.push({
        type: 'INSERT_FIELD',
        payload: {
          pageId,
          index: baseIdx++,
          field: {
            id: `field_custom_${Date.now().toString(36).slice(4)}`,
            name: 'custom_email',
            type: 'email',
            label: 'Official Email Address',
            placeholder: 'user@domain.com',
            required: true,
          },
        },
      });
    }

    if (lower.includes('phone') || lower.includes('tel')) {
      actions.push({
        type: 'INSERT_FIELD',
        payload: {
          pageId,
          index: baseIdx++,
          field: {
            id: `field_custom_${Date.now().toString(36).slice(4)}`,
            name: 'custom_phone',
            type: 'text',
            label: 'Contact Phone Number',
            placeholder: '+1 (555) 000-0000',
            required: true,
          },
        },
      });
    }

    if (actions.length === 0) {
      actions.push({
        type: 'INSERT_FIELD',
        payload: {
          pageId,
          index: baseIdx++,
          field: {
            id: `field_custom_${Date.now().toString(36).slice(4)}`,
            name: 'custom_input',
            type: 'text',
            label: copilotCustomText.slice(0, 50),
            placeholder: 'Your input',
            required: false,
          },
        },
      });
    }

    const proposal: AiToolActionProposal = {
      id: `prop_custom_${Date.now()}`,
      rationale: `Synthesized from prompt: "${copilotCustomText}"`,
      actions,
    };

    const result = AiStudioCopilotDispatcher.applyProposal(store, proposal, {
      staleTargetPolicy: 'prune-and-continue',
    });

    if (result.success) {
      setStatusNote(
        `✓ Co-pilot synthesized and applied ${result.appliedCount} action(s) in 1 atomic undo frame!`,
      );
      setTimeout(() => {
        onClose();
      }, 700);
    } else {
      setStatusNote(`Co-pilot error: ${result.error || 'Failed to apply'}`);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>
                {activeTab === 'scaffold' ? '✨ AI Form Architect' : '🤖 AI Co-pilot Assistant'}
              </Text>
              <Text style={styles.sheetSub}>
                {activeTab === 'scaffold'
                  ? 'Generate full atomic multi-step forms using Gemini or offline search grounding'
                  : 'Transactionally append fields & steps with prune-and-continue resilience'}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.sheetCloseBtn}>
              <Text style={styles.sheetCloseText}>×</Text>
            </Pressable>
          </View>

          {/* Mode Switcher Tabs */}
          <View style={styles.aiTabRow}>
            <Pressable
              onPress={() => setActiveTab('scaffold')}
              style={[styles.aiTabBtn, activeTab === 'scaffold' && styles.aiTabBtnActive]}
            >
              <Text style={[styles.aiTabBtnText, activeTab === 'scaffold' && styles.aiTabBtnTextActive]}>
                ✨ Full Scaffolding
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('copilot')}
              style={[styles.aiTabBtn, activeTab === 'copilot' && styles.aiTabBtnActive]}
            >
              <Text style={[styles.aiTabBtnText, activeTab === 'copilot' && styles.aiTabBtnTextActive]}>
                🤖 Co-pilot Mutations
              </Text>
            </Pressable>
          </View>

          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            {activeTab === 'scaffold' ? (
              <>
                {/* Quick Presets */}
                <Text style={styles.sheetSectionLabel}>Quick Scaffolding Presets</Text>
                <View style={styles.presetWrap}>
                  {AI_STUDIO_PRESETS.map((p) => (
                    <Pressable
                      key={p.label}
                      onPress={() => setPrompt(p.prompt)}
                      style={[styles.presetChip, prompt === p.prompt && styles.presetChipActive]}
                    >
                      <Text style={[styles.presetChipText, prompt === p.prompt && styles.presetChipTextActive]}>
                        {p.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {/* Prompt Textarea */}
                <Text style={styles.sheetSectionLabel}>Natural Language Prompt</Text>
                <TextInput
                  style={styles.promptInput}
                  multiline
                  numberOfLines={4}
                  value={prompt}
                  onChangeText={setPrompt}
                  placeholder="Describe your form (e.g. Employee expense reimbursement with receipts, amount, and department)..."
                  placeholderTextColor={colors.muted}
                />

                {/* API Key Toggle & Configuration */}
                <View style={styles.keyConfigCard}>
                  <View style={styles.keyConfigHeader}>
                    <View style={styles.keyStatusRow}>
                      <View style={[styles.keyStatusDot, apiKey ? styles.keyStatusDotActive : null]} />
                      <Text style={styles.keyStatusText}>
                        {apiKey ? 'Gemini 2.5 Flash Connected' : 'Offline Grounded Fallback Active'}
                      </Text>
                    </View>
                    <Pressable onPress={() => setShowKeyConfig(!showKeyConfig)}>
                      <Text style={styles.keyToggleText}>{showKeyConfig ? 'Hide Config' : 'Configure Key ⚙️'}</Text>
                    </Pressable>
                  </View>

                  {showKeyConfig ? (
                    <View style={styles.keyInputRow}>
                      <TextInput
                        style={styles.keyInput}
                        secureTextEntry
                        value={apiKey}
                        onChangeText={setApiKey}
                        placeholder="Enter GEMINI_API_KEY (or set in .env)"
                        placeholderTextColor={colors.muted}
                      />
                      <Pressable onPress={handleSaveKey} style={styles.saveKeyBtn}>
                        <Text style={styles.saveKeyBtnText}>Save</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>

                {statusNote ? (
                  <View style={styles.statusBanner}>
                    <Text style={styles.statusBannerText}>{statusNote}</Text>
                  </View>
                ) : null}

                {/* Generate Action Button */}
                <Pressable
                  disabled={isGenerating || !prompt.trim()}
                  onPress={handleGenerate}
                  style={[styles.generateBtn, (isGenerating || !prompt.trim()) && styles.generateBtnDisabled]}
                >
                  {isGenerating ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.generateBtnText}>✨ Generate & Load Schema into Studio</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                {/* Co-pilot Presets */}
                <Text style={styles.sheetSectionLabel}>Transactional Co-pilot Presets (1-Click Undo)</Text>
                <View style={styles.copilotPresetList}>
                  {COPILOT_PRESETS.map((cp) => (
                    <View key={cp.label} style={styles.copilotCard}>
                      <View style={styles.copilotCardHeader}>
                        <Text style={styles.copilotCardTitle}>{cp.label}</Text>
                        <View style={styles.copilotBadge}>
                          <Text style={styles.copilotBadgeText}>{cp.badge}</Text>
                        </View>
                      </View>
                      <Text style={styles.copilotCardDesc}>{cp.description}</Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => handleApplyCopilotPreset(cp)}
                        style={styles.copilotApplyBtn}
                      >
                        <Text style={styles.copilotApplyBtnText}>+ Apply to Canvas</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>

                {/* Custom Instruction */}
                <Text style={styles.sheetSectionLabel}>Custom Instruction Mutation</Text>
                <TextInput
                  style={styles.promptInput}
                  multiline
                  numberOfLines={3}
                  value={copilotCustomText}
                  onChangeText={setCopilotCustomText}
                  placeholder="e.g. Add feedback comments and satisfaction rating..."
                  placeholderTextColor={colors.muted}
                />

                {statusNote ? (
                  <View style={styles.statusBanner}>
                    <Text style={styles.statusBannerText}>{statusNote}</Text>
                  </View>
                ) : null}

                <Pressable
                  disabled={!copilotCustomText.trim()}
                  onPress={handleApplyCustomCopilot}
                  style={[styles.generateBtn, !copilotCustomText.trim() && styles.generateBtnDisabled]}
                >
                  <Text style={styles.generateBtnText}>🤖 Synthesize & Apply Mutation</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function StudioShareModal({
  visible,
  schema,
  onClose,
  onImportSchema,
}: {
  visible: boolean;
  schema: FormSchema;
  onClose: () => void;
  onImportSchema: (schema: FormSchema) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [importInput, setImportInput] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const shareUrl = typeof window !== 'undefined'
    ? StudioShareCodec.generateShareableUrl(window.location.href, schema)
    : `https://forms.intuitui.local/#f=${StudioShareCodec.encodeToSlug(schema)}`;

  const handleCopyLink = async () => {
    try {
      await Clipboard.setStringAsync(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const handleImport = () => {
    setImportError(null);
    if (!importInput.trim()) return;

    let res = StudioShareCodec.extractFromUrl(importInput.trim());
    if (!res.success) {
      res = StudioShareCodec.decodeFromSlug(importInput.trim());
    }

    if (res.success && res.schema) {
      onImportSchema(res.schema);
      onClose();
    } else {
      setImportError(res.error || 'Invalid form URL or slug');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>🔗 Zero-Backend Form Sharing</Text>
              <Text style={styles.sheetSub}>
                Share via URL hash slug under 2,048 chars with automatic XSS defanging
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.sheetCloseBtn}>
              <Text style={styles.sheetCloseText}>×</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            {/* Share URL Section */}
            <Text style={styles.sheetSectionLabel}>Direct Shareable Link</Text>
            <View style={styles.shareBox}>
              <Text style={styles.shareUrlText} numberOfLines={2}>
                {shareUrl}
              </Text>
              <Pressable onPress={handleCopyLink} style={styles.copyBtn}>
                <Text style={styles.copyBtnText}>{copied ? '✓ Copied!' : '📋 Copy Link'}</Text>
              </Pressable>
            </View>

            {/* Import Section */}
            <Text style={[styles.sheetSectionLabel, { marginTop: 20 }]}>Load a Shared Form</Text>
            <TextInput
              style={styles.promptInput}
              value={importInput}
              onChangeText={setImportInput}
              placeholder="Paste shared form link or Base64URL slug here..."
              placeholderTextColor={colors.muted}
            />

            {importError ? (
              <View style={[styles.statusBanner, { backgroundColor: colors.redSoft }]}>
                <Text style={[styles.statusBannerText, { color: colors.red }]}>{importError}</Text>
              </View>
            ) : null}

            <Pressable onPress={handleImport} style={[styles.generateBtn, { backgroundColor: colors.ink }]}>
              <Text style={styles.generateBtnText}>📥 Import & Open in Studio</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}


const styles = StyleSheet.create({
  toolbarContainer: {
    backgroundColor: colors.paper,
    borderRadius: radii.medium,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 16,
    gap: 10,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  historyGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  toolBtn: {
    backgroundColor: colors.canvas,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
  },
  toolBtnDisabled: {
    opacity: 0.4,
  },
  toolBtnPressed: {
    opacity: 0.7,
  },
  toolBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  toolBtnTextDisabled: {
    color: colors.faint,
  },
  modeToggleGroup: {
    flexDirection: 'row',
    backgroundColor: colors.canvas,
    borderRadius: radii.small,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modeBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radii.small - 2,
  },
  modeBtnActive: {
    backgroundColor: colors.violet,
  },
  modeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
  },
  modeBtnTextActive: {
    color: '#FFFFFF',
  },
  exportBtn: {
    backgroundColor: colors.violetSoft,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.small,
  },
  exportBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.violet,
  },
  statusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  lintBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  badgeError: {
    backgroundColor: colors.redSoft,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: radii.pill,
  },
  badgeErrorText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.red,
  },
  badgeClean: {
    backgroundColor: colors.tealSoft,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: radii.pill,
  },
  badgeCleanText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.teal,
  },
  badgeWarning: {
    backgroundColor: colors.amberSoft,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: radii.pill,
  },
  badgeWarningText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.amber,
  },
  tabsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 6,
  },
  tabItemActive: {
    borderColor: colors.violet,
    backgroundColor: colors.violetSoft,
  },
  tabBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeActive: {
    backgroundColor: colors.violet,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.ink,
  },
  tabBadgeTextActive: {
    color: '#FFFFFF',
  },
  tabTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
    maxWidth: 120,
  },
  tabTitleActive: {
    color: colors.violet,
  },
  jumpBadge: {
    backgroundColor: colors.amberSoft,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radii.pill,
  },
  jumpBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.amber,
  },
  tabRemoveBtn: {
    marginLeft: 4,
  },
  tabRemoveText: {
    fontSize: 14,
    color: colors.muted,
  },
  addTabBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.violet,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radii.medium,
    justifyContent: 'center',
  },
  addTabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.violet,
  },
  fieldCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.medium,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 10,
    gap: 8,
  },
  fieldCardSelected: {
    borderColor: colors.violet,
    backgroundColor: '#FAF9FF',
  },
  fieldCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    backgroundColor: colors.canvas,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.small,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.5,
  },
  fieldName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    flex: 1,
  },
  requiredStar: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.red,
  },
  fieldMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldIdText: {
    fontSize: 11,
    color: colors.faint,
    fontFamily: 'monospace',
  },
  rubricBadge: {
    backgroundColor: colors.tealSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  rubricBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.teal,
  },
  addRubricBtn: {
    backgroundColor: colors.canvas,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  addRubricBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.muted,
  },
  fieldCardControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
  },
  reorderGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  miniControlBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniControlDisabled: {
    opacity: 0.3,
  },
  miniControlText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.ink,
  },
  deleteFieldBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  deleteFieldText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.red,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(21, 34, 56, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii.large,
    borderTopRightRadius: radii.large,
    maxHeight: '80%',
    padding: 20,
    paddingBottom: 36,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  sheetCloseBtn: {
    padding: 6,
  },
  sheetCloseText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.muted,
  },
  sheetScroll: {
    maxHeight: 480,
  },
  paletteSection: {
    marginBottom: 18,
  },
  paletteSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  paletteGrid: {
    gap: 8,
  },
  paletteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvas,
    padding: 12,
    borderRadius: radii.medium,
    gap: 12,
  },
  paletteCardPressed: {
    opacity: 0.7,
  },
  paletteCardIcon: {
    fontSize: 20,
  },
  paletteCardLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiBtn: {
    backgroundColor: colors.violet,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.small,
  },
  aiBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  shareBtn: {
    backgroundColor: colors.canvas,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  sheetSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  sheetSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 14,
  },
  presetWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  presetChip: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  presetChipActive: {
    backgroundColor: colors.violetSoft,
    borderColor: colors.violet,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  presetChipTextActive: {
    color: colors.violet,
  },
  promptInput: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    padding: 12,
    fontSize: 13,
    color: colors.ink,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  keyConfigCard: {
    backgroundColor: colors.canvas,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    marginTop: 14,
    gap: 8,
  },
  keyConfigHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  keyStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  keyStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.muted,
  },
  keyStatusDotActive: {
    backgroundColor: colors.teal,
  },
  keyStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  keyToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.violet,
  },
  keyInputRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  keyInput: {
    flex: 1,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.small,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: colors.ink,
  },
  saveKeyBtn: {
    backgroundColor: colors.violet,
    borderRadius: radii.small,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  saveKeyBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statusBanner: {
    backgroundColor: colors.tealSoft,
    borderRadius: radii.small,
    padding: 8,
    marginTop: 10,
  },
  statusBannerText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.teal,
  },
  generateBtn: {
    backgroundColor: colors.violet,
    borderRadius: radii.medium,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  generateBtnDisabled: {
    opacity: 0.5,
  },
  generateBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  shareBox: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    padding: 12,
    gap: 10,
  },
  shareUrlText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: colors.muted,
  },
  copyBtn: {
    backgroundColor: colors.violet,
    borderRadius: radii.small,
    paddingVertical: 8,
    alignItems: 'center',
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerCardContainer: {
    backgroundColor: colors.paper,
    borderRadius: radii.large,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 16,
    overflow: 'hidden',
  },
  headerCardAccentBar: {
    height: 10,
    width: '100%',
  },
  coverImageContainer: {
    position: 'relative',
    height: 160,
    width: '100%',
    backgroundColor: '#000000',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverActionOverlay: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  coverOverlayBtn: {
    backgroundColor: 'rgba(21, 34, 56, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.small,
  },
  coverOverlayRemoveBtn: {
    backgroundColor: 'rgba(196, 67, 86, 0.85)',
  },
  coverOverlayBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerCardContent: {
    padding: 20,
    gap: 12,
  },
  addBannerRow: {
    flexDirection: 'row',
  },
  addBannerBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    borderRadius: radii.small,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.canvas,
  },
  addBannerBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  formTitleInput: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  formDescInput: {
    fontSize: 14,
    color: colors.ink,
    minHeight: 44,
    paddingVertical: 6,
  },
  themeAndSettingsBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 12,
  },
  themeSwatches: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  themeColorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  themeColorDotSelected: {
    borderWidth: 2,
    borderColor: colors.paper,
    transform: [{ scale: 1.25 }],
  },
  settingsPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  settingPill: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  settingPillActive: {
    backgroundColor: colors.violetSoft,
    borderColor: colors.violet,
  },
  settingPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
  },
  settingPillTextActive: {
    color: colors.violet,
  },
  confirmationDrawer: {
    backgroundColor: colors.canvas,
    borderRadius: radii.small,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 6,
  },
  confirmationDrawerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  confirmationDrawerInput: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.small,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: colors.ink,
  },
  coverModalContainer: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii.large,
    borderTopRightRadius: radii.large,
    padding: 20,
    maxHeight: '85%',
  },
  coverPresetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  coverPresetCard: {
    width: '47%',
    borderRadius: radii.medium,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
  },
  coverPresetThumb: {
    height: 80,
    width: '100%',
  },
  coverPresetFooter: {
    padding: 8,
    backgroundColor: colors.canvas,
  },
  coverPresetLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  customCoverInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  customCoverInput: {
    flex: 1,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.small,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: colors.ink,
  },
  applyCoverBtn: {
    backgroundColor: colors.violet,
    borderRadius: radii.small,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  applyCoverBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionHeaderCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 5,
    padding: 16,
    marginBottom: 16,
    gap: 8,
  },
  sectionEyebrowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionNumberBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  sectionNumberBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  sectionTimeInput: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: 'italic',
  },
  sectionTitleInput: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 2,
  },
  sectionDescInput: {
    fontSize: 13,
    color: colors.muted,
    paddingVertical: 2,
  },

  // AI Tab and Co-pilot Styles
  aiTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  aiTabBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.small,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  aiTabBtnActive: {
    backgroundColor: colors.violetSoft,
    borderColor: colors.violet,
  },
  aiTabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
  },
  aiTabBtnTextActive: {
    color: colors.violet,
    fontWeight: '800',
  },
  copilotPresetList: {
    gap: 10,
    marginBottom: 16,
  },
  copilotCard: {
    backgroundColor: colors.canvas,
    borderRadius: radii.medium,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  copilotCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  copilotCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
  },
  copilotBadge: {
    backgroundColor: colors.slateSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  copilotBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.muted,
  },
  copilotCardDesc: {
    fontSize: 11,
    color: colors.muted,
    lineHeight: 16,
    marginBottom: 8,
  },
  copilotApplyBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.violet,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  copilotApplyBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
});
