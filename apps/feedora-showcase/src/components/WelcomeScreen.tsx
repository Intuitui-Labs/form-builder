import { useEffect, useState } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import type { UserRole } from '../domain/authTypes';
import { store, useFeedora } from '../feedora';
import { colors, radii, serifFont } from '../theme';

interface WelcomeScreenProps {
  visible: boolean;
  onClose: () => void;
}

export function WelcomeScreen({ visible, onClose }: WelcomeScreenProps) {
  const { refresh, signIn, signUpRespondent, signUpCreator } = useFeedora();

  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [role, setRole] = useState<UserRole>('respondent'); // Default role: respondent

  // Sign In inputs
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [rememberLogin, setRememberLogin] = useState(false);
  const [savedLogin, setSavedLogin] = useState<{ identity: string; role: UserRole } | null>(null);

  // Register inputs
  const [email, setEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    store.getItem('feedora:saved-login').then((value) => {
      if (!active || !value) return;
      try {
        const parsed = JSON.parse(value) as { identity?: unknown; role?: unknown };
        if (typeof parsed.identity === 'string' && parsed.identity.trim()) {
          setSavedLogin({
            identity: parsed.identity.trim(),
            role: parsed.role === 'creator' ? 'creator' : 'respondent',
          });
          setRememberLogin(true);
        }
      } catch {
        setSavedLogin(null);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [visible]);

  const handleSignIn = async () => {
    const trimmedId = identity.trim();
    if (!trimmedId) {
      setErrorMessage('Please enter your email or username.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await signIn({
        email: trimmedId,
        password,
        role,
      });
      try {
        if (rememberLogin) {
          const saved = { identity: trimmedId, role };
          await store.setItem('feedora:saved-login', JSON.stringify(saved));
          setSavedLogin(saved);
        } else {
          await store.removeItem('feedora:saved-login');
          setSavedLogin(null);
        }
      } catch {
        // Authentication should still complete when local preference storage is unavailable.
      }
      setSuccessMessage(`Welcome back! Logged in as ${role === 'creator' ? 'Creator' : 'Respondent'}.`);
      refresh();
      setTimeout(() => {
        setIsLoading(false);
        onClose();
      }, 400);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'Login failed. Please check your credentials.');
    }
  };

  const handleRegister = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter an email address.');
      return;
    }
    if (!regPassword || regPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (role === 'respondent') {
        await signUpRespondent({
          email: trimmedEmail,
          password: regPassword,
          displayName: displayName.trim() || trimmedEmail.split('@')[0] || 'Respondent',
        });
      } else {
        await signUpCreator({
          email: trimmedEmail,
          password: regPassword,
          firstName: firstName.trim() || 'Researcher',
          lastName: lastName.trim() || 'Lead',
          country: 'Sri Lanka',
        });
      }
      setSuccessMessage(`Account created! Entering Feedora as ${role === 'creator' ? 'Creator' : 'Respondent'}…`);
      refresh();
      setTimeout(() => {
        setIsLoading(false);
        onClose();
      }, 500);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'Registration failed. Please check your inputs.');
    }
  };

  const handleGuestContinue = () => {
    setErrorMessage(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType={Platform.OS === 'web' ? 'fade' : 'slide'} transparent={Platform.OS === 'web'} onRequestClose={onClose}>
      <View style={Platform.OS === 'web' ? styles.webOverlay : styles.nativeOverlay}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Close / Dismiss button */}
          <View style={styles.topBar}>
            <View />
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Hero Welcome Header */}
          <View style={styles.heroSection}>
            <Text style={styles.heroLogo}>Feedora</Text>
            <Text style={styles.heroTitle}>Research that listens.</Text>
            <Text style={styles.heroSubtitle}>Sign in to keep your progress, or explore first as a guest.</Text>
          </View>

          {/* Quick Flow: Continue as Guest */}
          <Pressable style={styles.topGuestCard} onPress={handleGuestContinue}>
            <View style={styles.topGuestHeader}>
              <Text style={styles.topGuestEmoji}>🚀</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.topGuestTitle}>Explore as Guest</Text>
                <Text style={styles.topGuestSub}>
                  Take surveys instantly without registering.
                </Text>
              </View>
              <Text style={styles.topGuestArrow}>→</Text>
            </View>
          </Pressable>

          {/* Step 1: Choose Your Role */}
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionLabel}>CHOOSE YOUR ROLE</Text>
            <View style={styles.roleCardRow}>
              {/* Respondent Card (Default) */}
              <Pressable
                style={[
                  styles.roleCard,
                  role === 'respondent' && styles.roleCardActiveRespondent,
                ]}
                onPress={() => {
                  setRole('respondent');
                  setErrorMessage(null);
                }}
              >
                <View style={styles.roleHeaderRow}>
                  <Text style={styles.roleEmoji}>🎓</Text>
                </View>
                <Text style={styles.roleTitle}>Respondent</Text>
                <Text style={styles.roleDesc}>
                  Earn Voice Points, unlock badges & build your streak.
                </Text>
                <View
                  style={[
                    styles.radioIndicator,
                    role === 'respondent' && styles.radioIndicatorActiveRespondent,
                  ]}
                >
                  <Text style={styles.radioText}>{role === 'respondent' ? '✓ Selected' : 'Select'}</Text>
                </View>
              </Pressable>

              {/* Creator Card */}
              <Pressable
                style={[
                  styles.roleCard,
                  role === 'creator' && styles.roleCardActiveCreator,
                ]}
                onPress={() => {
                  setRole('creator');
                  setErrorMessage(null);
                }}
              >
                <View style={styles.roleHeaderRow}>
                  <Text style={styles.roleEmoji}>🔬</Text>
                </View>
                <Text style={styles.roleTitle}>Researcher</Text>
                <Text style={styles.roleDesc}>
                  Author instruments, run experiments & view analytics.
                </Text>
                <View
                  style={[
                    styles.radioIndicator,
                    role === 'creator' && styles.radioIndicatorActiveCreator,
                  ]}
                >
                  <Text style={styles.radioText}>{role === 'creator' ? '✓ Selected' : 'Select'}</Text>
                </View>
              </Pressable>
            </View>
          </View>

          {/* Step 2: Sign In or Register */}
          <View style={styles.sectionWrap}>
            <View style={styles.modeTabBar}>
              <Pressable
                style={[styles.modeTab, mode === 'signin' && styles.modeTabActive]}
                onPress={() => {
                  setMode('signin');
                  setErrorMessage(null);
                }}
              >
                <Text style={[styles.modeTabText, mode === 'signin' && styles.modeTabTextActive]}>
                  Sign In
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modeTab, mode === 'register' && styles.modeTabActive]}
                onPress={() => {
                  setMode('register');
                  setErrorMessage(null);
                }}
              >
                <Text style={[styles.modeTabText, mode === 'register' && styles.modeTabTextActive]}>
                  Create Account
                </Text>
              </Pressable>
            </View>

            {/* Error or Success feedback */}
            {errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
              </View>
            ) : null}
            {mode === 'register' && errorMessage && /already exists|already registered|account exists|409/i.test(errorMessage) ? (
              <Pressable
                accessibilityRole="button"
                style={styles.returningAccountHint}
                onPress={() => {
                  setMode('signin');
                  setIdentity(email.trim());
                  setErrorMessage(null);
                }}
              >
                <Text style={styles.returningAccountText}>Already have an account? Sign in instead</Text>
              </Pressable>
            ) : null}
            {successMessage ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>✓ {successMessage}</Text>
              </View>
            ) : null}

            {/* SIGN IN FORM */}
            {mode === 'signin' ? (
              <View style={styles.formCard}>
                <View style={styles.roleBannerRow}>
                  <Text style={styles.roleBannerText}>
                    Logging in as{' '}
                    <Text style={{ fontWeight: '800', color: role === 'creator' ? '#B45309' : '#7A4FA8' }}>
                      {role === 'creator' ? '🔬 Research Creator' : '🎓 Form Respondent'}
                    </Text>
                  </Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>EMAIL OR USERNAME</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Email or username"
                    placeholderTextColor="#94A3B8"
                    value={identity}
                    onChangeText={setIdentity}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="username"
                    textContentType="username"
                    autoCorrect={false}
                  />
                </View>

                {savedLogin ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Use saved account ${savedLogin.identity}`}
                    style={styles.savedLogin}
                    onPress={() => {
                      setIdentity(savedLogin.identity);
                      setRole(savedLogin.role);
                    }}
                  >
                    <Text style={styles.savedLoginLabel}>Saved account</Text>
                    <Text numberOfLines={1} style={styles.savedLoginIdentity}>{savedLogin.identity}</Text>
                  </Pressable>
                ) : null}

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>PASSWORD</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter account password"
                    placeholderTextColor="#94A3B8"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="current-password"
                    textContentType="password"
                  />
                </View>

                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: rememberLogin }}
                  style={styles.rememberRow}
                  onPress={() => setRememberLogin((value) => !value)}
                >
                  <View style={[styles.checkbox, rememberLogin && styles.checkboxChecked]}>
                    {rememberLogin ? <Text style={styles.checkboxMark}>✓</Text> : null}
                  </View>
                  <Text style={styles.rememberLabel}>Remember this account on this device</Text>
                </Pressable>

                <Pressable
                  style={[styles.primaryActionBtn, isLoading && { opacity: 0.7 }]}
                  onPress={handleSignIn}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.primaryActionBtnText}>
                      Sign In as {role === 'creator' ? 'Creator' : 'Respondent'} →
                    </Text>
                  )}
                </Pressable>

              </View>
            ) : (
              /* REGISTER FORM */
              <View style={styles.formCard}>
                <View style={styles.roleBannerRow}>
                  <Text style={styles.roleBannerText}>
                    Registering new{' '}
                    <Text style={{ fontWeight: '800', color: role === 'creator' ? '#B45309' : '#7A4FA8' }}>
                      {role === 'creator' ? '🔬 Research Creator' : '🎓 Form Respondent'}
                    </Text>{' '}
                    Account
                  </Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>EMAIL ADDRESS *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="your.email@university.lk"
                    placeholderTextColor="#94A3B8"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    textContentType="emailAddress"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>CREATE PASSWORD *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="At least 6 characters"
                    placeholderTextColor="#94A3B8"
                    value={regPassword}
                    onChangeText={setRegPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="new-password"
                    textContentType="newPassword"
                  />
                </View>

                {role === 'respondent' ? (
                  <>
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>FULL NAME / DISPLAY NAME</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. Kasun Bandara"
                        placeholderTextColor="#94A3B8"
                        value={displayName}
                        onChangeText={setDisplayName}
                      />
                    </View>

                    <Text style={styles.membershipNote}>You can join organizations after creating your account.</Text>
                  </>
                ) : (
                  <>
                    <View style={styles.rowTwoCols}>
                      <View style={[styles.fieldGroup, { flex: 1 }]}>
                        <Text style={styles.fieldLabel}>FIRST NAME *</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="Gihini"
                          placeholderTextColor="#94A3B8"
                          value={firstName}
                          onChangeText={setFirstName}
                        />
                      </View>
                      <View style={[styles.fieldGroup, { flex: 1 }]}>
                        <Text style={styles.fieldLabel}>LAST NAME *</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="Perera"
                          placeholderTextColor="#94A3B8"
                          value={lastName}
                          onChangeText={setLastName}
                        />
                      </View>
                    </View>

                    <Text style={styles.membershipNote}>You can create or join an organization after creating your account.</Text>
                  </>
                )}

                <Pressable
                  style={[styles.primaryActionBtn, isLoading && { opacity: 0.7 }]}
                  onPress={handleRegister}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.primaryActionBtnText}>
                      Register as {role === 'creator' ? 'Creator' : 'Respondent'} →
                    </Text>
                  )}
                </Pressable>
              </View>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 820 : undefined,
    maxHeight: Platform.OS === 'web' ? '90%' : undefined,
    backgroundColor: Platform.OS === 'web' ? colors.paper : '#F8FAFC',
    borderRadius: Platform.OS === 'web' ? 20 : 0,
    overflow: 'hidden',
  },
  webOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, backgroundColor: 'rgba(20,20,15,0.38)' },
  nativeOverlay: { flex: 1 },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 820 : undefined,
    alignSelf: 'center',
    paddingHorizontal: Platform.OS === 'web' ? 40 : 20,
    paddingTop: Platform.OS === 'web' ? 28 : Platform.OS === 'ios' ? 54 : 32,
    paddingBottom: Platform.OS === 'web' ? 32 : 48,
    backgroundColor: colors.paper,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  brandingBadge: {
    backgroundColor: '#FAF5FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  brandingBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#7A4FA8',
    letterSpacing: 0.8,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  heroSection: {
    marginBottom: 16,
  },
  topGuestCard: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryMid,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  topGuestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topGuestEmoji: {
    fontSize: 26,
  },
  topGuestTitle: {
    fontSize: Platform.select({ web: 15, default: 13.5 }),
    fontWeight: '800',
    color: '#6B21A8',
  },
  topGuestSub: {
    fontSize: Platform.select({ web: 13, default: 11.5 }),
    color: '#7E22CE',
    lineHeight: 16,
    marginTop: 2,
  },
  topGuestArrow: {
    fontSize: 18,
    fontWeight: '800',
    color: '#7A4FA8',
    paddingLeft: 4,
  },
  instantPill: {
    backgroundColor: '#7A4FA8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  instantPillText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  heroLogo: {
    fontSize: Platform.select({ web: 32, default: 28 }),
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.5,
  },
  heroTitle: {
    fontSize: Platform.select({ web: 28, default: 22 }),
    fontWeight: '800',
    color: colors.ink,
    fontFamily: serifFont,
    marginTop: 6,
    lineHeight: Platform.select({ web: 36, default: 28 }),
  },
  heroSubtitle: {
    fontSize: Platform.select({ web: 15, default: 13 }),
    lineHeight: Platform.select({ web: 23, default: 19 }),
    color: colors.muted,
    marginTop: 6,
  },
  sectionWrap: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: Platform.select({ web: 12, default: 10.5 }),
    fontWeight: '800',
    color: colors.faint,
    letterSpacing: 1,
    marginBottom: 10,
  },
  roleCardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  roleCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 14,
    justifyContent: 'space-between',
    minHeight: 170,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  roleCardActiveRespondent: {
    borderColor: colors.primaryDeep,
    backgroundColor: colors.primarySoft,
  },
  roleCardActiveCreator: {
    borderColor: '#D97706',
    backgroundColor: '#FFFBEB',
  },
  roleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roleEmoji: {
    fontSize: 28,
  },
  defaultBadge: {
    backgroundColor: '#7A4FA8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  creatorBadge: {
    backgroundColor: '#D97706',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  creatorBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  roleTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
    fontFamily: serifFont,
    marginTop: 8,
  },
  roleDesc: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
    marginTop: 4,
    marginBottom: 8,
  },
  radioIndicator: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingVertical: 4,
    alignItems: 'center',
  },
  radioIndicatorActiveRespondent: {
    backgroundColor: '#7A4FA8',
  },
  radioIndicatorActiveCreator: {
    backgroundColor: '#D97706',
  },
  radioText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  modeTabBar: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  modeTabTextActive: {
    color: colors.ink,
    fontWeight: '800',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  roleBannerRow: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  roleBannerText: {
    fontSize: Platform.select({ web: 14, default: 12 }),
    color: colors.muted,
  },
  fieldGroup: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: Platform.select({ web: 12, default: 10 }),
    fontWeight: '800',
    color: colors.faint,
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: Platform.select({ web: 16, default: 13 }),
    color: colors.ink,
  },
  rowTwoCols: {
    flexDirection: 'row',
    gap: 10,
  },
  membershipNote: { color: colors.muted, fontSize: Platform.select({ web: 14, default: 12 }), lineHeight: Platform.select({ web: 21, default: 18 }) },
  primaryActionBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  successBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#4ADE80',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  successText: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '700',
  },
  savedLogin: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
  },
  savedLoginLabel: { color: colors.muted, fontSize: 11, lineHeight: 15, fontWeight: '600' },
  savedLoginIdentity: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 40 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.primaryDeep, borderColor: colors.primaryDeep },
  checkboxMark: { color: '#FFFFFF', fontSize: 12, lineHeight: 15, fontWeight: '800' },
  rememberLabel: { color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '500' },
  returningAccountHint: { alignSelf: 'flex-start', paddingVertical: 4 },
  returningAccountText: { color: colors.primaryDeep, fontSize: 13, lineHeight: 19, fontWeight: '700' },
});
