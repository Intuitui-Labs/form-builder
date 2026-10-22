import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import {
  MultiStepFormManager,
  type FormSchema,
} from '@intuitui-labs/form-builder-engine';
import {
  ActionButton,
  FieldControl,
  Panel,
  StepMeter,
  Tag,
} from '../components/FeedoraUi';
import {
  progressPort,
  rewardPort,
  store,
  transportPort,
  useFeedora,
  qrAirDropPort,
} from '../feedora';
import { convertRemoteSurveyToSchema } from '../domain/surveySchemaConverter';
import { FEEDORA_FEATURES } from '../fixtures/seed';
import {
  HMSAM_CONSTRUCTS,
  HMSAM_ITEMS,
  type HMSAMConstructId,
} from '../domain/hmsam';
import type {
  CreateSurveyPayload,
  StudioQuestionPayload,
  StudioSurvey,
} from '../domain/ports/ICreatorStudioPort';
import type { RemoteSurveyMeta } from '../domain/ports/transportTypes';
import { getSharableSurveyUrl } from '../config';
import { NativeQrView } from '../components/NativeQrView';
import { LegendList } from '@legendapp/list/react-native';
import { colors, radii, serifFont } from '../theme';

// ---------------------------------------------------------------------------
// Research Presets & Instrument Templates
// ---------------------------------------------------------------------------
const TEMPLATE_CORE_8: StudioQuestionPayload[] = [
  {
    text: 'I find features of this application easy to learn and operate.',
    code: 'PEU1',
    type: 'likert',
    construct: 'peou',
    required: true,
    ratingMax: 5,
    ratingStyle: 'likert',
    sectionTitle: 'Perceived Ease of Use',
  },
  {
    text: 'I find this application useful in my daily routine.',
    code: 'PU1',
    type: 'likert',
    construct: 'pu',
    required: true,
    ratingMax: 5,
    ratingStyle: 'likert',
    sectionTitle: 'Perceived Usefulness',
  },
  {
    text: 'I find using this application to be an enjoyable experience.',
    code: 'JOY1',
    type: 'likert',
    construct: 'joy',
    required: true,
    ratingMax: 5,
    ratingStyle: 'likert',
    sectionTitle: 'Joy & Enjoyment',
  },
  {
    text: 'Using this system excites my curiosity to discover more features.',
    code: 'CUR1',
    type: 'likert',
    construct: 'curiosity',
    required: true,
    ratingMax: 5,
    ratingStyle: 'likert',
    sectionTitle: 'Curiosity',
  },
  {
    text: 'I feel in full control over how I use and interact with this system.',
    code: 'CTR1',
    type: 'likert',
    construct: 'control',
    required: true,
    ratingMax: 5,
    ratingStyle: 'likert',
    sectionTitle: 'User Control',
  },
  {
    text: 'I find myself deeply focused and immersed when using this system.',
    code: 'IMM1',
    type: 'likert',
    construct: 'fi',
    required: true,
    ratingMax: 5,
    ratingStyle: 'likert',
    sectionTitle: 'Focused Immersion',
  },
  {
    text: 'I intend to continue using this application frequently in the future.',
    code: 'BIU1',
    type: 'likert',
    construct: 'biu',
    required: true,
    ratingMax: 5,
    ratingStyle: 'likert',
    sectionTitle: 'Behavioural Intention',
  },
  {
    text: 'What is your primary operating platform?',
    code: 'PLAT1',
    type: 'mcq',
    required: true,
    sectionTitle: 'Demographics & Context',
    options: ['iOS Mobile App', 'Android Expo Go', 'Desktop Web Browser', 'Tablet'],
  },
];

const TEMPLATE_USABILITY_5: StudioQuestionPayload[] = [
  {
    text: 'Overall, how satisfied are you with this application?',
    code: 'CSAT1',
    type: 'rating',
    required: true,
    ratingMax: 5,
    ratingStyle: 'stars',
    sectionTitle: 'Overall Satisfaction',
  },
  {
    text: 'The application was simple to navigate without confusion.',
    code: 'USAB1',
    type: 'likert',
    required: true,
    ratingMax: 5,
    ratingStyle: 'likert',
    sectionTitle: 'Usability Evaluation',
  },
  {
    text: 'How frequently do you expect to use this application?',
    code: 'FREQ1',
    type: 'mcq',
    required: true,
    sectionTitle: 'Usage Profile',
    options: ['Multiple times daily', 'Daily', '2-3 times a week', 'Rarely'],
  },
  {
    text: 'What feature did you find most valuable in your session?',
    code: 'BEST1',
    type: 'short',
    required: false,
    sectionTitle: 'Qualitative Feedback',
  },
  {
    text: 'What is one thing the development team should improve?',
    code: 'IMPR1',
    type: 'open',
    required: false,
    sectionTitle: 'Qualitative Feedback',
  },
];

const TEMPLATE_BLANK: StudioQuestionPayload[] = [
  {
    text: 'I find this software intuitive and responsive.',
    code: 'Q1',
    type: 'likert',
    required: true,
    ratingMax: 5,
    ratingStyle: 'likert',
    sectionTitle: 'General Evaluation',
  },
];

const CONSTRUCT_OPTIONS = [
  { id: '', label: 'None (Demographic/General)' },
  { id: 'peou', label: 'PEOU • Ease of Use' },
  { id: 'pu', label: 'PU • Usefulness' },
  { id: 'joy', label: 'JOY • Hedonic Value' },
  { id: 'curiosity', label: 'CUR • Curiosity' },
  { id: 'control', label: 'CTR • Control' },
  { id: 'fi', label: 'FI • Focused Immersion' },
  { id: 'biu', label: 'BIU • Intention to Use' },
];

const QUESTION_TYPES = [
  { id: 'likert', label: 'Likert Scale', icon: '📏' },
  { id: 'rating', label: 'Star Rating', icon: '⭐' },
  { id: 'mcq', label: 'Multiple Choice', icon: '🔘' },
  { id: 'short', label: 'Short Text', icon: '✏️' },
  { id: 'open', label: 'Long Answer', icon: '📝' },
] as const;

