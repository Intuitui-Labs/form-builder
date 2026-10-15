import { useMemo, useState, useEffect } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';
import {
  createFormStudioStore,
  type StudioState,
  type StudioAction,
} from '@intuitui-labs/form-builder-engine/studio';
import {
  MultiStepFormManager,
  type FieldType,
} from '@intuitui-labs/form-builder-engine';
import { createAssessmentEngineForSchema } from '@intuitui-labs/form-builder-engine/assessment';
import {
  AppPage,
  BrandHeader,
  Panel,
  ActionButton,
} from '../components/EngineUi';
import {
  StudioToolbar,
  StudioHeaderCard,
  StudioSectionHeaderCard,
  StudioPageTabs,
  StudioFieldCard,
  StudioPaletteModal,
  StudioAiModal,
  StudioShareModal,
} from '../components/FormStudioUi';
import { StudioShareCodec } from '@intuitui-labs/form-builder-engine/studio';
import { colors, radii } from '../theme';

export default function StudioScreen() {
  const store = useMemo(() => createFormStudioStore(), []);
  const [state, setState] = useState<StudioState>(() => store.getState());
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [exportedJson, setExportedJson] = useState<string | null>(null);
  const [submittedValues, setSubmittedValues] = useState<Record<string, unknown> | null>(null);
  const [previewFieldValues, setPreviewFieldValues] = useState<Record<string, any>>({});
  const [previewStepTick, setPreviewStepTick] = useState(0);

  const previewThemeColor = state.schema.settings?.themeColor || '#673ab7';
  const previewCoverImage = state.schema.coverImage || state.schema.settings?.coverImage;
  const previewCollectEmail = Boolean(state.schema.settings?.collectEmail);
  const previewShowProgressBar = state.schema.settings?.showProgressBar !== false;
  const previewConfirmationMessage =
    typeof state.schema.settings?.confirmationMessage === 'string'
      ? state.schema.settings.confirmationMessage
      : 'Thank you! Your response has been recorded.';

  // Auto-restore shared form if launched with a URL hash fragment (#f=...)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const extracted = StudioShareCodec.extractFromUrl(window.location.href);
      if (extracted.success && extracted.schema) {
        store.dispatch({ type: 'SET_SCHEMA', payload: extracted.schema });
      }
    }
  }, [store]);

  // Subscribe to store updates
  useEffect(() => {
    return store.subscribe((nextState) => {
      setState(nextState);
    });
  }, [store]);

  const dispatch = (action: StudioAction) => {
    store.dispatch(action);
  };

  const activePage = useMemo(() => {
    return (
      state.schema.pages.find((p) => p.id === state.activePageId) ??
      state.schema.pages[0]!
    );
  }, [state.schema.pages, state.activePageId]);

  // Handle adding a field from the palette
  const handleAddField = (type: string, label: string) => {
    const fieldId = `field_${Date.now().toString(36).slice(4)}`;
    dispatch({
      type: 'INSERT_FIELD',
      payload: {
        pageId: activePage.id,
        index: activePage.fields.length,
        field: {
          id: fieldId,
          name: fieldId,
          type: type as FieldType,
          label,
          required: false,
        },
      },
    });
  };

  // Live Test Drive preview manager
  const previewManager = useMemo(() => {
    if (state.mode !== 'preview') return null;
    const compiledSchema = store.toFormSchema();
    const assessmentEngine = compiledSchema.assessment
      ? createAssessmentEngineForSchema(compiledSchema)
      : undefined;

    return new MultiStepFormManager(
      compiledSchema,
      (values) => {
        setSubmittedValues(values);
      },
      {
        experience: { assessmentEngine },
      }
    );
  }, [state.mode, state.schema, store]);

  return (
    <AppPage>
      <BrandHeader
        eyebrow="Form Studio"
        title="Visual Form & Quiz Builder"
        subtitle="DAG graph editor with live linting, quiz rubric assignment, undo/redo, and instant test drive"
      />

      <StudioToolbar
        state={state}
        store={store}
        onDispatch={dispatch}
        onExportJson={() => setExportedJson(JSON.stringify(store.toFormSchema(), null, 2))}
        onOpenAiModal={() => setIsAiModalOpen(true)}
        onOpenShareModal={() => setIsShareModalOpen(true)}
      />

      {state.mode === 'edit' ? (
        <View style={styles.editWorkspace}>
          {/* Form-Level Header Card (Google Forms-style Header & Banner) */}
          <StudioHeaderCard
            schema={state.schema}
            onUpdateMetadata={(payload) => dispatch({ type: 'UPDATE_FORM_METADATA', payload })}
            onUpdateSettings={(payload) => dispatch({ type: 'UPDATE_FORM_SETTINGS', payload })}
          />

          {/* Page Tabs */}
          <StudioPageTabs
            pages={state.schema.pages}
            activePageId={activePage.id}
            onSelectPage={(pageId) =>
              dispatch({ type: 'SET_ACTIVE_PAGE', payload: { pageId } })
            }
            onAddPage={() => dispatch({ type: 'ADD_PAGE', payload: {} })}
            onRemovePage={(pageId) => dispatch({ type: 'REMOVE_PAGE', payload: { pageId } })}
          />

          {/* Current Section Configuration Card */}
          <StudioSectionHeaderCard
            page={activePage}
            pageIndex={state.schema.pages.findIndex((p) => p.id === activePage.id)}
            totalPages={state.schema.pages.length}
            themeColor={state.schema.settings?.themeColor}
            onUpdatePage={(updates) =>
              dispatch({
                type: 'UPDATE_PAGE',
                payload: { pageId: activePage.id, updates },
              })
            }
          />

          {/* Fields List */}
          <View style={styles.fieldsContainer}>
            <View style={styles.fieldsHeader}>
              <Text style={styles.fieldsTitle}>
                Fields in this section ({activePage.fields.length})
              </Text>
              <Pressable
                onPress={() => setIsPaletteOpen(true)}
                style={styles.addBtn}
              >
                <Text style={styles.addBtnText}>+ Add Component</Text>
              </Pressable>
            </View>

            {activePage.fields.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🧩</Text>
                <Text style={styles.emptyTitle}>No fields in this step yet</Text>
                <Text style={styles.emptySubtitle}>
                  Tap below to add inputs, choice questions, or quiz rubrics.
                </Text>
                <ActionButton
                  label="+ Add Field Component"
                  onPress={() => setIsPaletteOpen(true)}
                  secondary
                />
              </View>
            ) : (
              activePage.fields.map((field, idx) => (
                <StudioFieldCard
                  key={field.id}
                  field={field}
                  isSelected={state.selectedFieldId === field.id}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < activePage.fields.length - 1}
                  onSelect={() =>
                    dispatch({
                      type: 'SELECT_FIELD',
                      payload: { fieldId: field.id },
                    })
                  }
                  onMoveUp={() =>
                    dispatch({
                      type: 'REORDER_FIELDS',
                      payload: {
                        pageId: activePage.id,
                        fromIndex: idx,
                        toIndex: idx - 1,
                      },
                    })
                  }
                  onMoveDown={() =>
                    dispatch({
                      type: 'REORDER_FIELDS',
                      payload: {
                        pageId: activePage.id,
                        fromIndex: idx,
                        toIndex: idx + 1,
                      },
                    })
                  }
                  onDelete={() =>
                    dispatch({
                      type: 'REMOVE_FIELD',
                      payload: { pageId: activePage.id, fieldId: field.id },
                    })
                  }
                  onEditRubric={() => {
                    const hasRubric = Boolean((field as any).rubric);
                    if (hasRubric) {
                      dispatch({
                        type: 'SET_FIELD_RUBRIC',
                        payload: { fieldId: field.id, rubric: undefined },
                      });
                    } else {
                      dispatch({
                        type: 'SET_FIELD_RUBRIC',
                        payload: {
                          fieldId: field.id,
                          rubric: {
                            kind: 'single-choice',
                            points: 25,
                            correctValue: 'A',
                            explanation: 'Correct answer is option A.',
                            hint: { text: 'Look closely at option A', penaltyPercent: 10 },
                          },
                        },
                      });
                    }
                  }}
                />
              ))
            )}
          </View>
        </View>
      ) : (
        /* Preview / Live Test Drive Mode */
        <View style={styles.previewWrapper}>
          {/* Google Forms Header Card in Test Drive */}
          <View style={styles.previewHeaderCard}>
            <View style={[styles.previewHeaderAccentBar, { backgroundColor: previewThemeColor }]} />
            {previewCoverImage ? (
              <Image source={{ uri: previewCoverImage }} style={styles.previewCoverImage} resizeMode="cover" />
            ) : null}
            <View style={styles.previewHeaderCardContent}>
              <Text style={styles.previewFormTitle}>{state.schema.title || 'Untitled Form'}</Text>
              {state.schema.description ? (
                <Text style={styles.previewFormDesc}>{state.schema.description}</Text>
              ) : null}

              {previewCollectEmail ? (
                <View style={styles.previewEmailNotice}>
                  <Text style={styles.previewEmailNoticeText}>
                    ✉️ Recording responses for responder: <Text style={{ fontWeight: '700' }}>user@intuitui.local</Text> (Identity verified)
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Optional Progress Bar */}
          {previewShowProgressBar && state.schema.pages.length > 1 ? (
            <View style={styles.previewProgressCard}>
              <View style={styles.previewProgressHeader}>
                <Text style={styles.previewProgressLabel}>
                  Step {previewManager ? previewManager.getCurrentPageIndex() + 1 : 1} of {state.schema.pages.length}
                </Text>
                <Text style={styles.previewProgressPercent}>
                  {Math.round(((previewManager ? previewManager.getCurrentPageIndex() + 1 : 1) / state.schema.pages.length) * 100)}%
                </Text>
              </View>
              <View style={styles.previewProgressTrack}>
                <View
                  style={[
                    styles.previewProgressFill,
                    {
                      width: `${((previewManager ? previewManager.getCurrentPageIndex() + 1 : 1) / state.schema.pages.length) * 100}%`,
                      backgroundColor: previewThemeColor,
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}

          {/* Main Question Body Card */}
          <Panel style={styles.previewQuestionCard}>
            {submittedValues ? (
              <View style={styles.successReceipt}>
                <View style={[styles.receiptTopAccent, { backgroundColor: previewThemeColor }]} />
                <Text style={styles.successIcon}>🎉</Text>
                <Text style={styles.successTitle}>{state.schema.title || 'Form Complete'}</Text>
                <Text style={styles.successSub}>{previewConfirmationMessage}</Text>
                <View style={styles.receiptValuesBox}>
                  <Text style={styles.receiptCodeText}>
                    {JSON.stringify(submittedValues, null, 2)}
                  </Text>
                </View>
                <ActionButton
                  label="Submit another response"
                  secondary
                  onPress={() => {
                    setSubmittedValues(null);
                    setPreviewFieldValues({});
                    previewManager?.getFormManager().reset();
                    setPreviewStepTick(0);
                  }}
                />
              </View>
            ) : (
              <>
                {/* Section / Step Title Header */}
                <View style={[styles.previewSectionHeader, { borderLeftColor: previewThemeColor }]}>
                  <Text style={styles.previewSectionTitle}>
                    {previewManager?.getCurrentPage().title || `Section ${(previewManager ? previewManager.getCurrentPageIndex() : 0) + 1}`}
                  </Text>
                  {previewManager?.getCurrentPage().description ? (
                    <Text style={styles.previewSectionDesc}>
                      {previewManager.getCurrentPage().description}
                    </Text>
                  ) : null}
                </View>

                {/* Question Fields with Rich Inputs */}
                {previewManager?.getCurrentPage().fields.map((f) => {
                  const currentValue = previewFieldValues[f.name];
                  return (
                    <View key={f.id} style={styles.previewFieldCard}>
                      <View style={styles.previewFieldHeaderRow}>
                        <Text style={styles.previewFieldLabel}>
                          {f.label || f.name}
                        </Text>
                        {f.required ? <Text style={styles.previewRequiredAsterisk}>*</Text> : null}
                      </View>
                      {f.helperText ? (
                        <Text style={styles.previewFieldHelper}>{f.helperText}</Text>
                      ) : null}

                      {/* Interactive Widget by Type */}
                      {(f.type as string) === 'rating' || f.type === 'likert' ? (
                        <View style={styles.starRatingWidget}>
                          <View style={styles.starRow}>
                            {[1, 2, 3, 4, 5].map((star) => {
                              const filled = Number(currentValue) >= star;
                              return (
                                <Pressable
                                  key={star}
                                  onPress={() => {
                                    setPreviewFieldValues((prev) => ({ ...prev, [f.name]: star }));
                                    previewManager?.setFieldValue(f.name, star);
                                  }}
                                  style={styles.starBtn}
                                >
                                  <Text style={[styles.starChar, filled && styles.starCharFilled]}>
                                    {filled ? '★' : '☆'}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                          <Text style={styles.starScoreHint}>
                            {currentValue ? `${currentValue} of 5 Stars` : 'Tap to rate'}
                          </Text>
                        </View>
                      ) : f.type === 'select' || (f.type as string) === 'multiselect' ? (
                        <View style={styles.optionsWrap}>
                          {(f.options && f.options.length > 0
                            ? f.options
                            : [
                                { label: 'Strongly Agree', value: 'strongly_agree' },
                                { label: 'Agree', value: 'agree' },
                                { label: 'Neutral', value: 'neutral' },
                                { label: 'Disagree', value: 'disagree' },
                              ]
                          ).map((opt) => {
                            const isSelected = currentValue === opt.value;
                            return (
                              <Pressable
                                key={opt.value}
                                onPress={() => {
                                  setPreviewFieldValues((prev) => ({ ...prev, [f.name]: opt.value }));
                                  previewManager?.setFieldValue(f.name, opt.value);
                                }}
                                style={[
                                  styles.optionPill,
                                  isSelected && { backgroundColor: previewThemeColor, borderColor: previewThemeColor },
                                ]}
                              >
                                <Text style={[styles.optionPillText, isSelected && styles.optionPillTextSelected]}>
                                  {isSelected ? '● ' : '○ '}
                                  {opt.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : f.type === 'textarea' ? (
                        <TextInput
                          style={[styles.previewInput, styles.previewTextarea]}
                          multiline
                          numberOfLines={3}
                          placeholder="Your answer"
                          placeholderTextColor={colors.muted}
                          value={String(currentValue ?? '')}
                          onChangeText={(val) => {
                            setPreviewFieldValues((prev) => ({ ...prev, [f.name]: val }));
                            previewManager?.setFieldValue(f.name, val);
                          }}
                        />
                      ) : (
                        <TextInput
                          style={styles.previewInput}
                          keyboardType={f.type === 'email' ? 'email-address' : f.type === 'number' ? 'numeric' : 'default'}
                          placeholder="Your answer"
                          placeholderTextColor={colors.muted}
                          value={String(currentValue ?? '')}
                          onChangeText={(val) => {
                            setPreviewFieldValues((prev) => ({ ...prev, [f.name]: val }));
                            previewManager?.setFieldValue(f.name, val);
                          }}
                        />
                      )}
                    </View>
                  );
                })}

                {/* Bottom Navigation */}
                <View style={styles.previewControls}>
                  {!previewManager?.isFirstStep() ? (
                    <ActionButton
                      label="Back"
                      onPress={() => {
                        previewManager?.prevStep();
                        setPreviewStepTick((t) => t + 1);
                      }}
                      secondary
                    />
                  ) : null}
                  <ActionButton
                    label={previewManager?.isLastStep() ? 'Submit' : 'Next'}
                    onPress={() => {
                      if (previewManager?.isLastStep()) {
                        previewManager.submit();
                      } else {
                        previewManager?.nextStep();
                        setPreviewStepTick((t) => t + 1);
                      }
                    }}
                  />
                </View>
              </>
            )}
          </Panel>
        </View>
      )}

      {/* Palette Modal */}
      <StudioPaletteModal
        visible={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        onAddField={handleAddField}
      />

      {/* AI Assistant Modal */}
      <StudioAiModal
        visible={isAiModalOpen}
        store={store}
        onClose={() => setIsAiModalOpen(false)}
        onApplySchema={(newSchema) => {
          dispatch({ type: 'SET_SCHEMA', payload: newSchema });
        }}
      />

      {/* Zero-Backend Share Modal */}
      <StudioShareModal
        visible={isShareModalOpen}
        schema={store.toFormSchema()}
        onClose={() => setIsShareModalOpen(false)}
        onImportSchema={(imported) => {
          dispatch({ type: 'SET_SCHEMA', payload: imported });
        }}
      />

      {/* Export JSON Modal */}
      <Modal
        visible={Boolean(exportedJson)}
        transparent
        animationType="fade"
        onRequestClose={() => setExportedJson(null)}
      >
        <View style={styles.exportOverlay}>
          <View style={styles.exportCard}>
            <Text style={styles.exportTitle}>Compiled Schema JSON</Text>
            <ScrollView style={styles.exportScroll}>
              <Text style={styles.exportCodeText}>{exportedJson}</Text>
            </ScrollView>
            <ActionButton label="Close" onPress={() => setExportedJson(null)} />
          </View>
        </View>
      </Modal>
    </AppPage>
  );
}

const styles = StyleSheet.create({
  editWorkspace: {
    gap: 12,
  },
  pageMetaPanel: {
    padding: 14,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.canvas,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.ink,
  },
  fieldsContainer: {
    gap: 8,
  },
  fieldsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  fieldsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },
  addBtn: {
    backgroundColor: colors.violet,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyState: {
    backgroundColor: colors.paper,
    borderRadius: radii.medium,
    padding: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    alignItems: 'center',
    gap: 8,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  emptySubtitle: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 12,
  },
  previewWrapper: {
    gap: 16,
  },
  previewHeaderCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.large,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  previewHeaderAccentBar: {
    height: 10,
    width: '100%',
  },
  previewCoverImage: {
    width: '100%',
    height: 140,
  },
  previewHeaderCardContent: {
    padding: 20,
    gap: 8,
  },
  previewFormTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
  },
  previewFormDesc: {
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  previewEmailNotice: {
    backgroundColor: colors.canvas,
    borderRadius: radii.small,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 6,
  },
  previewEmailNoticeText: {
    fontSize: 12,
    color: colors.muted,
  },
  previewProgressCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.medium,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 6,
  },
  previewProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewProgressLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  previewProgressPercent: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
  },
  previewProgressTrack: {
    height: 6,
    backgroundColor: colors.canvas,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  previewProgressFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  previewQuestionCard: {
    padding: 20,
    gap: 16,
  },
  previewSectionHeader: {
    borderLeftWidth: 4,
    paddingLeft: 12,
    gap: 4,
    marginBottom: 4,
  },
  previewSectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  previewSectionDesc: {
    fontSize: 13,
    color: colors.muted,
  },
  previewFieldCard: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    padding: 14,
    gap: 8,
  },
  previewFieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  previewFieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  previewRequiredAsterisk: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.red,
  },
  previewFieldHelper: {
    fontSize: 12,
    color: colors.muted,
    marginTop: -4,
  },
  previewInput: {
    backgroundColor: colors.paper,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
  },
  previewTextarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  starRatingWidget: {
    gap: 6,
  },
  starRow: {
    flexDirection: 'row',
    gap: 8,
  },
  starBtn: {
    padding: 4,
  },
  starChar: {
    fontSize: 28,
    color: colors.faint,
  },
  starCharFilled: {
    color: '#EAB308',
  },
  starScoreHint: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  optionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionPill: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  optionPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  optionPillTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  receiptTopAccent: {
    height: 4,
    width: 60,
    borderRadius: radii.pill,
    marginBottom: 8,
  },
  previewControls: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  exportOverlay: {
    flex: 1,
    backgroundColor: 'rgba(21, 34, 56, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  exportCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.large,
    padding: 20,
    maxHeight: '80%',
    gap: 12,
  },
  exportTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  exportScroll: {
    backgroundColor: colors.canvas,
    padding: 12,
    borderRadius: radii.small,
    maxHeight: 350,
  },
  exportCodeText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: colors.ink,
  },
  successReceipt: {
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  successIcon: {
    fontSize: 32,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  successSub: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 8,
  },
  receiptValuesBox: {
    backgroundColor: colors.canvas,
    borderRadius: radii.medium,
    padding: 12,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  receiptCodeText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: colors.ink,
  },
});
