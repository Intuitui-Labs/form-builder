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
import type { AuthMode, ExportDataPayload } from '../domain/authTypes';
import { authPort, useFeedora } from '../feedora';
import { colors, radii, serifFont } from '../theme';

interface AccountDrawerProps {
  visible: boolean;
  onClose: () => void;
  onOpenAuth: () => void;
}

export function AccountDrawer({ visible, onClose, onOpenAuth }: AccountDrawerProps) {
  const { authUser, authMode, setAuthMode, profile, refresh } = useFeedora();
  const [exportResult, setExportResult] = useState<ExportDataPayload | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSignOut = async () => {
    await authPort.signOut();
    refresh();
    onClose();
  };

  const handleExport = async (format: 'json' | 'csv' | 'sql') => {
    const res = await authPort.exportData(format);
    setExportResult(res);
    setCopied(false);
  };

  if (!authUser) {
    return null;
  }

  const isCreator = authUser.role === 'creator';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.userHead}>
                <Text style={styles.userAvatar}>{authUser.avatar}</Text>
                <View>
                  <Text style={styles.userName}>{authUser.displayName}</Text>
                  <Text style={styles.userEmail}>{authUser.email}</Text>
                </View>
              </View>
              <Pressable style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            {/* Role Badge & Org */}
            <View style={styles.badgeBanner}>
              <View
                style={[
                  styles.rolePill,
                  isCreator ? styles.rolePillCreator : styles.rolePillRespondent,
                ]}
              >
                <Text
                  style={[
                    styles.rolePillText,
                    isCreator ? styles.rolePillTextCreator : styles.rolePillTextRespondent,
                  ]}
                >
                  {isCreator ? '🔬 FORM CREATOR' : '🎙️ FORM RESPONDENT'}
                </Text>
              </View>
              <Text style={styles.orgText}>
                {authUser.organizationName || 'University of Moratuwa'}
              </Text>
            </View>

            {/* Respondent Stats or Creator Stats */}
            {!isCreator ? (
              <View style={styles.statsCard}>
                <View style={styles.statCol}>
                  <Text style={styles.statNum}>{profile?.totalPoints ?? authUser.totalPoints}</Text>
                  <Text style={styles.statLbl}>Voice Points</Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={styles.statNum}>{profile?.standing.title ?? 'Active Member'}</Text>
                  <Text style={styles.statLbl}>Level Standing</Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={styles.statNum}>{profile?.surveysCompleted ?? 1}</Text>
                  <Text style={styles.statLbl}>Surveys</Text>
                </View>
              </View>
            ) : (
              <View style={styles.creatorCard}>
                <Text style={styles.creatorOrgTitle}>
                  {authUser.organizationName || 'University of Moratuwa'}
                </Text>
                <Text style={styles.creatorOrgRole}>
                  {authUser.userRoleInOrg || 'Principal Investigator'} · {authUser.country || 'Sri Lanka'}
                </Text>
                {authUser.bio ? <Text style={styles.creatorBio}>{authUser.bio}</Text> : null}
              </View>
            )}

            {/* Engine Switcher */}
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>ACTIVE BACKEND ENGINE</Text>
              <View style={styles.modeRow}>
                <Pressable
                  style={[styles.modeBtn, authMode === 'local' && styles.modeBtnActive]}
                  onPress={() => setAuthMode('local')}
                >
                  <Text style={[styles.modeBtnText, authMode === 'local' && styles.modeBtnTextActive]}>
                    ⚡ Local SQLite
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modeBtn, authMode === 'supabase' && styles.modeBtnActive]}
                  onPress={() => setAuthMode('supabase')}
                >
                  <Text style={[styles.modeBtnText, authMode === 'supabase' && styles.modeBtnTextActive]}>
                    ☁️ Supabase
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modeBtn, authMode === 'django' && styles.modeBtnActive]}
                  onPress={() => setAuthMode('django')}
                >
                  <Text style={[styles.modeBtnText, authMode === 'django' && styles.modeBtnTextActive]}>
                    🐍 Django API
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Data Migration & Export (Aligned with Gihini's schema) */}
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>SCHEMA EXPORT & MIGRATION</Text>
              <Text style={styles.sectionSub}>
                Export data aligned 1:1 with Gihini's Django models for instant migration.
              </Text>
              <View style={styles.exportRow}>
                <Pressable style={styles.exportBtn} onPress={() => handleExport('json')}>
                  <Text style={styles.exportBtnText}>📥 Export JSON</Text>
                </Pressable>
                <Pressable style={styles.exportBtn} onPress={() => handleExport('csv')}>
                  <Text style={styles.exportBtnText}>📊 Export CSV</Text>
                </Pressable>
                <Pressable style={styles.exportBtn} onPress={() => handleExport('sql')}>
                  <Text style={styles.exportBtnText}>🗄️ Export SQL</Text>
                </Pressable>
              </View>

              {exportResult && (
                <View style={styles.exportBox}>
                  <View style={styles.exportHead}>
                    <Text style={styles.exportFormat}>
                      {exportResult.format.toUpperCase()} EXPORT ({exportResult.userCount} users)
                    </Text>
                    <Pressable
                      onPress={() => {
                        setCopied(true);
                      }}
                    >
                      <Text style={styles.copyText}>{copied ? '✓ Saved' : 'Copy Preview'}</Text>
                    </Pressable>
                  </View>
                  <TextInput
                    style={styles.exportText}
                    value={exportResult.content}
                    multiline
                    editable={false}
                  />
                </View>
              )}
            </View>

            {/* Actions */}
            <View style={styles.actionRow}>
              <Pressable
                style={styles.switchAccountBtn}
                onPress={() => {
                  onClose();
                  onOpenAuth();
                }}
              >
                <Text style={styles.switchAccountText}>Switch Account / Sign In</Text>
              </Pressable>
              <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
                <Text style={styles.signOutText}>Sign Out</Text>
              </Pressable>
            </View>
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
    maxHeight: '90%',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 28,
  },
  scroll: {
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  userHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userAvatar: {
    fontSize: 32,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    fontFamily: serifFont,
  },
  userEmail: {
    fontSize: 12,
    color: colors.muted,
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
  badgeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.canvas,
    padding: 10,
    borderRadius: radii.small,
    marginBottom: 16,
  },
  rolePill: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
  },
  rolePillRespondent: {
    backgroundColor: colors.primarySoft,
  },
  rolePillCreator: {
    backgroundColor: colors.goldSoft,
  },
  rolePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  rolePillTextRespondent: {
    color: colors.primary,
  },
  rolePillTextCreator: {
    color: colors.gold,
  },
  orgText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.canvas,
    borderRadius: radii.medium,
    padding: 14,
    marginBottom: 16,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.ink,
  },
  statLbl: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '700',
    marginTop: 2,
  },
  creatorCard: {
    backgroundColor: colors.canvas,
    borderRadius: radii.medium,
    padding: 14,
    marginBottom: 16,
    gap: 4,
  },
  creatorOrgTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },
  creatorOrgRole: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '600',
  },
  creatorBio: {
    fontSize: 11,
    color: colors.ink,
    marginTop: 4,
    lineHeight: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.faint,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  sectionSub: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 8,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radii.small,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  modeBtnTextActive: {
    color: '#FFFFFF',
  },
  exportRow: {
    flexDirection: 'row',
    gap: 8,
  },
  exportBtn: {
    flex: 1,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 8,
    borderRadius: radii.small,
    alignItems: 'center',
  },
  exportBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  exportBox: {
    marginTop: 10,
    backgroundColor: colors.canvas,
    borderRadius: radii.small,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  exportHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  exportFormat: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
  },
  copyText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.teal,
  },
  exportText: {
    maxHeight: 120,
    fontSize: 10,
    fontFamily: 'monospace',
    color: colors.ink,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  switchAccountBtn: {
    flex: 1,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 12,
    borderRadius: radii.medium,
    alignItems: 'center',
  },
  switchAccountText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
  },
  signOutBtn: {
    paddingHorizontal: 20,
    backgroundColor: colors.roseSoft,
    paddingVertical: 12,
    borderRadius: radii.medium,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.rose,
  },
});