export default function StudioScreen() {
  const {
    authUser,
    effectiveRole,
    switchPreviewRole,
    openWelcome,
    studioPort,
    openAuthModal,
    openAccountDrawer,
    openSurvey,
    openAirDropSurvey,
  } = useFeedora();

  const isCreatorOrStaff =
    effectiveRole === 'creator' || Boolean(authUser?.isStaff);

  const [activeTab, setActiveTab] = useState<'surveys' | 'builder'>('surveys');
  const [surveys, setSurveys] = useState<StudioSurvey[]>([]);
  const [loadingSurveys, setLoadingSurveys] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [policyTarget, setPolicyTarget] = useState<{ uuid: string; title: string } | null>(null);
  const [publishSuccess, setPublishSuccess] = useState<{
    uuid: string;
    accessCode: string;
    title: string;
  } | null>(null);

  // Form Builder State
  const [formTitle, setFormTitle] = useState('Hedonic Adoption Study');
  const [formDesc, setFormDesc] = useState('Investigating user immersion, joy, and perceived ease of use.');
  const [isHmsam, setIsHmsam] = useState(true);
  const [questions, setQuestions] = useState<StudioQuestionPayload[]>(TEMPLATE_CORE_8);
  const [requiresAccount, setRequiresAccount] = useState(false);
  const [allowRedo, setAllowRedo] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState('1');
  const [cooldownMinutes, setCooldownMinutes] = useState('');
  const [prerequisiteIds, setPrerequisiteIds] = useState<string[]>([]);
  const [prerequisiteDelayMinutes, setPrerequisiteDelayMinutes] = useState('');
  const [sequenceGroup, setSequenceGroup] = useState('');
  const [sequenceOrder, setSequenceOrder] = useState('1');
  const [enforceSequence, setEnforceSequence] = useState(false);
  const [draftSavedStatus, setDraftSavedStatus] = useState<string>('Auto-saved');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const buildAccessFeatures = useCallback(() => ({
    accessPolicy: {
      requiresAccount,
      allowRedo,
      rewardStrategy: allowRedo ? 'score_delta' : 'first_attempt_only',
      ...(Number(maxAttempts) > 0 ? { maxAttempts: Number(maxAttempts) } : {}),
      ...(Number(cooldownMinutes) > 0 ? { cooldownMinutes: Number(cooldownMinutes) } : {}),
    },
    prerequisites: {
      completedFormIds: prerequisiteIds,
      ...(Number(prerequisiteDelayMinutes) > 0
        ? { unlockDelayMs: Number(prerequisiteDelayMinutes) * 60_000 }
        : {}),
    },
    ...(sequenceGroup.trim()
      ? { sequence: { groupId: sequenceGroup.trim(), order: Math.max(1, Number(sequenceOrder) || 1), enforce: enforceSequence } }
      : {}),
  }), [requiresAccount, allowRedo, maxAttempts, cooldownMinutes, prerequisiteIds, prerequisiteDelayMinutes, sequenceGroup, sequenceOrder, enforceSequence]);

  // Instant QR & P2P Distribution State
  const [isAirDropOpen, setIsAirDropOpen] = useState(false);
  const [airDropSlug, setAirDropSlug] = useState('');
  const [airDropTitle, setAirDropTitle] = useState('');
  const [airDropAccessCode, setAirDropAccessCode] = useState('');
  const [airDropQrDataUrl, setAirDropQrDataUrl] = useState<string | null>(null);
  const [airDropTab, setAirDropTab] = useState<'link' | 'offline'>('link');
  const [generatingQr, setGeneratingQr] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // ---------------------------------------------------------------------------
  // Draft Auto-Persistence
  // ---------------------------------------------------------------------------
  const draftLoaded = useRef(false);

  useEffect(() => {
    let isMounted = true;
    store.getItem('feedora_studio_draft').then((raw) => {
      if (!isMounted || !raw || draftLoaded.current) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.formTitle !== undefined) setFormTitle(parsed.formTitle);
        if (parsed.formDesc !== undefined) setFormDesc(parsed.formDesc);
        if (parsed.isHmsam !== undefined) setIsHmsam(parsed.isHmsam);
        if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
          setQuestions(parsed.questions);
        }
        if (parsed.requiresAccount !== undefined) setRequiresAccount(Boolean(parsed.requiresAccount));
        if (parsed.allowRedo !== undefined) setAllowRedo(Boolean(parsed.allowRedo));
        if (parsed.maxAttempts !== undefined) setMaxAttempts(String(parsed.maxAttempts));
        if (parsed.cooldownMinutes !== undefined) setCooldownMinutes(String(parsed.cooldownMinutes));
        if (Array.isArray(parsed.prerequisiteIds)) setPrerequisiteIds(parsed.prerequisiteIds.map(String));
        if (parsed.prerequisiteDelayMinutes !== undefined) setPrerequisiteDelayMinutes(String(parsed.prerequisiteDelayMinutes));
        if (parsed.sequenceGroup !== undefined) setSequenceGroup(String(parsed.sequenceGroup));
        if (parsed.sequenceOrder !== undefined) setSequenceOrder(String(parsed.sequenceOrder));
        if (parsed.enforceSequence !== undefined) setEnforceSequence(Boolean(parsed.enforceSequence));
        draftLoaded.current = true;
        setDraftSavedStatus('Draft restored');
        setTimeout(() => setDraftSavedStatus('Auto-saved'), 2500);
      } catch {
        // Fall back to default
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const payload = JSON.stringify({
        formTitle,
        formDesc,
        isHmsam,
        questions,
        requiresAccount,
        allowRedo,
        maxAttempts,
        cooldownMinutes,
        prerequisiteIds,
        prerequisiteDelayMinutes,
        sequenceGroup,
        sequenceOrder,
        enforceSequence,
        savedAt: Date.now(),
      });
      store.setItem('feedora_studio_draft', payload).then(() => {
        setDraftSavedStatus('Auto-saved');
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [formTitle, formDesc, isHmsam, questions, requiresAccount, allowRedo, maxAttempts, cooldownMinutes, prerequisiteIds, prerequisiteDelayMinutes, sequenceGroup, sequenceOrder, enforceSequence]);

  // ---------------------------------------------------------------------------
  // Load existing Django fleet surveys
  // ---------------------------------------------------------------------------
  const loadSurveys = useCallback(async () => {
    setLoadingSurveys(true);
    try {
      const list = await studioPort.listSurveys();
      setSurveys(list);
    } catch {
      // Handled inside adapter
    } finally {
      setLoadingSurveys(false);
    }
  }, [studioPort]);

  const handleSaveSurveyPolicy = async () => {
    if (!policyTarget || !studioPort.updateSurveyPolicy) return;
    setPublishing(true);
    try {
      await studioPort.updateSurveyPolicy(policyTarget.uuid, buildAccessFeatures());
      await loadSurveys();
      setPolicyTarget(null);
      setActiveTab('surveys');
      Alert.alert('Availability updated', 'The survey rules are saved and will be reflected in the respondent survey list.');
    } catch (err) {
      Alert.alert('Could not save rules', (err as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    loadSurveys();
  }, [loadSurveys, authUser]);

  // ---------------------------------------------------------------------------
  // Template Loaders
  // ---------------------------------------------------------------------------
  const applyTemplate = (name: 'hmsam_full' | 'core_8' | 'usability' | 'blank') => {
    Alert.alert(
      'Load Instrument Template',
      'This will replace your current questions deck with the selected template. Proceed?',
      [
        {
          text: 'Load Template',
          style: 'destructive',
          onPress: () => {
            if (name === 'hmsam_full') {
              setFormTitle('Hedonic-Motivation System Adoption Model (HMSAM 38-Item)');
              setFormDesc('Standardized comprehensive 38-item psychometric instrument measuring ease, usefulness, joy, curiosity, control, immersion and intention.');
              setIsHmsam(true);
              setQuestions(
                HMSAM_ITEMS.map((item) => ({
                  text: item.prompt,
                  code: item.code,
                  type: 'likert' as const,
                  construct: item.constructId,
                  required: true,
                  ratingMax: 5,
                  ratingStyle: 'likert',
                  sectionTitle: HMSAM_CONSTRUCTS[item.constructId]?.label || 'HMSAM',
                })),
              );
            } else if (name === 'core_8') {
              setFormTitle('HMSAM Core 8-Item Quick Scale');
              setFormDesc('High-velocity 8-item survey testing all hedonic constructs and primary operating platform.');
              setIsHmsam(true);
              setQuestions(TEMPLATE_CORE_8);
            } else if (name === 'usability') {
              setFormTitle('Product Usability & CSAT Instrument');
              setFormDesc('Five-question evaluation assessing ease of use, user satisfaction, usage frequency, and qualitative suggestions.');
              setIsHmsam(false);
              setQuestions(TEMPLATE_USABILITY_5);
            } else {
              setFormTitle('Untitled Research Instrument');
              setFormDesc('Custom survey created in Feedora Studio.');
              setIsHmsam(false);
              setQuestions(TEMPLATE_BLANK);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  // ---------------------------------------------------------------------------
  // Question Deck Mutators
  // ---------------------------------------------------------------------------
  const handleAddQuestion = (type: 'likert' | 'rating' | 'mcq' | 'short' | 'open') => {
    const nextNum = questions.length + 1;
    const newQ: StudioQuestionPayload = {
      text:
        type === 'mcq'
          ? 'Which of the following describes your primary usage?'
          : type === 'short'
            ? 'What is your current department or field of study?'
            : type === 'open'
              ? 'What recommendations do you have to improve this workflow?'
              : type === 'rating'
                ? 'Rate the overall responsiveness of this experience.'
                : 'Using this system is intuitive and seamless for me.',
      code: `Q${nextNum}`,
      type,
      required: true,
      ratingMax: 5,
      ratingStyle: type === 'rating' ? 'stars' : 'likert',
      sectionTitle: isHmsam ? 'Perceived Ease of Use' : 'General Questions',
      construct: isHmsam ? 'peou' : undefined,
      options:
        type === 'mcq'
          ? ['Option 1', 'Option 2', 'Option 3']
          : undefined,
    };
    setQuestions([...questions, newQ]);
  };

  const handleRemoveQuestion = (idx: number) => {
    if (questions.length <= 1) {
      Alert.alert('Cannot Delete', 'An instrument must have at least one question.');
      return;
    }
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const handleMoveQuestion = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= questions.length) return;
    const copy = [...questions];
    const temp = copy[idx]!;
    copy[idx] = copy[targetIdx]!;
    copy[targetIdx] = temp;
    setQuestions(copy);
  };

  const handleDuplicateQuestion = (idx: number) => {
    const source = questions[idx]!;
    const duplicated: StudioQuestionPayload = {
      ...source,
      code: source.code ? `${source.code}_copy` : `Q${questions.length + 1}`,
      options: source.options ? [...source.options] : undefined,
    };
    const copy = [...questions];
    copy.splice(idx + 1, 0, duplicated);
    setQuestions(copy);
  };

  const handleUpdateQuestion = (idx: number, patch: Partial<StudioQuestionPayload>) => {
    const updated = [...questions];
    updated[idx] = { ...updated[idx]!, ...patch };
    setQuestions(updated);
  };

  // MCQ Option Helpers
  const handleAddOption = (qIdx: number) => {
    const q = questions[qIdx]!;
    const opts = q.options ? [...q.options] : [];
    opts.push(`Option ${opts.length + 1}`);
    handleUpdateQuestion(qIdx, { options: opts });
  };

  const handleUpdateOption = (qIdx: number, optIdx: number, val: string) => {
    const q = questions[qIdx]!;
    if (!q.options) return;
    const opts = [...q.options];
    opts[optIdx] = val;
    handleUpdateQuestion(qIdx, { options: opts });
  };

  const handleRemoveOption = (qIdx: number, optIdx: number) => {
    const q = questions[qIdx]!;
    if (!q.options || q.options.length <= 2) {
      Alert.alert('Minimum Options', 'Multiple choice questions require at least 2 choices.');
      return;
    }
    const opts = q.options.filter((_, i) => i !== optIdx);
    handleUpdateQuestion(qIdx, { options: opts });
  };

  const handleApplyOptionPreset = (qIdx: number, preset: 'yesno' | 'agree' | 'freq') => {
    let opts: string[] = [];
    if (preset === 'yesno') {
      opts = ['Yes', 'No', 'Not Sure'];
    } else if (preset === 'agree') {
      opts = ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];
    } else {
      opts = ['Daily', 'Weekly', 'Monthly', 'Never'];
    }
    handleUpdateQuestion(qIdx, { options: opts });
  };

  // ---------------------------------------------------------------------------
  // Publishing to Django Backend
  // ---------------------------------------------------------------------------
  const handlePublishSurvey = async (isDraft = false) => {
    if (!authUser) {
      Alert.alert(
        'Authentication Required',
        'Please sign in or register as a Form Creator to publish surveys to the Django backend.',
        [
          { text: 'Sign In / Register', onPress: openAuthModal },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    if (authUser.role !== 'creator' && !authUser.isStaff) {
      Alert.alert(
        'Creator Account Required',
        'You are currently signed in as a Respondent. Publishing research instruments requires a Form Creator account.',
        [
          { text: 'Switch Account', onPress: openAuthModal },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    if (!formTitle.trim()) {
      Alert.alert('Required Field', 'Please provide an instrument title.');
      return;
    }
    if (questions.length === 0) {
      Alert.alert('Required Field', 'Please add at least one question.');
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]!;
      if (!q.text.trim()) {
        Alert.alert('Incomplete Question', `Question #${i + 1} is missing statement text.`);
        return;
      }
      if (q.type === 'mcq' && (!q.options || q.options.length < 2)) {
        Alert.alert('Incomplete MCQ', `Question #${i + 1} requires at least 2 choice options.`);
        return;
      }
    }

    setPublishing(true);
    setPublishSuccess(null);

    try {
      const payload: CreateSurveyPayload = {
        title: formTitle.trim(),
        description: formDesc.trim(),
        is_hmsam: isHmsam,
        is_draft: isDraft,
        features: {
          accessPolicy: {
            requiresAccount,
            allowRedo,
            rewardStrategy: allowRedo ? 'score_delta' : 'first_attempt_only',
            ...(Number(maxAttempts) > 0 ? { maxAttempts: Number(maxAttempts) } : {}),
            ...(Number(cooldownMinutes) > 0 ? { cooldownMinutes: Number(cooldownMinutes) } : {}),
          },
          ...(prerequisiteIds.length ? { prerequisites: { completedFormIds: prerequisiteIds, ...(Number(prerequisiteDelayMinutes) > 0 ? { unlockDelayMs: Number(prerequisiteDelayMinutes) * 60_000 } : {}) } } : {}),
          ...(sequenceGroup.trim() ? { sequence: { groupId: sequenceGroup.trim(), order: Math.max(1, Number(sequenceOrder) || 1), enforce: enforceSequence } } : {}),
        },
        questions,
      };

      const result = await studioPort.createSurvey(payload);
      setPublishSuccess({
        uuid: result.uuid,
        accessCode: result.accessCode,
        title: formTitle,
      });

      // Clear draft on successful live publication
      if (!isDraft) {
        await store.removeItem('feedora_studio_draft');
      }

      await loadSurveys();
      setActiveTab('surveys');
    } catch (err) {
      Alert.alert('Publish Error', (err as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Prepare Preview Metadata
  // ---------------------------------------------------------------------------
  const previewMeta: RemoteSurveyMeta = useMemo(() => ({
    survey: {
      id: 9999,
      uuid: 'preview-uuid',
      title: formTitle.trim() || 'Untitled Instrument',
      description: formDesc.trim() || 'Feedora Engine Preview Mode',
      is_hmsam: isHmsam,
      access_code: 'PREVIEW',
    },
    questions: questions.map((q, idx) => ({
      id: idx + 1,
      text: q.text || `Question ${idx + 1}`,
      code: q.code || `Q${idx + 1}`,
      type: q.type,
      construct: q.construct || '',
      required: q.required ?? true,
      options: (q.options || []).map((opt, oIdx) => ({
        id: oIdx + 1,
        text: opt,
        order: oIdx,
      })),
      ratingMax: q.ratingMax || 5,
      ratingStyle: q.ratingStyle || 'likert',
      sectionTitle:
        q.sectionTitle ||
        (isHmsam && q.construct
          ? HMSAM_CONSTRUCTS[q.construct as HMSAMConstructId]?.label || 'HMSAM Questions'
          : 'General Questions'),
      sectionNum: 1,
    })),
    features: FEEDORA_FEATURES as unknown as Record<string, unknown>,
  }), [formTitle, formDesc, isHmsam, questions]);

  const getShareLink = useCallback((code: string) => {
    return getSharableSurveyUrl(code).webUrl;
  }, []);

  const updateQrImage = useCallback(
    (_mode: 'link' | 'offline', _code: string, _slug: string) => {
      // Dynamic rendering handled reactively by NativeQrView
    },
    [],
  );

  const handleOpenAirDrop = (customMeta?: RemoteSurveyMeta, customCode?: string) => {
    const targetMeta = customMeta || previewMeta;
    const targetSchema = convertRemoteSurveyToSchema(targetMeta);
    const manifest = qrAirDropPort.encodeManifest(targetSchema);
    const code = customCode || targetMeta.survey.access_code || 'PREVIEW';
    setAirDropSlug(manifest);
    setAirDropTitle(targetSchema.title);
    setAirDropAccessCode(code);
    setAirDropTab('link');
    setIsAirDropOpen(true);
    setCopiedSlug(false);
    setCopiedLink(false);
    updateQrImage('link', code, manifest);
  };

  if (!isCreatorOrStaff) {
    return (
      <View style={styles.container}>
        <View style={styles.appBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.appBarBrand}>Feedora Studio</Text>
            <Text style={styles.appBarSubtitle}>🔒 Creator Suite Restricted</Text>
          </View>
          <Pressable style={styles.avatarBtn} onPress={openAccountDrawer}>
            <Text style={styles.avatarEmoji}>{authUser?.avatar || '🎓'}</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: '#FAF5FF',
              justifyContent: 'center',
              alignItems: 'center',
              borderWidth: 2,
              borderColor: '#E9D5FF',
            }}
          >
            <Text style={{ fontSize: 36 }}>🔬🔒</Text>
          </View>
          <Text
            style={{
              fontSize: 22,
              fontWeight: '800',
              color: colors.ink,
              fontFamily: serifFont,
              textAlign: 'center',
            }}
          >
            Researcher Studio Restricted
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: colors.muted,
              textAlign: 'center',
              lineHeight: 20,
              maxWidth: 380,
            }}
          >
            Creator Studio is exclusively available for research creators, faculty, and PIs. As a Respondent, you can participate in active surveys on the Survey tab.
          </Text>
          {authUser?.role === 'creator' ? (
            <Pressable
              style={{
                backgroundColor: colors.primary,
                borderRadius: radii.medium,
                paddingHorizontal: 20,
                paddingVertical: 12,
                marginTop: 8,
              }}
              onPress={() => switchPreviewRole(null)}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>
                Exit Respondent Preview & Return to Creator Suite 🔬
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={{
                backgroundColor: colors.primary,
                borderRadius: radii.medium,
                paddingHorizontal: 20,
                paddingVertical: 12,
                marginTop: 8,
              }}
              onPress={openWelcome}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>
                Sign In as Research Creator →
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* App Bar */}
      <View style={styles.appBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.appBarBrand}>Feedora Studio</Text>
          <Text style={styles.appBarSubtitle} numberOfLines={1}>
            {isCreatorOrStaff
              ? authUser?.organizationName || 'Research Lab'
              : 'Respondent Preview'}
          </Text>
        </View>

        <Pressable style={styles.avatarBtn} onPress={openAccountDrawer}>
          <Text style={styles.avatarEmoji}>{authUser?.avatar || '🔬'}</Text>
        </Pressable>
      </View>

      {/* Non-Creator Advisory Banner */}
      {!isCreatorOrStaff && (
        <View style={styles.advisoryCard}>
          <View style={styles.advisoryTextCol}>
            <Text style={styles.advisoryTitle}>Creator Permissions Available</Text>
            <Text style={styles.advisoryDesc}>
              Switch to Creator to scaffold studies directly to Django.
            </Text>
          </View>
          <Pressable style={styles.advisoryBtn} onPress={openAuthModal}>
            <Text style={styles.advisoryBtnText}>Switch</Text>
          </Pressable>
        </View>
      )}

      {/* View Switcher Tabs */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabBtn, activeTab === 'surveys' && styles.tabBtnActive]}
          onPress={() => setActiveTab('surveys')}
        >
          <Text style={[styles.tabText, activeTab === 'surveys' && styles.tabTextActive]}>
            📚 Fleet ({surveys.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === 'builder' && styles.tabBtnActive]}
          onPress={() => setActiveTab('builder')}
        >
          <Text style={[styles.tabText, activeTab === 'builder' && styles.tabTextActive]}>
            ⚡ Scaffolder ({questions.length})
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Celebration Banner for New Survey */}
        {publishSuccess && (
          <View style={styles.celebrationCard}>
            <Text style={styles.celebrationEmoji}>🎉</Text>
            <View style={styles.celebrationTextCol}>
              <Text style={styles.celebrationTitle}>Survey Published</Text>
              <Text style={styles.celebrationSubtitle}>
                "{publishSuccess.title}" is live · Code:{' '}
                <Text style={styles.codeHighlight}>{publishSuccess.accessCode}</Text>
              </Text>
              <Pressable
                style={styles.celebrationShareBtn}
                onPress={async () => {
                  try {
                    const meta = await transportPort.fetchSurveyMeta(publishSuccess.uuid);
                    handleOpenAirDrop(meta, publishSuccess.accessCode);
                  } catch {
                    handleOpenAirDrop(undefined, publishSuccess.accessCode);
                  }
                }}
              >
                <Text style={styles.celebrationShareBtnText}>📲 Share QR Code</Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.dismissBtn}
              onPress={() => setPublishSuccess(null)}
            >
              <Text style={styles.dismissText}>✕</Text>
            </Pressable>
          </View>
        )}

        {/* TAB 1: SURVEYS FLEET */}
        {activeTab === 'surveys' && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Research Database</Text>
              </View>
              <Pressable style={styles.refreshBtn} onPress={loadSurveys}>
                <Text style={styles.refreshBtnText}>🔄 Refresh</Text>
              </Pressable>
            </View>

            {loadingSurveys ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingText}>Syncing with Django API…</Text>
              </View>
            ) : surveys.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>📋</Text>
                <Text style={styles.emptyTitle}>No Surveys Found</Text>
                <Text style={styles.emptyDesc}>
                  Connect to Django server or use the Form Scaffolder tab to publish your first instrument.
                </Text>
                <Pressable
                  style={styles.emptyBtn}
                  onPress={() => setActiveTab('builder')}
                >
                  <Text style={styles.emptyBtnText}>Open Form Scaffolder →</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.surveyList}>
                <LegendList
                  data={surveys}
                  keyExtractor={(s) => String(s.id || s.uuid)}
                  renderItem={({ item: s }) => (
                    <View style={styles.surveyCard}>
                    <View style={styles.surveyCardHeader}>
                      <View style={styles.surveyTitleCol}>
                        <Text style={styles.surveyTitle}>{s.title}</Text>
                        <Text style={styles.surveyDesc} numberOfLines={2}>
                          {s.description || 'No description provided.'}
                        </Text>
                      </View>
                      <View style={styles.badgeCol}>
                        {s.accessCode ? (
                          <View style={styles.codeBadge}>
                            <Text style={styles.codeBadgeText}>{s.accessCode}</Text>
                          </View>
                        ) : null}
                        {s.isHmsam && (
                          <View style={styles.hmsamBadge}>
                            <Text style={styles.hmsamBadgeText}>HMSAM</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={styles.surveyMetaRow}>
                      <Text style={styles.metaStat}>
                        📝 {s.questionsCount} Questions
                      </Text>
                      <Text style={styles.metaStat}>
                        👥 {s.responsesCount} Responses
                      </Text>
                      <Text
                        style={[
                          styles.metaStatus,
                          s.isActive ? styles.statusActive : styles.statusDraft,
                        ]}
                      >
                        {s.isActive ? '● Live' : '○ Draft'}
                      </Text>
                    </View>

                    <View style={styles.cardActionsRow}>
                      <Pressable
                        style={styles.cardActionPrimary}
                        onPress={async () => {
                          await openSurvey(s.uuid);
                          router.replace('/');
                        }}
                      >
                        <Text style={styles.cardActionPrimaryText}>Take in Engine 🚀</Text>
                      </Pressable>
                      <Pressable
                        style={styles.cardActionSecondary}
                        onPress={async () => {
                          try {
                            const meta = await transportPort.fetchSurveyMeta(s.uuid);
                            setFormTitle(meta.survey.title);
                            setFormDesc(meta.survey.description || '');
                            setIsHmsam(meta.survey.is_hmsam);
                            const access = (meta.features?.accessPolicy || {}) as Record<string, unknown>;
                            setRequiresAccount(Boolean(access.requiresAccount));
                            setAllowRedo(Boolean(access.allowRedo));
                            setMaxAttempts(access.maxAttempts != null ? String(access.maxAttempts) : '');
                            setCooldownMinutes(access.cooldownMinutes != null ? String(access.cooldownMinutes) : '');
                            setPrerequisiteIds(meta.survey.prerequisites || []);
                            setPrerequisiteDelayMinutes(meta.survey.unlockDelayMs ? String(meta.survey.unlockDelayMs / 60_000) : '');
                            setSequenceGroup(meta.survey.sequenceGroup || '');
                            setSequenceOrder(meta.survey.sequenceOrder != null ? String(meta.survey.sequenceOrder) : '1');
                            setEnforceSequence(Boolean(meta.survey.enforceSequence));
                            setQuestions(
                              meta.questions.map((q) => ({
                                text: q.text,
                                code: q.code,
                                type: (q.type as any) || 'likert',
                                construct: q.construct,
                                required: q.required,
                                ratingMax: q.ratingMax || 5,
                                ratingStyle: q.ratingStyle || 'likert',
                                sectionTitle: q.sectionTitle,
                                options: q.options ? q.options.map((opt) => opt.text) : [],
                              })),
                            );
                            setActiveTab('builder');
                          } catch (err) {
                            Alert.alert('Load Error', (err as Error).message);
                          }
                        }}
                      >
                        <Text style={styles.cardActionSecondaryText}>Clone into Scaffolder ⚡</Text>
                      </Pressable>
                      {s.isActive && studioPort.updateSurveyPolicy ? (
                        <Pressable
                          style={styles.cardActionSecondary}
                          onPress={async () => {
                            try {
                              const meta = await transportPort.fetchSurveyMeta(s.uuid);
                              const access = (meta.features?.accessPolicy || {}) as Record<string, unknown>;
                              const prerequisites = (meta.features?.prerequisites || {}) as Record<string, unknown>;
                              const sequence = (meta.features?.sequence || {}) as Record<string, unknown>;
                              setRequiresAccount(Boolean(access.requiresAccount));
                              setAllowRedo(Boolean(access.allowRedo));
                              setMaxAttempts(access.maxAttempts != null ? String(access.maxAttempts) : '');
                              setCooldownMinutes(access.cooldownMinutes != null ? String(access.cooldownMinutes) : '');
                              setPrerequisiteIds(Array.isArray(prerequisites.completedFormIds) ? prerequisites.completedFormIds.map(String) : []);
                              setPrerequisiteDelayMinutes(prerequisites.unlockDelayMs ? String(Number(prerequisites.unlockDelayMs) / 60_000) : '');
                              setSequenceGroup(typeof sequence.groupId === 'string' ? sequence.groupId : '');
                              setSequenceOrder(sequence.order != null ? String(sequence.order) : '1');
                              setEnforceSequence(Boolean(sequence.enforce));
                              setPolicyTarget({ uuid: s.uuid, title: s.title });
                              setActiveTab('builder');
                            } catch (err) {
                              Alert.alert('Could not load rules', (err as Error).message);
                            }
                          }}
                        >
                          <Text style={styles.cardActionSecondaryText}>Edit availability</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        style={styles.cardActionAirDrop}
                        onPress={async () => {
                          try {
                            const meta = await transportPort.fetchSurveyMeta(s.uuid);
                            handleOpenAirDrop(meta, s.accessCode);
                          } catch (err) {
                            Alert.alert('QR Share Error', (err as Error).message);
                          }
                        }}
                      >
                        <Text style={styles.cardActionAirDropText}>📲 QR & Share</Text>
                      </Pressable>
                      {studioPort.togglePublish ? (
                        <Pressable
                          style={[
                            styles.cardActionSecondary,
                            { backgroundColor: s.isDraft ? '#F0FDF4' : '#FEF3C7', borderColor: s.isDraft ? '#86EFAC' : '#FDE68A' },
                          ]}
                          onPress={async () => {
                            try {
                              await studioPort.togglePublish!(s.uuid, !s.isDraft);
                              await loadSurveys();
                            } catch (err) {
                              Alert.alert('Update Error', (err as Error).message);
                            }
                          }}
                        >
                          <Text
                            style={[
                              styles.cardActionSecondaryText,
                              { color: s.isDraft ? '#166534' : '#92400E' },
                            ]}
                          >
                            {s.isDraft ? '🌐 Make Public' : '🔒 Keep Private'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                    </View>
                  )}
                />
              </View>
            )}
          </View>
        )}

        {/* TAB 2: FORM SCAFFOLDER & BUILDER */}
        {activeTab === 'builder' && (
          <View style={styles.section}>
            {policyTarget ? (
              <View style={styles.policyEditNotice}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.policyEditTitle}>Availability rules</Text>
                  <Text style={styles.policyEditSubtitle} numberOfLines={2}>{policyTarget.title}</Text>
                </View>
                <Pressable onPress={() => setPolicyTarget(null)} accessibilityRole="button" accessibilityLabel="Cancel editing availability">
                  <Text style={styles.policyEditCancel}>Cancel</Text>
                </Pressable>
              </View>
            ) : null}
            {/* Scaffolder Control Header */}
            <View style={styles.builderToolbar}>
              <View>
                <Text style={styles.sectionTitle}>{policyTarget ? 'Survey availability' : 'Instrument Designer'}</Text>
                <Text style={styles.sectionSubtitle}>
                  {policyTarget ? 'Set participation and unlock rules for this survey.' : 'Schema-driven engine primitives with psychometric tagging'}
                </Text>
              </View>
              {!policyTarget ? <View style={styles.draftBadge}>
                <Text style={styles.draftBadgeDot}>●</Text>
                <Text style={styles.draftBadgeText}>{draftSavedStatus}</Text>
              </View> : null}
            </View>

            {!policyTarget ? <>
            {/* Template Presets Bar */}
            <View style={styles.presetSection}>
              <Text style={styles.presetLabel}>RESEARCH TEMPLATES:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetRow}
              >
                <Pressable
                  style={styles.presetChip}
                  onPress={() => applyTemplate('hmsam_full')}
                >
                  <Text style={styles.presetChipText}>🌟 Full HMSAM (38-Item)</Text>
                </Pressable>
                <Pressable
                  style={styles.presetChip}
                  onPress={() => applyTemplate('core_8')}
                >
                  <Text style={styles.presetChipText}>⚡ Core 8-Item Scale</Text>
                </Pressable>
                <Pressable
                  style={styles.presetChip}
                  onPress={() => applyTemplate('usability')}
                >
                  <Text style={styles.presetChipText}>💬 Usability & CSAT</Text>
                </Pressable>
                <Pressable
                  style={[styles.presetChip, styles.presetChipGhost]}
                  onPress={() => applyTemplate('blank')}
                >
                  <Text style={[styles.presetChipText, styles.presetChipGhostText]}>
                    🧹 Blank Slate
                  </Text>
                </Pressable>
              </ScrollView>
            </View>

            {/* Instrument Metadata Form */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>SURVEY TITLE</Text>
              <TextInput
                style={styles.input}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="e.g. Hedonic User Engagement Evaluation"
                placeholderTextColor={colors.faint}
              />

              <Text style={styles.label}>RESEARCH PURPOSE & ABSTRACT</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formDesc}
                onChangeText={setFormDesc}
                multiline
                numberOfLines={3}
                placeholder="Summary displayed to respondents on the welcome cover page..."
                placeholderTextColor={colors.faint}
              />

              <View style={styles.toggleRow}>
                <Pressable
                  style={[styles.togglePill, isHmsam && styles.togglePillActive]}
                  onPress={() => setIsHmsam(!isHmsam)}
                >
                  <Text
                    style={[styles.toggleText, isHmsam && styles.toggleTextActive]}
                  >
                    {isHmsam
                      ? '✓ Hedonic-Motivation (HMSAM) Enabled'
                      : '○ Standard Custom Instrument'}
                  </Text>
                </Pressable>
              </View>
            </View>
            </> : null}

            <View style={styles.formGroup}>
              <Text style={styles.label}>AVAILABILITY</Text>
              <Text style={styles.helperText}>Choose who can start, how often they can respond, and what unlocks this survey.</Text>
              <Pressable style={styles.policyRow} onPress={() => setRequiresAccount(!requiresAccount)}>
                <Text style={styles.policyTitle}>{requiresAccount ? '✓ Sign-in required' : '○ Allow guest responses'}</Text>
                <Text style={styles.policyHint}>Account requirement is checked by the API.</Text>
              </Pressable>
              <Pressable style={styles.policyRow} onPress={() => setAllowRedo(!allowRedo)}>
                <Text style={styles.policyTitle}>{allowRedo ? '✓ Allow repeat attempts' : '○ One completed attempt'}</Text>
              </Pressable>
              <TextInput style={styles.input} value={maxAttempts} onChangeText={setMaxAttempts} keyboardType="number-pad" placeholder={allowRedo ? 'Maximum attempts (blank for unlimited)' : 'Maximum attempts (default 1)'} placeholderTextColor={colors.faint} />
              <TextInput style={styles.input} value={cooldownMinutes} onChangeText={setCooldownMinutes} keyboardType="decimal-pad" placeholder="Wait between attempts (minutes, optional)" placeholderTextColor={colors.faint} />
              {surveys.some((survey) => survey.isActive && !survey.isDraft) ? (
                <View style={styles.policyChoices}>
                  <Text style={styles.policyTitle}>Complete another survey first</Text>
                  {surveys.filter((survey) => survey.isActive && !survey.isDraft && survey.uuid !== policyTarget?.uuid).map((survey) => {
                    const selected = prerequisiteIds.includes(survey.uuid);
                    return (
                      <Pressable key={survey.uuid} style={styles.policyChoice} onPress={() => setPrerequisiteIds((current) => selected ? current.filter((id) => id !== survey.uuid) : [...current, survey.uuid])}>
                        <Text style={styles.policyChoiceText}>{selected ? '✓ ' : '○ '}{survey.title}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              {prerequisiteIds.length ? <TextInput style={styles.input} value={prerequisiteDelayMinutes} onChangeText={setPrerequisiteDelayMinutes} keyboardType="decimal-pad" placeholder="Wait after prerequisite completion (minutes, optional)" placeholderTextColor={colors.faint} /> : null}
              <Text style={[styles.label, { marginTop: 10 }]}>SURVEY SEQUENCE (OPTIONAL)</Text>
              <Text style={styles.helperText}>Surveys sharing a set name appear together. Enforce order to lock later steps until earlier ones are complete.</Text>
              <TextInput style={styles.input} value={sequenceGroup} onChangeText={setSequenceGroup} placeholder="Set name" placeholderTextColor={colors.faint} />
              {sequenceGroup.trim() ? <>
                <TextInput style={styles.input} value={sequenceOrder} onChangeText={setSequenceOrder} keyboardType="number-pad" placeholder="Step number" placeholderTextColor={colors.faint} />
                <Pressable style={styles.policyRow} onPress={() => setEnforceSequence(!enforceSequence)}>
                  <Text style={styles.policyTitle}>{enforceSequence ? '✓ Enforce sequence order' : '○ Show sequence without locking'}</Text>
                </Pressable>
              </> : null}
            </View>

            {!policyTarget ? <>
            {/* Questions Deck Header */}
            <View style={styles.deckHeader}>
              <View>
                <Text style={styles.deckTitle}>Questions Deck ({questions.length})</Text>
                <Text style={styles.deckSubtitle}>
                  Order questions, set scale bounds, and tag psychometric constructs
                </Text>
              </View>
            </View>

            {/* Question Quick Add Bar */}
            <View style={styles.quickAddBar}>
              <Text style={styles.quickAddLabel}>ADD NEW QUESTION:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickAddScroll}
              >
                {QUESTION_TYPES.map((qt) => (
                  <Pressable
                    key={qt.id}
                    style={styles.quickAddBtn}
                    onPress={() => handleAddQuestion(qt.id)}
                  >
                    <Text style={styles.quickAddBtnText}>
                      {qt.icon} {qt.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Questions List */}
            <View style={styles.questionsList}>
              {questions.map((q, idx) => (
                <View key={idx} style={styles.questionCard}>
                  {/* Card Header Strip */}
                  <View style={styles.qCardHeader}>
                    <View style={styles.qIndexPill}>
                      <Text style={styles.qIndexText}>#{idx + 1}</Text>
                    </View>

                    {/* Question Code input */}
                    <TextInput
                      style={styles.qCodeInput}
                      value={q.code || ''}
                      onChangeText={(code) => handleUpdateQuestion(idx, { code })}
                      placeholder="Code (e.g. PEU1)"
                      placeholderTextColor={colors.faint}
                      autoCapitalize="characters"
                    />

                    {/* Required Toggle */}
                    <Pressable
                      style={[
                        styles.reqToggle,
                        q.required && styles.reqToggleActive,
                      ]}
                      onPress={() =>
                        handleUpdateQuestion(idx, { required: !q.required })
                      }
                    >
                      <Text
                        style={[
                          styles.reqToggleText,
                          q.required && styles.reqToggleTextActive,
                        ]}
                      >
                        {q.required ? '★ Required' : 'Optional'}
                      </Text>
                    </Pressable>

                    {/* Action Toolbar */}
                    <View style={styles.qActionsBar}>
                      <Pressable
                        style={[styles.qActionBtn, idx === 0 && styles.qActionDisabled]}
                        disabled={idx === 0}
                        onPress={() => handleMoveQuestion(idx, 'up')}
                      >
                        <Text style={styles.qActionIcon}>▲</Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.qActionBtn,
                          idx === questions.length - 1 && styles.qActionDisabled,
                        ]}
                        disabled={idx === questions.length - 1}
                        onPress={() => handleMoveQuestion(idx, 'down')}
                      >
                        <Text style={styles.qActionIcon}>▼</Text>
                      </Pressable>
                      <Pressable
                        style={styles.qActionBtn}
                        onPress={() => handleDuplicateQuestion(idx)}
                      >
                        <Text style={styles.qActionIcon}>⎘</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.qActionBtn, styles.qDeleteActionBtn]}
                        onPress={() => handleRemoveQuestion(idx)}
                      >
                        <Text style={styles.qDeleteIcon}>✕</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Question Statement Text */}
                  <Text style={styles.qFieldLabel}>QUESTION STATEMENT</Text>
                  <TextInput
                    style={styles.qTextInput}
                    value={q.text}
                    onChangeText={(val) => handleUpdateQuestion(idx, { text: val })}
                    multiline
                    placeholder="Enter respondent question prompt..."
                    placeholderTextColor={colors.faint}
                  />

                  {/* Section Title Input */}
                  <View style={styles.qSectionRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.qFieldLabel}>SECTION / CATEGORY TITLE</Text>
                      <TextInput
                        style={styles.qMiniInput}
                        value={q.sectionTitle || ''}
                        onChangeText={(val) =>
                          handleUpdateQuestion(idx, { sectionTitle: val })
                        }
                        placeholder="e.g. Perceived Ease of Use"
                        placeholderTextColor={colors.faint}
                      />
                    </View>
                  </View>

                  {/* Construct Tag Selector */}
                  <Text style={styles.qFieldLabel}>
                    PSYCHOMETRIC CONSTRUCT TAG (FOR CRONBACH'S α)
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.constructScroll}
                  >
                    {CONSTRUCT_OPTIONS.map((c) => {
                      const selected = (q.construct || '') === c.id;
                      return (
                        <Pressable
                          key={c.id || 'none'}
                          style={[
                            styles.constructChip,
                            selected && styles.constructChipSelected,
                          ]}
                          onPress={() =>
                            handleUpdateQuestion(idx, {
                              construct: c.id || undefined,
                              sectionTitle: c.id
                                ? HMSAM_CONSTRUCTS[c.id as HMSAMConstructId]?.label
                                : q.sectionTitle,
                            })
                          }
                        >
                          <Text
                            style={[
                              styles.constructChipText,
                              selected && styles.constructChipTextSelected,
                            ]}
                          >
                            {c.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  {/* Question Type Selector Bar */}
                  <Text style={styles.qFieldLabel}>FIELD TYPE PRIMITIVE</Text>
                  <View style={styles.typeSelectorRow}>
                    {QUESTION_TYPES.map((qt) => {
                      const isSelected = q.type === qt.id;
                      return (
                        <Pressable
                          key={qt.id}
                          style={[
                            styles.typePill,
                            isSelected && styles.typePillSelected,
                          ]}
                          onPress={() =>
                            handleUpdateQuestion(idx, {
                              type: qt.id,
                              options:
                                qt.id === 'mcq' && (!q.options || q.options.length === 0)
                                  ? ['Option 1', 'Option 2', 'Option 3']
                                  : q.options,
                            })
                          }
                        >
                          <Text
                            style={[
                              styles.typePillText,
                              isSelected && styles.typePillTextSelected,
                            ]}
                          >
                            {qt.icon} {qt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Type-Specific Controls */}
                  {(q.type === 'likert' || q.type === 'rating') && (
                    <View style={styles.subConfigBox}>
                      <Text style={styles.subConfigTitle}>SCALE BOUNDS & FORMAT</Text>
                      <View style={styles.subConfigRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.qFieldLabel}>SCALE RANGE</Text>
                          <View style={styles.rangePillRow}>
                            {[5, 7, 10].map((num) => (
                              <Pressable
                                key={num}
                                style={[
                                  styles.rangePill,
                                  (q.ratingMax || 5) === num && styles.rangePillActive,
                                ]}
                                onPress={() =>
                                  handleUpdateQuestion(idx, { ratingMax: num })
                                }
                              >
                                <Text
                                  style={[
                                    styles.rangePillText,
                                    (q.ratingMax || 5) === num &&
                                      styles.rangePillTextActive,
                                  ]}
                                >
                                  1–{num}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>

                        <View style={{ flex: 1.2 }}>
                          <Text style={styles.qFieldLabel}>RATING STYLE</Text>
                          <View style={styles.rangePillRow}>
                            {[
                              { id: 'likert', label: 'Likert' },
                              { id: 'stars', label: 'Stars' },
                              { id: 'numeric', label: 'Numeric' },
                            ].map((styleOpt) => (
                              <Pressable
                                key={styleOpt.id}
                                style={[
                                  styles.rangePill,
                                  (q.ratingStyle || 'likert') === styleOpt.id &&
                                    styles.rangePillActive,
                                ]}
                                onPress={() =>
                                  handleUpdateQuestion(idx, {
                                    ratingStyle: styleOpt.id,
                                  })
                                }
                              >
                                <Text
                                  style={[
                                    styles.rangePillText,
                                    (q.ratingStyle || 'likert') === styleOpt.id &&
                                      styles.rangePillTextActive,
                                  ]}
                                >
                                  {styleOpt.label}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* MCQ Choices Editor */}
                  {q.type === 'mcq' && (
                    <View style={styles.subConfigBox}>
                      <View style={styles.mcqHeaderRow}>
                        <Text style={styles.subConfigTitle}>
                          CHOICE OPTIONS ({(q.options || []).length})
                        </Text>
                        <View style={styles.mcqPresetRow}>
                          <Pressable
                            style={styles.mcqPresetBtn}
                            onPress={() => handleApplyOptionPreset(idx, 'yesno')}
                          >
                            <Text style={styles.mcqPresetBtnText}>+ Yes/No</Text>
                          </Pressable>
                          <Pressable
                            style={styles.mcqPresetBtn}
                            onPress={() => handleApplyOptionPreset(idx, 'agree')}
                          >
                            <Text style={styles.mcqPresetBtnText}>+ Agree/Disagree</Text>
                          </Pressable>
                          <Pressable
                            style={styles.mcqPresetBtn}
                            onPress={() => handleApplyOptionPreset(idx, 'freq')}
                          >
                            <Text style={styles.mcqPresetBtnText}>+ Frequency</Text>
                          </Pressable>
                        </View>
                      </View>

                      {(q.options || []).map((opt, optIdx) => (
                        <View key={optIdx} style={styles.mcqOptionEditRow}>
                          <Text style={styles.mcqBulletText}>{optIdx + 1}.</Text>
                          <TextInput
                            style={styles.mcqOptionInput}
                            value={opt}
                            onChangeText={(val) =>
                              handleUpdateOption(idx, optIdx, val)
                            }
                            placeholder={`Option ${optIdx + 1}`}
                            placeholderTextColor={colors.faint}
                          />
                          <Pressable
                            style={styles.mcqOptionDeleteBtn}
                            onPress={() => handleRemoveOption(idx, optIdx)}
                          >
                            <Text style={styles.mcqOptionDeleteText}>✕</Text>
                          </Pressable>
                        </View>
                      ))}

                      <Pressable
                        style={styles.mcqAddOptionBtn}
                        onPress={() => handleAddOption(idx)}
                      >
                        <Text style={styles.mcqAddOptionText}>+ Add Choice Option</Text>
                      </Pressable>
                    </View>
                  )}

                  {(q.type === 'short' || q.type === 'open') && (
                    <View style={styles.textNoteBox}>
                      <Text style={styles.textNoteContent}>
                        {q.type === 'short'
                          ? '💬 Single-line text input for short answers, names, IDs or categories.'
                          : '📝 Multi-line open text area for qualitative research comments.'}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
            </> : null}

            {/* Publishing Action Footer */}
            <View style={styles.publishBar}>
              {policyTarget ? (
                <Pressable
                  style={[styles.publishBtn, publishing && styles.publishBtnDisabled]}
                  onPress={handleSaveSurveyPolicy}
                  disabled={publishing}
                >
                  {publishing ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.publishBtnText}>Save availability rules</Text>}
                </Pressable>
              ) : null}
              {!policyTarget ? <Pressable
                style={styles.previewBtn}
                onPress={() => setIsPreviewOpen(true)}
              >
                <Text style={styles.previewBtnText}>👁️ Test-Drive in Engine Runner</Text>
              </Pressable> : null}

              {!policyTarget ? <Pressable
                style={[styles.publishBtn, publishing && styles.publishBtnDisabled]}
                onPress={() => handlePublishSurvey(false)}
                disabled={publishing}
              >
                {publishing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.publishBtnText}>
                    Publish Survey to Django Fleet 🚀
                  </Text>
                )}
              </Pressable> : null}

              {!policyTarget ? <Pressable
                style={styles.saveDraftBtn}
                onPress={() => handlePublishSurvey(true)}
                disabled={publishing}
              >
                <Text style={styles.saveDraftBtnText}>Save as Draft in Django Fleet 💾</Text>
              </Pressable> : null}

              {!policyTarget ? <Pressable
                style={styles.airdropBtn}
                onPress={() => handleOpenAirDrop()}
              >
                <Text style={styles.airdropBtnText}>📲 Instant QR & P2P Share (Android & iOS)</Text>
              </Pressable> : null}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Live Interactive Engine Test-Drive Modal */}
      <Modal
        visible={isPreviewOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsPreviewOpen(false)}
      >
        <EnginePreviewRunner
          meta={previewMeta}
          onClose={() => setIsPreviewOpen(false)}
        />
      </Modal>

      {/* Instant QR & P2P Share Modal */}
      <Modal
        visible={isAirDropOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAirDropOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>📲 Instant QR & P2P Share</Text>
                <Text style={styles.modalHeaderSubtitle}>
                  Universal Android & iOS Optical Scanner
                </Text>
              </View>
              <Pressable onPress={() => setIsAirDropOpen(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </Pressable>
            </View>

            {/* Mode Switcher Tabs */}
            <View style={styles.qrTabRow}>
              <Pressable
                style={[styles.qrTabBtn, airDropTab === 'link' && styles.qrTabBtnActive]}
                onPress={() => {
                  setAirDropTab('link');
                  updateQrImage('link', airDropAccessCode, airDropSlug);
                }}
              >
                <Text style={[styles.qrTabText, airDropTab === 'link' && styles.qrTabTextActive]}>
                  📱 Camera Scan Link
                </Text>
              </Pressable>
              <Pressable
                style={[styles.qrTabBtn, airDropTab === 'offline' && styles.qrTabBtnActive]}
                onPress={() => {
                  setAirDropTab('offline');
                  updateQrImage('offline', airDropAccessCode, airDropSlug);
                }}
              >
                <Text style={[styles.qrTabText, airDropTab === 'offline' && styles.qrTabTextActive]}>
                  📦 Full Offline Schema
                </Text>
              </Pressable>
            </View>

            {airDropTab === 'link' ? (
              <>
                <Text style={styles.modalDesc}>
                  Point <Text style={{ fontWeight: '800', color: colors.ink }}>ANY Android camera, Google Lens, or iPhone camera</Text> at this QR code to launch the survey instantly.
                </Text>

                <View style={styles.qrDisplayBox}>
                  <NativeQrView value={getShareLink(airDropAccessCode)} size={220} />
                  <Text style={styles.qrHintText}>Scan with phone camera or Expo Go · Launches instantly</Text>
                </View>

                {/* Prominent Access Code Display */}
                <View style={styles.accessCodeCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.accessCodeLabel}>MANUAL PARTICIPANT CODE</Text>
                    <Text style={styles.accessCodeValue}>{airDropAccessCode || 'PREVIEW'}</Text>
                  </View>
                  <Pressable
                    style={styles.codeCopySmallBtn}
                    onPress={() => {
                      if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        navigator.clipboard.writeText(airDropAccessCode || 'PREVIEW');
                      }
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                  >
                    <Text style={styles.codeCopySmallText}>
                      {copiedLink ? '✓ Copied' : 'Copy Code'}
                    </Text>
                  </Pressable>
                </View>

                {/* Shareable Universal Web URL Row */}
                <View style={styles.urlCard}>
                  <Text style={styles.urlText} numberOfLines={1}>
                    {getShareLink(airDropAccessCode)}
                  </Text>
                  <Pressable
                    style={styles.copyUrlBtn}
                    onPress={() => {
                      const link = getShareLink(airDropAccessCode);
                      if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        navigator.clipboard.writeText(link);
                      }
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                  >
                    <Text style={styles.copyUrlBtnText}>
                      {copiedLink ? '✓ Link Copied!' : '🔗 Copy Web Link'}
                    </Text>
                  </Pressable>
                </View>

                {/* Shareable Expo Go Deep Link Row */}
                <View style={[styles.urlCard, { marginTop: 6 }]}>
                  <Text style={styles.urlText} numberOfLines={1}>
                    {getSharableSurveyUrl(airDropAccessCode).appDeepLink}
                  </Text>
                  <Pressable
                    style={styles.copyUrlBtn}
                    onPress={() => {
                      const link = getSharableSurveyUrl(airDropAccessCode).appDeepLink;
                      if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        navigator.clipboard.writeText(link);
                      }
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                  >
                    <Text style={styles.copyUrlBtnText}>
                      {copiedLink ? '✓ Link Copied!' : '📲 Copy Expo Go Link'}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalDesc}>
                  <Text style={{ fontWeight: '800', color: colors.ink }}>Zero-Network Field Mode:</Text> This QR code encodes the entire instrument schema with a CRC32 integrity checksum. Open Feedora on ANY Android or iOS device and tap "Scan / Import" to load offline.
                </Text>

                <View style={styles.qrDisplayBox}>
                  <NativeQrView value={airDropSlug} size={220} />
                  <Text style={styles.qrHintText}>High-density offline barcode · 100% network free</Text>
                </View>

                <View style={styles.manifestBox}>
                  <Text style={styles.manifestLabel}>OFFLINE MANIFEST CODE ({airDropSlug.length} chars)</Text>
                  <ScrollView style={styles.manifestScroll}>
                    <Text style={styles.manifestCode} selectable>{airDropSlug}</Text>
                  </ScrollView>
                </View>

                <View style={styles.airdropActionRow}>
                  <Pressable
                    style={styles.copyBtn}
                    onPress={() => {
                      if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        navigator.clipboard.writeText(airDropSlug);
                      }
                      setCopiedSlug(true);
                      setTimeout(() => setCopiedSlug(false), 2000);
                    }}
                  >
                    <Text style={styles.copyBtnText}>
                      {copiedSlug ? '✓ Manifest Copied!' : '📋 Copy Offline Code'}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.testOfflineBtn}
                    onPress={() => {
                      const schema = convertRemoteSurveyToSchema(previewMeta);
                      openAirDropSurvey(schema);
                      setIsAirDropOpen(false);
                      router.replace('/');
                    }}
                  >
                    <Text style={styles.testOfflineBtnText}>Test Offline on This Device 🚀</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Engine Preview Runner Component (Inside Modal)
// ---------------------------------------------------------------------------
function EnginePreviewRunner({
  meta,
  onClose,
}: {
  meta: RemoteSurveyMeta;
  onClose: () => void;
}) {
  const [runKey, setRunKey] = useState(0);

  return (
    <EnginePreviewRunnerInner
      key={runKey}
      meta={meta}
      onClose={onClose}
      onReset={() => setRunKey((k) => k + 1)}
    />
  );
}

function EnginePreviewRunnerInner({
  meta,
  onClose,
  onReset,
}: {
  meta: RemoteSurveyMeta;
  onClose: () => void;
  onReset: () => void;
}) {
  const schema: FormSchema = useMemo(() => convertRemoteSurveyToSchema(meta), [meta]);
  const [submitted, setSubmitted] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});

  const manager = useMemo(
    () =>
      new MultiStepFormManager<Record<string, unknown>>(
        schema,
        async (submittedVals) => {
          setValues(submittedVals);
          setSubmitted(true);
        },
        {
          experience: {
            progressStrategy: progressPort,
            rewardEngine: rewardPort,
          },
        },
      ),
    [schema],
  );

  const form = manager.getFormManager();
  const [formState, setFormState] = useState(() => form.getState());
  const [stepIndex, setStepIndex] = useState(() => manager.getCurrentPageIndex());
  const [progress, setProgress] = useState(() => manager.getProgress());

  useEffect(() => {
    setFormState(form.getState());
    setStepIndex(manager.getCurrentPageIndex());
    setProgress(manager.getProgress());

    const unsubForm = form.subscribe(setFormState);
    const unsubSteps = manager.subscribe(() => {
      setStepIndex(manager.getCurrentPageIndex());
      setProgress(manager.getProgress());
    });

    return () => {
      unsubForm();
      unsubSteps();
      manager.destroy();
    };
  }, [form, manager]);

  const currentPage = manager.getCurrentPage();
  const visibleFields = manager.getVisibleFields(stepIndex);
  const isCover = currentPage?.role === 'cover';

  const moveForward = async () => {
    if (manager.isLastStep()) {
      await manager.submit();
    } else {
      manager.nextStep();
    }
  };

  return (
    <View style={previewStyles.container}>
      {/* Header Bar */}
      <View style={previewStyles.header}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Tag tone="violet">ENGINE TEST-DRIVE</Tag>
            {meta.survey.is_hmsam && <Tag tone="teal">HMSAM</Tag>}
          </View>
          <Text style={previewStyles.headerTitle} numberOfLines={1}>
            {schema.title}
          </Text>
          <Text style={previewStyles.headerSubtitle}>
            Interactive simulator running MultiStepFormManager
          </Text>
        </View>

        <Pressable style={previewStyles.closeBtn} onPress={onClose}>
          <Text style={previewStyles.closeText}>✕ Close</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={previewStyles.scroll}>
        <Panel>
          {submitted ? (
            <View style={previewStyles.completedBox}>
              <Text style={previewStyles.completedEmoji}>🎉</Text>
              <Text style={previewStyles.completedTitle}>Simulator Test Complete!</Text>
              <Text style={previewStyles.completedBody}>
                All validation rules satisfied. The engine successfully recorded and verified{' '}
                {Object.keys(values).length} participant field answers.
              </Text>

              <View style={previewStyles.valuesCard}>
                <Text style={previewStyles.valuesTitle}>RECORDED RESPONSES:</Text>
                {Object.entries(values).map(([k, v]) => (
                  <View key={k} style={previewStyles.valuesRow}>
                    <Text style={previewStyles.valuesKey}>{k}:</Text>
                    <Text style={previewStyles.valuesVal}>{String(v)}</Text>
                  </View>
                ))}
              </View>

              <View style={{ width: '100%', marginTop: 16, gap: 10 }}>
                <ActionButton
                  label="Reset & Run Again"
                  secondary
                  onPress={onReset}
                />
                <ActionButton label="Exit Preview to Editor" onPress={onClose} />
              </View>
            </View>
          ) : (
            <>
              <View style={previewStyles.meterHeader}>
                <Tag tone="slate">
                  STEP {stepIndex + 1} OF {manager.getTotalPages()}
                </Tag>
                <Text style={previewStyles.stepCount}>{progress.percentage}% COMPLETE</Text>
              </View>

              <StepMeter
                percent={progress.percentage}
                effortCompleted={progress.effortCompleted}
                effortTotal={progress.effortTotal}
                eta={progress.estimatedTimeRemainingText}
              />

              {currentPage?.title ? (
                <Text style={previewStyles.pageTitle}>{currentPage.title}</Text>
              ) : null}
              {currentPage?.description ? (
                <Text style={previewStyles.pageDesc}>{currentPage.description}</Text>
              ) : null}

              <View style={{ marginTop: 8 }}>
                {visibleFields.map((field) => (
                  <FieldControl
                    key={field.name}
                    field={field}
                    value={formState.values[field.name]}
                    error={formState.errors[field.name]}
                    readOnly={false}
                    onChange={(val) => {
                      form.setFieldValue(field.name, val);
                      manager.pruneHiddenFieldValues();
                    }}
                  />
                ))}
              </View>

              <View style={previewStyles.navRow}>
                {!isCover && stepIndex > 0 ? (
                  <View style={{ flex: 1 }}>
                    <ActionButton
                      label="Back"
                      secondary
                      onPress={() => manager.prevStep()}
                    />
                  </View>
                ) : null}
                <View style={{ flex: 2 }}>
                  <ActionButton
                    label={
                      manager.isLastStep()
                        ? 'Submit simulation'
                        : isCover
                          ? 'Start survey →'
                          : 'Next →'
                    }
                    onPress={moveForward}
                  />
                </View>
              </View>
            </>
          )}
        </Panel>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 54 : 20,
    paddingBottom: 14,
    backgroundColor: colors.paper,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  appBarBrand: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    fontFamily: serifFont,
  },
  appBarSubtitle: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
    fontWeight: '600',
  },
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  avatarEmoji: {
    fontSize: 18,
  },
  advisoryCard: {
    flexDirection: 'row',
    backgroundColor: colors.goldSoft,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    alignItems: 'center',
    gap: 12,
  },
  advisoryTextCol: {
    flex: 1,
  },
  advisoryTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.gold,
  },
  advisoryDesc: {
    fontSize: 11,
    color: colors.ink,
    marginTop: 2,
    lineHeight: 14,
  },
  advisoryBtn: {
    backgroundColor: colors.gold,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.small,
  },
  advisoryBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.paper,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radii.small,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabBtnActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  scroll: {
    padding: 16,
    paddingBottom: 50,
  },
  celebrationCard: {
    flexDirection: 'row',
    backgroundColor: colors.tealSoft,
    padding: 14,
    borderRadius: radii.medium,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.teal,
    alignItems: 'center',
    gap: 12,
  },
  celebrationEmoji: {
    fontSize: 24,
  },
  celebrationTextCol: {
    flex: 1,
  },
  celebrationTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.teal,
  },
  celebrationSubtitle: {
    fontSize: 11.5,
    color: colors.ink,
    marginTop: 2,
  },
  codeHighlight: {
    fontWeight: '900',
    color: colors.primary,
  },
  dismissBtn: {
    padding: 4,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    fontFamily: serifFont,
  },
  sectionSubtitle: {
    fontSize: 11.5,
    color: colors.muted,
    marginTop: 2,
  },
  refreshBtn: {
    backgroundColor: colors.paper,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
  },
  refreshBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 12,
    color: colors.muted,
  },
  emptyBox: {
    backgroundColor: colors.paper,
    padding: 24,
    borderRadius: radii.medium,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 10,
  },
  emptyEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  emptyDesc: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  emptyBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.small,
    marginTop: 14,
  },
  emptyBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  surveyList: {
    gap: 12,
  },
  surveyCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.medium,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  surveyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  surveyTitleCol: {
    flex: 1,
    paddingRight: 10,
  },
  surveyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },
  surveyDesc: {
    fontSize: 11.5,
    color: colors.muted,
    marginTop: 2,
    lineHeight: 16,
  },
  badgeCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  codeBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  codeBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  hmsamBadge: {
    backgroundColor: colors.tealSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  hmsamBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.teal,
  },
  surveyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
  },
  metaStat: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '600',
  },
  metaStatus: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 'auto',
  },
  statusActive: {
    color: colors.teal,
  },
  statusDraft: {
    color: colors.faint,
  },
  cardActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  cardActionPrimary: {
    flexGrow: 1,
    flexBasis: '44%',
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radii.small,
    alignItems: 'center',
  },
  cardActionPrimaryText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  cardActionSecondary: {
    flexGrow: 1,
    flexBasis: '44%',
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radii.small,
    alignItems: 'center',
  },
  cardActionSecondaryText: {
    color: colors.ink,
    fontSize: 11.5,
    fontWeight: '700',
  },
  policyEditNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 14,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryMid,
    borderRadius: radii.medium,
  },
  policyEditTitle: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: '800',
  },
  policyEditSubtitle: {
    color: colors.ink,
    fontSize: 12,
    marginTop: 3,
  },
  policyEditCancel: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: '700',
    padding: 6,
  },
  cardActionAirDrop: {
    flexGrow: 1,
    flexBasis: '44%',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryMid,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radii.small,
    alignItems: 'center',
  },
  cardActionAirDropText: {
    color: colors.primaryDeep,
    fontSize: 11.5,
    fontWeight: '700',
  },
  builderToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  draftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.paper,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 5,
  },
  draftBadgeDot: {
    fontSize: 9,
    color: colors.teal,
  },
  draftBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.muted,
  },
  presetSection: {
    marginBottom: 12,
  },
  presetLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.faint,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetChip: {
    backgroundColor: colors.paper,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  presetChipGhost: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
  },
  presetChipGhostText: {
    color: colors.muted,
  },
  formGroup: {
    backgroundColor: colors.paper,
    padding: 14,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 16,
  },
  helperText: { fontSize: 12, lineHeight: 17, color: colors.muted, marginBottom: 8 },
  policyRow: { paddingVertical: 10, paddingHorizontal: 11, marginVertical: 4, borderRadius: radii.small, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line },
  policyTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  policyHint: { fontSize: 11, color: colors.muted, marginTop: 3 },
  policyChoices: { marginTop: 8, gap: 4 },
  policyChoice: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: radii.small, backgroundColor: colors.canvas },
  policyChoiceText: { color: colors.ink, fontSize: 12 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.faint,
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: colors.canvas,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.ink,
  },
  textArea: {
    height: 64,
    textAlignVertical: 'top',
  },
  toggleRow: {
    marginTop: 12,
  },
  togglePill: {
    backgroundColor: colors.canvas,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
    alignSelf: 'flex-start',
  },
  togglePillActive: {
    backgroundColor: colors.tealSoft,
    borderColor: colors.teal,
  },
  toggleText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.muted,
  },
  toggleTextActive: {
    color: colors.teal,
    fontWeight: '800',
  },
  deckHeader: {
    marginBottom: 10,
  },
  deckTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  deckSubtitle: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  quickAddBar: {
    backgroundColor: colors.paper,
    padding: 10,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  quickAddLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.faint,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  quickAddScroll: {
    flexDirection: 'row',
    gap: 6,
  },
  quickAddBtn: {
    backgroundColor: colors.canvas,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
  },
  quickAddBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  questionsList: {
    gap: 12,
  },
  questionCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.medium,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  qCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  qIndexPill: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  qIndexText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.primary,
  },
  qCodeInput: {
    width: 100,
    backgroundColor: colors.canvas,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  reqToggle: {
    backgroundColor: colors.canvas,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  reqToggleActive: {
    backgroundColor: colors.roseSoft,
    borderColor: colors.rose,
  },
  reqToggleText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.muted,
  },
  reqToggleTextActive: {
    color: colors.rose,
    fontWeight: '800',
  },
  qActionsBar: {
    flexDirection: 'row',
    marginLeft: 'auto',
    gap: 4,
  },
  qActionBtn: {
    width: 26,
    height: 26,
    borderRadius: radii.small,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  qActionDisabled: {
    opacity: 0.3,
  },
  qActionIcon: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.ink,
  },
  qDeleteActionBtn: {
    backgroundColor: colors.roseSoft,
    borderColor: colors.rose,
  },
  qDeleteIcon: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.rose,
  },
  qFieldLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.faint,
    letterSpacing: 0.6,
    marginTop: 8,
    marginBottom: 4,
  },
  qTextInput: {
    backgroundColor: colors.canvas,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12.5,
    color: colors.ink,
    minHeight: 46,
    textAlignVertical: 'top',
  },
  qSectionRow: {
    marginTop: 2,
  },
  qMiniInput: {
    backgroundColor: colors.canvas,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11.5,
    color: colors.ink,
  },
  constructScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  constructChip: {
    backgroundColor: colors.canvas,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  constructChipSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  constructChipText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.muted,
  },
  constructChipTextSelected: {
    color: colors.primary,
    fontWeight: '800',
  },
  typeSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  typePill: {
    backgroundColor: colors.canvas,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
  },
  typePillSelected: {
    backgroundColor: colors.slateSoft,
    borderColor: colors.ink,
  },
  typePillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.muted,
  },
  typePillTextSelected: {
    color: colors.ink,
    fontWeight: '800',
  },
  subConfigBox: {
    backgroundColor: colors.canvas,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    marginTop: 10,
  },
  subConfigTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  subConfigRow: {
    flexDirection: 'row',
    gap: 12,
  },
  rangePillRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  rangePill: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingVertical: 5,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  rangePillActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  rangePillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.muted,
  },
  rangePillTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  mcqHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  mcqPresetRow: {
    flexDirection: 'row',
    gap: 4,
  },
  mcqPresetBtn: {
    backgroundColor: colors.paper,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  mcqPresetBtnText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: colors.primary,
  },
  mcqOptionEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  mcqBulletText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.faint,
    width: 16,
  },
  mcqOptionInput: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
    fontSize: 11.5,
    color: colors.ink,
  },
  mcqOptionDeleteBtn: {
    padding: 6,
  },
  mcqOptionDeleteText: {
    fontSize: 11,
    color: colors.rose,
    fontWeight: '800',
  },
  mcqAddOptionBtn: {
    backgroundColor: colors.paper,
    paddingVertical: 6,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.primaryMid,
    borderStyle: 'dashed',
    alignItems: 'center',
    marginTop: 4,
  },
  mcqAddOptionText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  textNoteBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: colors.canvas,
    borderRadius: radii.small,
  },
  textNoteContent: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: 'italic',
  },
  publishBar: {
    marginTop: 24,
    gap: 10,
  },
  previewBtn: {
    backgroundColor: colors.paper,
    borderRadius: radii.medium,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  previewBtnText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 13,
  },
  publishBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.medium,
    paddingVertical: 14,
    alignItems: 'center',
  },
  publishBtnDisabled: {
    opacity: 0.6,
  },
  publishBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  saveDraftBtn: {
    backgroundColor: colors.canvas,
    borderRadius: radii.medium,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  saveDraftBtnText: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 12,
  },
  airdropBtn: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.medium,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primaryMid,
  },
  airdropBtnText: {
    color: colors.primaryDeep,
    fontWeight: '800',
    fontSize: 12.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.paper,
    borderRadius: 14,
    padding: 20,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    fontFamily: serifFont,
  },
  modalCloseIcon: {
    fontSize: 18,
    color: colors.muted,
    padding: 4,
  },
  modalDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.muted,
  },
  manifestBox: {
    backgroundColor: colors.canvas,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  manifestLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.faint,
    letterSpacing: 0.8,
  },
  manifestScroll: {
    maxHeight: 110,
  },
  manifestCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: colors.ink,
    lineHeight: 16,
  },
  airdropActionRow: {
    gap: 8,
    marginTop: 6,
  },
  copyBtn: {
    backgroundColor: colors.canvas,
    borderColor: colors.line,
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: radii.small,
    alignItems: 'center',
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  testOfflineBtn: {
    backgroundColor: colors.primaryDeep,
    paddingVertical: 10,
    borderRadius: radii.small,
    alignItems: 'center',
  },
  testOfflineBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  celebrationShareBtn: {
    marginTop: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.small,
    alignSelf: 'flex-start',
  },
  celebrationShareBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalHeaderSubtitle: {
    fontSize: 11.5,
    color: colors.muted,
    marginTop: 2,
  },
  qrTabRow: {
    flexDirection: 'row',
    backgroundColor: colors.canvas,
    borderRadius: radii.small,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 4,
  },
  qrTabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: radii.small - 2,
  },
  qrTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  qrTabText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.muted,
  },
  qrTabTextActive: {
    color: colors.primaryDeep,
    fontWeight: '800',
  },
  qrDisplayBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.medium,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  qrHintText: {
    fontSize: 10.5,
    color: colors.faint,
    marginTop: 6,
    textAlign: 'center',
  },
  accessCodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryMid,
    borderWidth: 1,
    borderRadius: radii.small,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  accessCodeLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.primaryDeep,
  },
  accessCodeValue: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
    color: colors.primaryDeep,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 1,
  },
  codeCopySmallBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.primaryMid,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  codeCopySmallText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryDeep,
  },
  urlCard: {
    backgroundColor: colors.canvas,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    gap: 8,
  },
  urlText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.ink,
  },
  copyUrlBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  copyUrlBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

const previewStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    paddingBottom: 12,
    backgroundColor: colors.paper,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    fontFamily: serifFont,
    marginTop: 3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: colors.muted,
  },
  closeBtn: {
    backgroundColor: colors.canvas,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
  },
  closeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.ink,
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  meterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  stepCount: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.faint,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '400',
    color: colors.ink,
    fontFamily: serifFont,
    marginTop: 6,
    marginBottom: 4,
  },
  pageDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.muted,
    marginBottom: 14,
  },
  navRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  completedBox: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  completedEmoji: {
    fontSize: 44,
  },
  completedTitle: {
    fontSize: 22,
    fontWeight: '400',
    color: colors.ink,
    fontFamily: serifFont,
  },
  completedBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 420,
  },
  valuesCard: {
    width: '100%',
    backgroundColor: colors.canvas,
    borderRadius: radii.small,
    padding: 12,
    marginTop: 10,
  },
  valuesTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.faint,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  valuesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  valuesKey: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.ink,
  },
  valuesVal: {
    fontSize: 11.5,
    color: colors.primaryDeep,
    fontWeight: '800',
  },
});
