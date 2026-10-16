import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {
  AgeGroup,
  AuthMode,
  EntityType,
  Gender,
  UserRole,
} from '../domain/authTypes';
import type { FormField } from '@intuitui-labs/form-builder-engine';
import { authPort, entities, useFeedora } from '../feedora';
import { colors, radii, serifFont } from '../theme';

// ---------------------------------------------------------------------------
// Schema-driven Form Engine field definitions for Login & Registration
// ---------------------------------------------------------------------------
const LOGIN_FIELDS: FormField[] = [
  {
    id: 'identity',
    name: 'identity',
    type: 'text',
    label: 'EMAIL OR USERNAME',
    required: true,
    order: 1,
    semanticIntent: 'username',
    autoComplete: 'username',
    textContentType: 'username',
    placeholder: 'e.g. Gihiniw or gihinilwaid@gmail.com',
    autoCapitalize: 'none',
    accessibilityLabel: 'Email or username',
  },
  {
    id: 'password',
    name: 'password',
    type: 'password',
    label: 'PASSWORD',
    required: true,
    order: 2,
    semanticIntent: 'current-password',
    autoComplete: 'current-password',
    textContentType: 'password',
    placeholder: 'Enter your password',
    accessibilityLabel: 'Account password',
  },
];

const RESPONDENT_FIELDS: FormField[] = [
  {
    id: 'respEmail',
    name: 'email',
    type: 'email',
    label: 'EMAIL ADDRESS',
    required: true,
    order: 1,
    semanticIntent: 'contact-email',
    autoComplete: 'email',
    textContentType: 'emailAddress',
    keyboardType: 'email-address',
    autoCapitalize: 'none',
    placeholder: 'your.email@campus.lk',
  },
  {
    id: 'respPassword',
    name: 'password',
    type: 'password',
    label: 'CREATE PASSWORD',
    required: true,
    order: 2,
    semanticIntent: 'new-password',
    autoComplete: 'new-password',
    textContentType: 'newPassword',
    placeholder: 'Create a password',
  },
  {
    id: 'respName',
    name: 'displayName',
    type: 'text',
    label: 'DISPLAY NAME',
    required: false,
    order: 3,
    semanticIntent: 'name-full',
    autoComplete: 'name',
    textContentType: 'name',
    placeholder: 'e.g. Kasun or VoiceMember',
  },
  {
    id: 'respAge',
    name: 'ageGroup',
    type: 'select',
    label: 'AGE GROUP',
    required: false,
    order: 4,
    privacyRationale: 'Used solely for anonymous research demographic distribution.',
    options: [
      { label: '18–24', value: '18-24' },
      { label: '25–34', value: '25-34' },
      { label: '35–44', value: '35-44' },
    ],
  },
];

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AuthModal({ visible, onClose }: AuthModalProps) {
  const { authUser, authMode, setAuthMode, refresh } = useFeedora();

  // Multi-step flow state: Step 1 (Persona) -> Step 2 (Credentials) -> Step 3 (Profile details for register)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const [role, setRole] = useState<UserRole>('respondent');

  // Sign in credentials state
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('feedora123');

  // Respondent registration state
  const [respEmail, setRespEmail] = useState('');
  const [respPassword, setRespPassword] = useState('feedora123');
  const [respName, setRespName] = useState('');
  const [respOrg, setRespOrg] = useState(entities[0]?.id || 'entity-1');
  const [respGender, setRespGender] = useState<Gender>('F');
  const [respAge, setRespAge] = useState<AgeGroup>('18-24');
  const [respAvatar, setRespAvatar] = useState('🎙️');

  // Creator registration state
  const [creatEmail, setCreatEmail] = useState('');
  const [creatPassword, setCreatPassword] = useState('feedora123');
  const [creatFirst, setCreatFirst] = useState('');
  const [creatLast, setCreatLast] = useState('');
  const [creatOrgName, setCreatOrgName] = useState('University of Moratuwa');
  const [creatOrgType, setCreatOrgType] = useState<EntityType>('university');
  const [creatRole, setCreatRole] = useState('Principal Investigator');
  const [creatCountry, setCreatCountry] = useState('Sri Lanka');
  const [creatBio, setCreatBio] = useState('Researcher in Hedonic-Motivation Systems.');

  // Config custom Supabase
  const [showConfig, setShowConfig] = useState(false);
  const [sbUrl, setSbUrl] = useState('');
  const [sbKey, setSbKey] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resetModalState = () => {
    setCurrentStep(1);
    setError(null);
    setLoading(false);
  };

  const handleClose = () => {
    resetModalState();
    onClose();
  };

  const handleSignIn = async () => {
    for (const field of LOGIN_FIELDS) {
      if (field.required) {
        const val = field.name === 'identity' ? signInEmail : signInPassword;
        if (!val || val.trim() === '') {
          setError(`Please enter your ${field.label.toLowerCase()}.`);
          return;
        }
      }
    }
    setError(null);
    setLoading(true);
    try {
      await authPort.signIn({
        email: signInEmail,
        password: signInPassword,
        role,
      });
      refresh();
      handleClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdvanceToProfile = () => {
    setError(null);
    const targetEmail = role === 'respondent' ? respEmail : creatEmail;
    const targetPassword = role === 'respondent' ? respPassword : creatPassword;

    if (!targetEmail || !targetEmail.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }
    if (!targetPassword || targetPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setCurrentStep(3);
  };

  const handleRegister = async () => {
    setError(null);
    setLoading(true);
    try {
      if (role === 'respondent') {
        if (!respEmail) throw new Error('Email is required.');
        await authPort.signUpRespondent({
          email: respEmail,
          password: respPassword,
          displayName: respName || respEmail.split('@')[0] || 'Respondent',
          organizationId: respOrg,
          gender: respGender,
          ageGroup: respAge,
          avatar: respAvatar,
        });
      } else {
        if (!creatEmail) throw new Error('Email is required.');
        if (!creatOrgName) throw new Error('Organization name is required.');
        await authPort.signUpCreator({
          email: creatEmail,
          password: creatPassword,
          firstName: creatFirst || 'Creator',
          lastName: creatLast || 'Researcher',
          displayName: `${creatFirst} ${creatLast}`.trim() || 'Research Lead',
          organizationName: creatOrgName,
          organizationType: creatOrgType,
          userRoleInOrg: creatRole,
          country: creatCountry,
          bio: creatBio,
          avatar: '🔬',
        });
      }
      refresh();
      handleClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSupabaseConfig = () => {
    try {
      authPort.getSupabaseAdapter().configure(sbUrl, sbKey);
      setAuthMode('supabase');
      setShowConfig(false);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          <View style={styles.sheet}>
            {/* Header with Title & Step Breadcrumbs */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <Text style={styles.sheetTitle}>
                  {authUser
                    ? 'Account & Persona'
                    : currentStep === 1
                      ? 'Choose Your Role'
                      : currentStep === 2
                        ? tab === 'signin'
                          ? 'Sign In'
                          : 'Create Account'
                        : 'Profile Details'}
                </Text>
                <Text style={styles.sheetSubtitle}>
                  Aligned with Gihini's Django Research Platform
                </Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={handleClose} accessibilityLabel="Close modal">
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            {/* Stepper Progress Indicator */}
            <View style={styles.stepperBar}>
              <View style={[styles.stepDot, currentStep >= 1 && styles.stepDotActive]}>
                <Text style={[styles.stepDotText, currentStep >= 1 && styles.stepDotTextActive]}>
                  {currentStep > 1 ? '✓' : '1'}
                </Text>
              </View>
              <Text style={[styles.stepLabel, currentStep === 1 && styles.stepLabelActive]}>
                Persona
              </Text>
              <View style={[styles.stepLine, currentStep >= 2 && styles.stepLineActive]} />
              <View style={[styles.stepDot, currentStep >= 2 && styles.stepDotActive]}>
                <Text style={[styles.stepDotText, currentStep >= 2 && styles.stepDotTextActive]}>
                  {currentStep > 2 ? '✓' : '2'}
                </Text>
              </View>
              <Text style={[styles.stepLabel, currentStep === 2 && styles.stepLabelActive]}>
                Account
              </Text>
              {tab === 'register' ? (
                <>
                  <View style={[styles.stepLine, currentStep >= 3 && styles.stepLineActive]} />
                  <View style={[styles.stepDot, currentStep >= 3 && styles.stepDotActive]}>
                    <Text style={[styles.stepDotText, currentStep >= 3 && styles.stepDotTextActive]}>
                      3
                    </Text>
                  </View>
                  <Text style={[styles.stepLabel, currentStep === 3 && styles.stepLabelActive]}>
                    Details
                  </Text>
                </>
              ) : null}
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
              </View>
            ) : null}

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scroll}
            >
              {/* STEP 1: EXPLICIT FIRST-CLASS PERSONA SELECTION */}
              {currentStep === 1 && (
                <View style={styles.stepContainer}>
                  <Text style={styles.sectionSubtitle}>
                    Select your participation mode to configure permissions and interface affordances.
                  </Text>

                  <View style={styles.roleColumn}>
                    {/* Respondent Card */}
                    <Pressable
                      style={[
                        styles.personaCard,
                        role === 'respondent' && styles.personaCardActive,
                      ]}
                      onPress={() => setRole('respondent')}
                    >
                      <View style={styles.personaIconContainer}>
                        <Text style={styles.personaIcon}>🎙️</Text>
                      </View>
                      <View style={styles.personaTextCol}>
                        <View style={styles.personaTitleRow}>
                          <Text style={styles.personaTitle}>Form Respondent</Text>
                          {role === 'respondent' && (
                            <View style={styles.activePill}>
                              <Text style={styles.activePillText}>SELECTED</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.personaDesc}>
                          Participate in academic field studies, earn Voice Points, unlock gamified badges, and level up.
                        </Text>
                        <Text style={styles.personaPerk}>
                          ✨ Access code surveys • Point multiplier • Anonymous demographics
                        </Text>
                      </View>
                    </Pressable>

                    {/* Creator Card */}
                    <Pressable
                      style={[
                        styles.personaCard,
                        role === 'creator' && styles.personaCardActive,
                      ]}
                      onPress={() => setRole('creator')}
                    >
                      <View style={styles.personaIconContainer}>
                        <Text style={styles.personaIcon}>🔬</Text>
                      </View>
                      <View style={styles.personaTextCol}>
                        <View style={styles.personaTitleRow}>
                          <Text style={styles.personaTitle}>Creator / Admin</Text>
                          {role === 'creator' && (
                            <View style={styles.activePill}>
                              <Text style={styles.activePillText}>SELECTED</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.personaDesc}>
                          Scaffold validated psychometric surveys, inspect HMSAM construct distribution, and manage field studies.
                        </Text>
                        <Text style={styles.personaPerk}>
                          📊 Visual Form Studio • Real-time Alpha analytics • Django database sync
                        </Text>
                      </View>
                    </Pressable>
                  </View>

                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => {
                      setError(null);
                      setCurrentStep(2);
                    }}
                  >
                    <Text style={styles.actionBtnText}>
                      Continue as {role === 'creator' ? 'Creator / Admin' : 'Respondent'} →
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* STEP 2: CREDENTIALS (SIGN IN OR REGISTER) */}
              {currentStep === 2 && (
                <View style={styles.stepContainer}>
                  {/* Persona Indicator & Back Navigation */}
                  <View style={styles.navRow}>
                    <Pressable style={styles.backBtn} onPress={() => setCurrentStep(1)}>
                      <Text style={styles.backBtnText}>← Change Persona</Text>
                    </Pressable>
                    <View style={styles.currentPersonaTag}>
                      <Text style={styles.currentPersonaText}>
                        {role === 'creator' ? '🔬 Creator Mode' : '🎙️ Respondent Mode'}
                      </Text>
                    </View>
                  </View>

                  {/* Sign In vs Create Account Sub-tabs */}
                  <View style={styles.tabBar}>
                    <Pressable
                      style={[styles.tabBtn, tab === 'signin' && styles.tabBtnActive]}
                      onPress={() => {
                        setTab('signin');
                        setError(null);
                      }}
                    >
                      <Text style={[styles.tabText, tab === 'signin' && styles.tabTextActive]}>
                        Sign In
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.tabBtn, tab === 'register' && styles.tabBtnActive]}
                      onPress={() => {
                        setTab('register');
                        setError(null);
                      }}
                    >
                      <Text style={[styles.tabText, tab === 'register' && styles.tabTextActive]}>
                        Create Account
                      </Text>
                    </Pressable>
                  </View>

                  {tab === 'signin' ? (
                    // SIGN IN VIEW
                    <View style={styles.formContainer}>
                      <Text style={styles.fieldLabel}>{LOGIN_FIELDS[0].label}</Text>
                      <TextInput
                        style={styles.input}
                        placeholder={LOGIN_FIELDS[0].placeholder}
                        placeholderTextColor={colors.faint}
                        value={signInEmail}
                        onChangeText={setSignInEmail}
                        autoCapitalize={LOGIN_FIELDS[0].autoCapitalize}
                        autoComplete={LOGIN_FIELDS[0].autoComplete as any}
                        textContentType={LOGIN_FIELDS[0].textContentType as any}
                        accessibilityLabel={LOGIN_FIELDS[0].accessibilityLabel}
                        importantForAutofill="yes"
                      />

                      <Text style={styles.fieldLabel}>{LOGIN_FIELDS[1].label}</Text>
                      <TextInput
                        style={styles.input}
                        placeholder={LOGIN_FIELDS[1].placeholder}
                        placeholderTextColor={colors.faint}
                        value={signInPassword}
                        onChangeText={setSignInPassword}
                        secureTextEntry
                        autoComplete={LOGIN_FIELDS[1].autoComplete as any}
                        textContentType={LOGIN_FIELDS[1].textContentType as any}
                        accessibilityLabel={LOGIN_FIELDS[1].accessibilityLabel}
                        importantForAutofill="yes"
                      />

                      <Pressable
                        style={[styles.actionBtn, loading && styles.actionBtnDisabled]}
                        onPress={handleSignIn}
                        disabled={loading}
                      >
                        <Text style={styles.actionBtnText}>
                          {loading
                            ? 'Authenticating…'
                            : `Sign In as ${role === 'creator' ? 'Creator / Admin' : 'Respondent'}`}
                        </Text>
                      </Pressable>

                      {/* Quick real Django accounts */}
                      <View style={styles.demoBox}>
                        <Text style={styles.demoTitle}>QUICK REAL DJANGO ACCOUNTS</Text>
                        <View style={styles.demoRow}>
                          <Pressable
                            style={styles.demoPill}
                            onPress={() => {
                              setSignInEmail('Gihiniw');
                              setSignInPassword('feedora123');
                              setRole('creator');
                            }}
                          >
                            <Text style={styles.demoPillText}>👑 Gihiniw (Admin)</Text>
                          </Pressable>
                          <Pressable
                            style={styles.demoPill}
                            onPress={() => {
                              setSignInEmail('gihini.waidyalankara@aiesec.net');
                              setSignInPassword('feedora123');
                              setRole('creator');
                            }}
                          >
                            <Text style={styles.demoPillText}>🔬 Creator (Lead)</Text>
                          </Pressable>
                          <Pressable
                            style={styles.demoPill}
                            onPress={() => {
                              setSignInEmail('gihinilwaid@gmail.com');
                              setSignInPassword('feedora123');
                              setRole('respondent');
                            }}
                          >
                            <Text style={styles.demoPillText}>🎙️ Respondent</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ) : (
                    // REGISTER VIEW (STEP 2: EMAIL & PASSWORD)
                    <View style={styles.formContainer}>
                      <Text style={styles.fieldLabel}>ACCOUNT EMAIL ADDRESS</Text>
                      <TextInput
                        style={styles.input}
                        placeholder={
                          role === 'creator'
                            ? 'researcher@moratuwa.ac.lk'
                            : 'respondent@student.lk'
                        }
                        placeholderTextColor={colors.faint}
                        value={role === 'creator' ? creatEmail : respEmail}
                        onChangeText={role === 'creator' ? setCreatEmail : setRespEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoComplete="email"
                        textContentType="emailAddress"
                      />

                      <Text style={styles.fieldLabel}>CREATE PASSWORD</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="At least 6 characters"
                        placeholderTextColor={colors.faint}
                        value={role === 'creator' ? creatPassword : respPassword}
                        onChangeText={role === 'creator' ? setCreatPassword : setRespPassword}
                        secureTextEntry
                        autoComplete="new-password"
                        textContentType="newPassword"
                      />

                      <Pressable style={styles.actionBtn} onPress={handleAdvanceToProfile}>
                        <Text style={styles.actionBtnText}>
                          Next: Configure {role === 'creator' ? 'Lab & Profile' : 'Demographics'} →
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}

              {/* STEP 3: DETAILS & PROFILE (REGISTRATION ONLY) */}
              {currentStep === 3 && tab === 'register' && (
                <View style={styles.stepContainer}>
                  <View style={styles.navRow}>
                    <Pressable style={styles.backBtn} onPress={() => setCurrentStep(2)}>
                      <Text style={styles.backBtnText}>← Back to Account</Text>
                    </Pressable>
                    <View style={styles.currentPersonaTag}>
                      <Text style={styles.currentPersonaText}>
                        {role === 'creator' ? '🔬 Lab Profile' : '🎙️ Demographics'}
                      </Text>
                    </View>
                  </View>

                  {role === 'respondent' ? (
                    // Respondent Demographic Configuration
                    <View style={styles.formContainer}>
                      <Text style={styles.fieldLabel}>DISPLAY NAME (PUBLIC VOICE)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. Kasun or VoiceMember"
                        placeholderTextColor={colors.faint}
                        value={respName}
                        onChangeText={setRespName}
                        autoComplete="name"
                        textContentType="name"
                      />

                      <Text style={styles.fieldLabel}>ORGANIZATION / ENTITY TO JOIN</Text>
                      <View style={styles.entityOptions}>
                        {entities.map((e) => (
                          <Pressable
                            key={e.id}
                            style={[
                              styles.entityOption,
                              respOrg === e.id && styles.entityOptionActive,
                            ]}
                            onPress={() => setRespOrg(e.id)}
                          >
                            <Text
                              style={[
                                styles.entityOptionText,
                                respOrg === e.id && styles.entityOptionTextActive,
                              ]}
                            >
                              {e.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <View style={styles.twoCol}>
                        <View style={styles.col}>
                          <Text style={styles.fieldLabel}>GENDER</Text>
                          <View style={styles.chipRow}>
                            {(['F', 'M', 'NB', 'NS'] as Gender[]).map((g) => (
                              <Pressable
                                key={g}
                                style={[styles.chip, respGender === g && styles.chipActive]}
                                onPress={() => setRespGender(g)}
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    respGender === g && styles.chipTextActive,
                                  ]}
                                >
                                  {g === 'F'
                                    ? 'Female'
                                    : g === 'M'
                                      ? 'Male'
                                      : g === 'NB'
                                        ? 'Non-binary'
                                        : 'Not say'}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>

                        <View style={styles.col}>
                          <Text style={styles.fieldLabel}>AGE GROUP</Text>
                          <Text style={styles.privacyNote}>
                            🔒 Used solely for anonymous research demographic distribution.
                          </Text>
                          <View style={styles.chipRow}>
                            {(['18-24', '25-34', '35-44'] as AgeGroup[]).map((a) => (
                              <Pressable
                                key={a}
                                style={[styles.chip, respAge === a && styles.chipActive]}
                                onPress={() => setRespAge(a)}
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    respAge === a && styles.chipTextActive,
                                  ]}
                                >
                                  {a}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      </View>

                      <Text style={styles.fieldLabel}>AVATAR ICON</Text>
                      <View style={styles.avatarRow}>
                        {['🎙️', '🎯', '🌟', '💡', '🚀', '🐱', '✨'].map((emoji) => (
                          <Pressable
                            key={emoji}
                            style={[
                              styles.avatarBtn,
                              respAvatar === emoji && styles.avatarBtnActive,
                            ]}
                            onPress={() => setRespAvatar(emoji)}
                          >
                            <Text style={styles.avatarEmoji}>{emoji}</Text>
                          </Pressable>
                        ))}
                      </View>

                      <Pressable
                        style={[styles.actionBtn, loading && styles.actionBtnDisabled]}
                        onPress={handleRegister}
                        disabled={loading}
                      >
                        <Text style={styles.actionBtnText}>
                          {loading ? 'Registering…' : 'Complete Registration & Launch'}
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    // Creator Lab Configuration
                    <View style={styles.formContainer}>
                      <View style={styles.twoCol}>
                        <View style={styles.col}>
                          <Text style={styles.fieldLabel}>FIRST NAME</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Gihini"
                            placeholderTextColor={colors.faint}
                            value={creatFirst}
                            onChangeText={setCreatFirst}
                          />
                        </View>
                        <View style={styles.col}>
                          <Text style={styles.fieldLabel}>LAST NAME</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Perera"
                            placeholderTextColor={colors.faint}
                            value={creatLast}
                            onChangeText={setCreatLast}
                          />
                        </View>
                      </View>

                      <Text style={styles.fieldLabel}>ORGANIZATION / LAB NAME</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. University of Moratuwa"
                        placeholderTextColor={colors.faint}
                        value={creatOrgName}
                        onChangeText={setCreatOrgName}
                      />

                      <Text style={styles.fieldLabel}>ORGANIZATION TYPE</Text>
                      <View style={styles.chipRow}>
                        {(
                          ['university', 'research', 'company', 'school', 'other'] as EntityType[]
                        ).map((t) => (
                          <Pressable
                            key={t}
                            style={[styles.chip, creatOrgType === t && styles.chipActive]}
                            onPress={() => setCreatOrgType(t)}
                          >
                            <Text
                              style={[
                                styles.chipText,
                                creatOrgType === t && styles.chipTextActive,
                              ]}
                            >
                              {t.toUpperCase()}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <Text style={styles.fieldLabel}>ROLE IN ORGANIZATION</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. Principal Investigator, Senior Researcher"
                        placeholderTextColor={colors.faint}
                        value={creatRole}
                        onChangeText={setCreatRole}
                      />

                      <View style={styles.twoCol}>
                        <View style={styles.col}>
                          <Text style={styles.fieldLabel}>COUNTRY</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Sri Lanka"
                            placeholderTextColor={colors.faint}
                            value={creatCountry}
                            onChangeText={setCreatCountry}
                          />
                        </View>
                        <View style={styles.col}>
                          <Text style={styles.fieldLabel}>RESEARCH FIELD</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Hedonic Motivation"
                            placeholderTextColor={colors.faint}
                            value={creatBio}
                            onChangeText={setCreatBio}
                          />
                        </View>
                      </View>

                      <Pressable
                        style={[styles.actionBtn, loading && styles.actionBtnDisabled]}
                        onPress={handleRegister}
                        disabled={loading}
                      >
                        <Text style={styles.actionBtnText}>
                          {loading ? 'Creating Lab…' : 'Register Creator Account & Launch'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}

              {/* Active Engine Switcher Badge at Bottom */}
              <View style={styles.modeSection}>
                <Text style={styles.modeHeading}>ACTIVE BACKEND ENGINE</Text>
                <View style={styles.modeRow}>
                  <Pressable
                    style={[styles.modePill, authMode === 'django' && styles.modePillActive]}
                    onPress={() => setAuthMode('django')}
                  >
                    <Text
                      style={[styles.modeText, authMode === 'django' && styles.modeTextActive]}
                    >
                      Django Backend
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modePill, authMode === 'local' && styles.modePillActive]}
                    onPress={() => setAuthMode('local')}
                  >
                    <Text
                      style={[styles.modeText, authMode === 'local' && styles.modeTextActive]}
                    >
                      Local SQLite
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modePill, authMode === 'supabase' && styles.modePillActive]}
                    onPress={() => {
                      if (authPort.getSupabaseAdapter().isConfigured()) {
                        setAuthMode('supabase');
                      } else {
                        setShowConfig(true);
                      }
                    }}
                  >
                    <Text
                      style={[styles.modeText, authMode === 'supabase' && styles.modeTextActive]}
                    >
                      Supabase Cloud
                    </Text>
                  </Pressable>
                </View>

                {showConfig ? (
                  <View style={styles.configForm}>
                    <TextInput
                      style={styles.input}
                      placeholder="Supabase URL"
                      placeholderTextColor={colors.faint}
                      value={sbUrl}
                      onChangeText={setSbUrl}
                      autoCapitalize="none"
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Supabase Anon Key"
                      placeholderTextColor={colors.faint}
                      value={sbKey}
                      onChangeText={setSbKey}
                      autoCapitalize="none"
                    />
                    <Pressable style={styles.saveBtn} onPress={handleSaveSupabaseConfig}>
                      <Text style={styles.saveBtnText}>Connect Supabase Cloud</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  keyboardContainer: {
    width: '100%',
    maxHeight: '92%',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: radii.large,
    borderTopRightRadius: radii.large,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    borderWidth: 1,
    borderColor: colors.line,
  },
  scroll: {
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 12,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    fontFamily: serifFont,
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.slateSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: '700',
  },
  stepperBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvas,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.medium,
    marginBottom: 14,
    gap: 6,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepDotText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
  },
  stepDotTextActive: {
    color: '#FFFFFF',
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
  },
  stepLabelActive: {
    color: colors.ink,
    fontWeight: '800',
  },
  stepLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: colors.line,
  },
  stepLineActive: {
    backgroundColor: colors.primary,
  },
  stepContainer: {
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 12.5,
    color: colors.muted,
    lineHeight: 18,
    marginBottom: 14,
  },
  roleColumn: {
    gap: 12,
    marginBottom: 16,
  },
  personaCard: {
    flexDirection: 'row',
    backgroundColor: colors.canvas,
    borderRadius: radii.medium,
    padding: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    gap: 12,
    alignItems: 'flex-start',
  },
  personaCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  personaIconContainer: {
    width: 44,
    height: 44,
    borderRadius: radii.medium,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  personaIcon: {
    fontSize: 24,
  },
  personaTextCol: {
    flex: 1,
  },
  personaTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  personaTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
    fontFamily: serifFont,
  },
  activePill: {
    backgroundColor: colors.primary,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  activePillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  personaDesc: {
    fontSize: 12,
    color: colors.ink,
    lineHeight: 16,
    opacity: 0.85,
  },
  personaPerk: {
    fontSize: 10.5,
    color: colors.muted,
    fontWeight: '600',
    marginTop: 6,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radii.small,
    backgroundColor: colors.canvas,
  },
  backBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.ink,
  },
  currentPersonaTag: {
    backgroundColor: colors.slateSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  currentPersonaText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.ink,
  },
  modeSection: {
    backgroundColor: colors.canvas,
    borderRadius: radii.medium,
    padding: 12,
    marginTop: 8,
  },
  modeHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.faint,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modePill: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: radii.small,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  modePillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.ink,
  },
  modeTextActive: {
    color: '#FFFFFF',
  },
  configForm: {
    marginTop: 8,
    gap: 6,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.small,
    paddingVertical: 8,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11,
  },
  errorBox: {
    backgroundColor: colors.roseSoft,
    padding: 10,
    borderRadius: radii.small,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    color: colors.rose,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.canvas,
    borderRadius: radii.small,
    padding: 4,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radii.small - 2,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: colors.paper,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.primary,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.faint,
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 10,
  },
  formContainer: {
    gap: 4,
  },
  input: {
    backgroundColor: colors.canvas,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.ink,
  },
  twoCol: {
    flexDirection: 'row',
    gap: 10,
  },
  col: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '700',
  },
  chipTextActive: {
    color: colors.primary,
  },
  avatarRow: {
    flexDirection: 'row',
    gap: 8,
  },
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  avatarBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  avatarEmoji: {
    fontSize: 18,
  },
  entityOptions: {
    gap: 6,
  },
  entityOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.small,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
  },
  entityOptionActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  entityOptionText: {
    fontSize: 12,
    color: colors.ink,
    fontWeight: '600',
  },
  entityOptionTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  privacyNote: {
    fontSize: 10.5,
    color: colors.faint,
    marginTop: -4,
    marginBottom: 6,
    fontStyle: 'italic',
  },
  actionBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.medium,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 16,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.4,
  },
  demoBox: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  demoTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.faint,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  demoRow: {
    flexDirection: 'row',
    gap: 8,
  },
  demoPill: {
    flex: 1,
    backgroundColor: colors.slateSoft,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radii.small,
    alignItems: 'center',
  },
  demoPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.ink,
  },
});
