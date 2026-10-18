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
  ActivityIndicator,
} from 'react-native';
import type { UserRole, EntityType, AgeGroup, Gender } from '../domain/authTypes';
import { authPort, entities, useFeedora } from '../feedora';
import { colors, radii, serifFont } from '../theme';

interface WelcomeScreenProps {
  visible: boolean;
  onClose: () => void;
}

export function WelcomeScreen({ visible, onClose }: WelcomeScreenProps) {
  const { authUser, authMode, refresh, setEntityId } = useFeedora();

  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [role, setRole] = useState<UserRole>('respondent'); // Default role: respondent

  // Sign In inputs
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');

  // Register inputs
  const [email, setEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState(entities[0]?.id || 'entity-1');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [orgName, setOrgName] = useState('University of Moratuwa');
  const [orgType, setOrgType] = useState<EntityType>('university');
  const [userRoleInOrg, setUserRoleInOrg] = useState('Principal Investigator');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSignIn = async () => {
    const trimmedId = identity.trim();
    if (!trimmedId) {
      setErrorMessage('Please enter your email or username.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await authPort.signIn({
        email: trimmedId,
        password,
        role,
      });
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
    if (!regPassword || regPassword.length < 4) {
      setErrorMessage('Password must be at least 4 characters.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (role === 'respondent') {
        await authPort.signUpRespondent({
          email: trimmedEmail,
          password: regPassword,
          displayName: displayName.trim() || trimmedEmail.split('@')[0] || 'Respondent',
          organizationId: selectedEntityId,
        });
        setEntityId(selectedEntityId);
      } else {
        await authPort.signUpCreator({
          email: trimmedEmail,
          password: regPassword,
          firstName: firstName.trim() || 'Researcher',
          lastName: lastName.trim() || 'Lead',
          organizationName: orgName.trim() || 'Research Lab',
          organizationType: orgType,
          userRoleInOrg: userRoleInOrg.trim() || 'Principal Investigator',
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

  const quickFillKasun = () => {
    setRole('respondent');
    setIdentity('gihinilwaid@gmail.com');
    setPassword('Feedora2026!');
    setErrorMessage(null);
  };

  const quickFillGihini = () => {
    setRole('creator');
    setIdentity('gihini.waidyalankara@aiesec.net');
    setPassword('Feedora2026!');
    setErrorMessage(null);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
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
            <View style={styles.brandingBadge}>
              <Text style={styles.brandingBadgeText}>ACADEMIC RESEARCH PLATFORM</Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Hero Welcome Header */}
          <View style={styles.heroSection}>
            <Text style={styles.heroLogo}>🎙️ feedora</Text>
            <Text style={styles.heroTitle}>Hedonic-Motivation Research & Voice Economy</Text>
            <Text style={styles.heroSubtitle}>
              Empirical psychometric study of user adoption, immersion, and behavioral intention.
            </Text>
          </View>

          {/* Quick Flow: Continue as Guest (Immediately Visible at the Top) */}
          <Pressable style={styles.topGuestCard} onPress={handleGuestContinue}>
            <View style={styles.topGuestHeader}>
              <Text style={styles.topGuestEmoji}>🚀</Text>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.topGuestTitle}>Explore Immediately as Guest</Text>
                  <View style={styles.instantPill}>
                    <Text style={styles.instantPillText}>INSTANT</Text>
                  </View>
                </View>
                <Text style={styles.topGuestSub}>
                  No registration needed. Jump straight into active academic surveys now.
                </Text>
              </View>
              <Text style={styles.topGuestArrow}>→</Text>
            </View>
          </Pressable>

          {/* Step 1: Choose Your Role */}
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionLabel}>STEP 1: CHOOSE YOUR ROLE (OR SIGN IN)</Text>
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
                  {role === 'respondent' && (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.roleTitle}>Respondent</Text>
                <Text style={styles.roleDesc}>
                  Contribute survey data, earn Voice Points, unlock milestone badges & track streaks.
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
                  {role === 'creator' && (
                    <View style={styles.creatorBadge}>
                      <Text style={styles.creatorBadgeText}>RESEARCHER</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.roleTitle}>Survey Creator</Text>
                <Text style={styles.roleDesc}>
                  Author instruments in Creator Studio, deploy live experiments & view Welch's t analytics.
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
                    placeholder={role === 'creator' ? 'creator@moratuwa.ac.lk' : 'kasun@campus.lk'}
                    placeholderTextColor="#94A3B8"
                    value={identity}
                    onChangeText={setIdentity}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                  />
                </View>

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
                  />
                </View>

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

                {/* Fast Fill Presets for Instant Demo */}
                <View style={styles.fastFillWrap}>
                  <Text style={styles.fastFillHeading}>INSTANT DEMO PRESETS</Text>
                  <View style={styles.fastFillBtnRow}>
                    <Pressable style={styles.fastFillBtn} onPress={quickFillKasun}>
                      <Text style={styles.fastFillBtnText}>⚡ Demo Respondent</Text>
                    </Pressable>
                    <Pressable style={styles.fastFillBtn} onPress={quickFillGihini}>
                      <Text style={styles.fastFillBtnText}>⚡ Demo Creator</Text>
                    </Pressable>
                  </View>
                </View>
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
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>CREATE PASSWORD *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Minimum 4 characters"
                    placeholderTextColor="#94A3B8"
                    value={regPassword}
                    onChangeText={setRegPassword}
                    secureTextEntry
                    autoCapitalize="none"
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

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>CAMPUS / AFFILIATED INSTITUTION</Text>
                      <View style={styles.entityPillsWrap}>
                        {entities.map((e) => (
                          <Pressable
                            key={e.id}
                            style={[
                              styles.entityPill,
                              selectedEntityId === e.id && styles.entityPillActive,
                            ]}
                            onPress={() => setSelectedEntityId(e.id)}
                          >
                            <Text
                              style={[
                                styles.entityPillText,
                                selectedEntityId === e.id && styles.entityPillTextActive,
                              ]}
                            >
                              {e.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
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

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>ORGANIZATION / LAB NAME *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="University of Moratuwa"
                        placeholderTextColor="#94A3B8"
                        value={orgName}
                        onChangeText={setOrgName}
                      />
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>ROLE IN ORGANIZATION</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Principal Investigator / Lecturer"
                        placeholderTextColor="#94A3B8"
                        value={userRoleInOrg}
                        onChangeText={setUserRoleInOrg}
                      />
                    </View>
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

          {/* Quick Flow: Continue as Guest */}
          <View style={styles.guestSection}>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR EXPLORE IMMEDIATELY</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable style={styles.guestActionBtn} onPress={handleGuestContinue}>
              <Text style={styles.guestActionBtnEmoji}>🚀</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.guestActionTitle}>Continue as Guest Respondent</Text>
                <Text style={styles.guestActionSubtitle}>
                  Take surveys instantly without signing up. Points can be claimed later.
                </Text>
              </View>
              <Text style={styles.guestActionArrow}>→</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 54 : 32,
    paddingBottom: 48,
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
    backgroundColor: '#FAF5FF',
    borderWidth: 1.5,
    borderColor: '#E9D5FF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 22,
    shadowColor: '#7A4FA8',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
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
    fontSize: 13.5,
    fontWeight: '800',
    color: '#6B21A8',
  },
  topGuestSub: {
    fontSize: 11.5,
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
    fontSize: 28,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.5,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    fontFamily: serifFont,
    marginTop: 6,
    lineHeight: 28,
  },
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    marginTop: 6,
  },
  sectionWrap: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 10.5,
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
    borderColor: '#E2E8F0',
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
    borderColor: '#7A4FA8',
    backgroundColor: '#FAF5FF',
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
    fontSize: 12,
    color: colors.muted,
  },
  fieldGroup: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 10,
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
    fontSize: 13,
    color: colors.ink,
  },
  rowTwoCols: {
    flexDirection: 'row',
    gap: 10,
  },
  entityPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  entityPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  entityPillActive: {
    backgroundColor: '#FAF5FF',
    borderColor: '#7A4FA8',
  },
  entityPillText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  entityPillTextActive: {
    color: '#7A4FA8',
    fontWeight: '800',
  },
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
  fastFillWrap: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 6,
  },
  fastFillHeading: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.faint,
    letterSpacing: 0.8,
  },
  fastFillBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fastFillBtn: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    alignItems: 'center',
  },
  fastFillBtnText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
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
  guestSection: {
    gap: 12,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#CBD5E1',
  },
  dividerText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1,
  },
  guestActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  guestActionBtnEmoji: {
    fontSize: 24,
  },
  guestActionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.ink,
  },
  guestActionSubtitle: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  guestActionArrow: {
    fontSize: 16,
    fontWeight: '700',
    color: '#94A3B8',
  },
});
