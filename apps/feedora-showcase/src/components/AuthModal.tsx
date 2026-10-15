import { useState } from 'react';
import {
  Modal,
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
import { authPort, entities, useFeedora } from '../feedora';
import { colors, radii, serifFont } from '../theme';

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AuthModal({ visible, onClose }: AuthModalProps) {
  const { authUser, authMode, setAuthMode, refresh } = useFeedora();

  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const [role, setRole] = useState<UserRole>('respondent');

  // Sign in state
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

  const handleSignIn = async () => {
    if (!signInEmail) {
      setError('Please enter your email.');
      return;
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
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
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
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const quickDemoLogin = (demoRole: UserRole) => {
    if (demoRole === 'respondent') {
      setSignInEmail('gihinilwaid@uni.lk');
      setSignInPassword('feedora123');
      setRole('respondent');
    } else {
      setSignInEmail('creator@moratuwa.ac.lk');
      setSignInPassword('feedora123');
      setRole('creator');
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Header */}
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.sheetTitle}>
                  {authUser ? 'Account & Session' : tab === 'signin' ? 'Sign In' : 'Create Account'}
                </Text>
                <Text style={styles.sheetSubtitle}>
                  Aligned with Gihini's Django research platform
                </Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            {/* Storage Mode Selector (All 3 real options) */}
            <View style={styles.modeSection}>
              <Text style={styles.modeHeading}>ACTIVE AUTH & DATA ENGINE</Text>
              <View style={styles.modeRow}>
                <Pressable
                  style={[styles.modePill, authMode === 'local' && styles.modePillActive]}
                  onPress={() => setAuthMode('local')}
                >
                  <Text style={[styles.modeText, authMode === 'local' && styles.modeTextActive]}>
                    ⚡ Local SQLite
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modePill, authMode === 'supabase' && styles.modePillActive]}
                  onPress={() => setAuthMode('supabase')}
                >
                  <Text style={[styles.modeText, authMode === 'supabase' && styles.modeTextActive]}>
                    ☁️ Supabase
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modePill, authMode === 'django' && styles.modePillActive]}
                  onPress={() => setAuthMode('django')}
                >
                  <Text style={[styles.modeText, authMode === 'django' && styles.modeTextActive]}>
                    🐍 Django API
                  </Text>
                </Pressable>
              </View>

              {authMode === 'supabase' && !authPort.getSupabaseAdapter().isConfigured() && (
                <View style={styles.configBanner}>
                  <Text style={styles.configNotice}>
                    Supabase credentials not configured in environment.
                  </Text>
                  <Pressable onPress={() => setShowConfig(!showConfig)}>
                    <Text style={styles.configLink}>
                      {showConfig ? 'Hide Config' : '⚙️ Enter Supabase URL & Key'}
                    </Text>
                  </Pressable>
                  {showConfig && (
                    <View style={styles.configForm}>
                      <TextInput
                        style={styles.input}
                        placeholder="https://your-project.supabase.co"
                        placeholderTextColor={colors.faint}
                        value={sbUrl}
                        onChangeText={setSbUrl}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="Anon Public API Key"
                        placeholderTextColor={colors.faint}
                        value={sbKey}
                        onChangeText={setSbKey}
                        secureTextEntry
                      />
                      <Pressable style={styles.saveBtn} onPress={handleSaveSupabaseConfig}>
                        <Text style={styles.saveBtnText}>Connect Supabase</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
              </View>
            ) : null}

            {/* Tab Switcher: Sign In vs Create Account */}
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
                  Register New Account
                </Text>
              </Pressable>
            </View>

            {/* Role Switcher */}
            <View style={styles.roleBox}>
              <Text style={styles.fieldLabel}>CHOOSE YOUR ROLE</Text>
              <View style={styles.roleRow}>
                <Pressable
                  style={[styles.roleCard, role === 'respondent' && styles.roleCardActive]}
                  onPress={() => setRole('respondent')}
                >
                  <Text style={styles.roleIcon}>🎙️</Text>
                  <Text style={[styles.roleTitle, role === 'respondent' && styles.roleTitleActive]}>
                    Form Respondent
                  </Text>
                  <Text style={styles.roleSubtitle}>Take surveys & earn voice points</Text>
                </Pressable>
                <Pressable
                  style={[styles.roleCard, role === 'creator' && styles.roleCardActive]}
                  onPress={() => setRole('creator')}
                >
                  <Text style={styles.roleIcon}>🔬</Text>
                  <Text style={[styles.roleTitle, role === 'creator' && styles.roleTitleActive]}>
                    Form Creator
                  </Text>
                  <Text style={styles.roleSubtitle}>Host research & organizations</Text>
                </Pressable>
              </View>
            </View>

            {/* Form Fields */}
            {tab === 'signin' ? (
              <View style={styles.formContainer}>
                <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
                <TextInput
                  style={styles.input}
                  placeholder="name@organization.lk"
                  placeholderTextColor={colors.faint}
                  value={signInEmail}
                  onChangeText={setSignInEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.faint}
                  value={signInPassword}
                  onChangeText={setSignInPassword}
                  secureTextEntry
                />

                <Pressable
                  style={[styles.actionBtn, loading && styles.actionBtnDisabled]}
                  onPress={handleSignIn}
                  disabled={loading}
                >
                  <Text style={styles.actionBtnText}>
                    {loading ? 'Authenticating…' : `Sign In as ${role === 'creator' ? 'Creator' : 'Respondent'}`}
                  </Text>
                </Pressable>

                {/* Quick demo presets */}
                <View style={styles.demoBox}>
                  <Text style={styles.demoTitle}>QUICK DEMO ACCOUNTS</Text>
                  <View style={styles.demoRow}>
                    <Pressable
                      style={styles.demoPill}
                      onPress={() => quickDemoLogin('respondent')}
                    >
                      <Text style={styles.demoPillText}>🎙️ gihinilwaid (Respondent)</Text>
                    </Pressable>
                    <Pressable
                      style={styles.demoPill}
                      onPress={() => quickDemoLogin('creator')}
                    >
                      <Text style={styles.demoPillText}>🔬 Dr. Gihini (Creator)</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : role === 'respondent' ? (
              // Respondent Registration Form
              <View style={styles.formContainer}>
                <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
                <TextInput
                  style={styles.input}
                  placeholder="your.email@campus.lk"
                  placeholderTextColor={colors.faint}
                  value={respEmail}
                  onChangeText={setRespEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Create a password"
                  placeholderTextColor={colors.faint}
                  value={respPassword}
                  onChangeText={setRespPassword}
                  secureTextEntry
                />

                <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Kasun or VoiceMember"
                  placeholderTextColor={colors.faint}
                  value={respName}
                  onChangeText={setRespName}
                />

                <Text style={styles.fieldLabel}>ORGANIZATION / ENTITY TO JOIN</Text>
                <View style={styles.entityOptions}>
                  {entities.map((e) => (
                    <Pressable
                      key={e.id}
                      style={[styles.entityOption, respOrg === e.id && styles.entityOptionActive]}
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
                          <Text style={[styles.chipText, respGender === g && styles.chipTextActive]}>
                            {g === 'F' ? 'Female' : g === 'M' ? 'Male' : g === 'NB' ? 'Non-binary' : 'Not say'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View style={styles.col}>
                    <Text style={styles.fieldLabel}>AGE GROUP</Text>
                    <View style={styles.chipRow}>
                      {(['18-24', '25-34', '35-44'] as AgeGroup[]).map((a) => (
                        <Pressable
                          key={a}
                          style={[styles.chip, respAge === a && styles.chipActive]}
                          onPress={() => setRespAge(a)}
                        >
                          <Text style={[styles.chipText, respAge === a && styles.chipTextActive]}>
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
                      style={[styles.avatarBtn, respAvatar === emoji && styles.avatarBtnActive]}
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
                    {loading ? 'Registering…' : 'Register Respondent Account'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              // Creator Registration Form
              <View style={styles.formContainer}>
                <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
                <TextInput
                  style={styles.input}
                  placeholder="researcher@university.edu"
                  placeholderTextColor={colors.faint}
                  value={creatEmail}
                  onChangeText={setCreatEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Create a password"
                  placeholderTextColor={colors.faint}
                  value={creatPassword}
                  onChangeText={setCreatPassword}
                  secureTextEntry
                />

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
                  {(['university', 'research', 'company', 'school', 'other'] as EntityType[]).map(
                    (t) => (
                      <Pressable
                        key={t}
                        style={[styles.chip, creatOrgType === t && styles.chipActive]}
                        onPress={() => setCreatOrgType(t)}
                      >
                        <Text style={[styles.chipText, creatOrgType === t && styles.chipTextActive]}>
                          {t.toUpperCase()}
                        </Text>
                      </Pressable>
                    ),
                  )}
                </View>

                <Text style={styles.fieldLabel}>ROLE IN ORGANIZATION</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Principal Investigator / Senior Lecturer"
                  placeholderTextColor={colors.faint}
                  value={creatRole}
                  onChangeText={setCreatRole}
                />

                <Text style={styles.fieldLabel}>RESEARCH BIO</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Briefly describe your survey/research program"
                  placeholderTextColor={colors.faint}
                  value={creatBio}
                  onChangeText={setCreatBio}
                  multiline
                />

                <Pressable
                  style={[styles.actionBtn, loading && styles.actionBtnDisabled]}
                  onPress={handleRegister}
                  disabled={loading}
                >
                  <Text style={styles.actionBtnText}>
                    {loading ? 'Creating Account…' : 'Register Creator Account'}
                  </Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(27, 21, 51, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radii.large,
    borderTopRightRadius: radii.large,
    maxHeight: '92%',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 28,
  },
  scroll: {
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    fontFamily: serifFont,
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
  modeSection: {
    backgroundColor: colors.canvas,
    borderRadius: radii.medium,
    padding: 12,
    marginBottom: 16,
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
    paddingHorizontal: 10,
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
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  modeTextActive: {
    color: '#FFFFFF',
  },
  configBanner: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  configNotice: {
    fontSize: 11,
    color: colors.gold,
    fontWeight: '600',
  },
  configLink: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '800',
    marginTop: 4,
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
  roleBox: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.faint,
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 10,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roleCard: {
    flex: 1,
    backgroundColor: colors.canvas,
    borderRadius: radii.medium,
    padding: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  roleCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  roleIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  roleTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
  },
  roleTitleActive: {
    color: colors.primary,
  },
  roleSubtitle: {
    fontSize: 10,
    color: colors.muted,
    marginTop: 2,
    lineHeight: 14,
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
  textArea: {
    height: 60,
    textAlignVertical: 'top',
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
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.ink,
  },
});
