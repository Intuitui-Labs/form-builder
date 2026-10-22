import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Tabs, router, usePathname, type ErrorBoundaryProps } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FeedoraProvider, useFeedora } from '../feedora';
import { OfflineSyncBanner } from '../components/OfflineSyncBanner';
import { WelcomeScreen } from '../components/WelcomeScreen';
import { AccountDrawer } from '../components/AccountDrawer';
import { colors, sansFont, serifFont } from '../theme';
import { FeedoraMark } from '../components/FeedoraUi';

function FeedoraTabs() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const {
    authUser,
    effectiveRole,
    switchPreviewRole,
    previewRole,
    isWelcomeOpen,
    openWelcome,
    closeWelcome,
    isAccountDrawerOpen,
    closeAccountDrawer,
  } = useFeedora();

  const isCreatorActive = effectiveRole === 'creator';
  const isCreatorPreviewingRespondent =
    authUser?.role === 'creator' && previewRole === 'respondent';
  const isWeb = Platform.OS === 'web';

  const webNavItems = [
    { label: 'Survey', route: '/', icon: 'clipboard-outline' as const },
    ...(isCreatorActive ? [{ label: 'Studio', route: '/studio', icon: 'flask-outline' as const }] : []),
    { label: 'Insights', route: '/dashboard', icon: 'stats-chart-outline' as const },
    { label: 'Community', route: '/community', icon: 'people-outline' as const },
  ];

  return (
    <View style={isWeb ? (width >= 900 ? styles.webViewport : styles.webViewportNarrow) : styles.nativeViewport}>
      <View style={Platform.OS === 'web' ? styles.webAppFrame : styles.nativeAppFrame}>
      {/* Offline Connectivity & Outbox Sync Banner */}
      <OfflineSyncBanner />

      {/* Banner when Creator is previewing as Respondent */}
      {isCreatorPreviewingRespondent && (
        <View
          style={{
            backgroundColor: '#FEF3C7',
            paddingVertical: 8,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottomWidth: 1,
            borderBottomColor: '#FDE68A',
            zIndex: 999,
          }}
        >
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#92400E' }}>
            👁️ Previewing as Respondent
          </Text>
          <Pressable
            style={{
              backgroundColor: '#D97706',
              borderRadius: 6,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
            onPress={() => switchPreviewRole(null)}
          >
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>
              Switch Back to Creator 🔬
            </Text>
          </Pressable>
        </View>
      )}

      {isWeb && (
        <View style={[styles.webHeader, width < 760 && styles.webHeaderCompact]}>
          <View style={[styles.webBrand, width < 760 && styles.webBrandCompact]}>
            <FeedoraMark size={width < 760 ? 26 : 30} />
            <Text style={[styles.webBrandName, width < 760 && styles.webBrandNameCompact]}>Feedora</Text>
          </View>
          <View style={[styles.webNav, width < 760 && styles.webNavCompact]}>
            {webNavItems.map((item) => {
              const active = item.route === '/' ? pathname === '/' : pathname.startsWith(item.route);
              return (
                <Pressable
                  key={item.route}
                  accessibilityRole="link"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: active }}
                  onPress={() => router.navigate(item.route as never)}
                  style={[styles.webNavItem, width < 760 && styles.webNavItemCompact, active && styles.webNavItemActive]}
                >
                  <Ionicons name={item.icon} size={16} color={active ? colors.ink : colors.muted} />
                  {width >= 760 ? (
                    <Text style={[styles.webNavLabel, active && styles.webNavLabelActive]}>{item.label}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.webHeaderRight, width < 760 && styles.webHeaderRightCompact]}>
            {width >= 760 ? <Text style={styles.webHeaderContext}>{authUser?.displayName ?? 'Guest'}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={authUser ? 'Account' : 'Sign in'}
              onPress={openWelcome}
              style={[styles.webAccountButton, width < 760 && styles.webAccountButtonCompact]}
            >
              <Ionicons name="person-circle-outline" size={18} color={colors.ink} />
              {width >= 760 ? <Text style={styles.webAccountLabel}>{authUser ? 'Account' : 'Sign in'}</Text> : null}
            </Pressable>
          </View>
        </View>
      )}

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarPosition: Platform.OS === 'web' ? 'top' : 'bottom',
          tabBarActiveTintColor: colors.ink,
          tabBarInactiveTintColor: colors.faint,
          tabBarLabelStyle: {
            fontSize: Platform.OS === 'web' ? 12 : 10.5,
            fontWeight: '600',
            letterSpacing: 0.2,
            paddingBottom: 2,
          },
          tabBarStyle: {
            display: isWeb ? 'none' : 'flex',
            height: Platform.OS === 'web' ? 62 : 64,
            paddingTop: Platform.OS === 'web' ? 0 : 6,
            paddingBottom: Platform.OS === 'web' ? 0 : 6,
            backgroundColor: '#FFFFFF',
            borderTopColor: colors.line,
            borderTopWidth: Platform.OS === 'web' ? 0 : 1,
            borderBottomColor: colors.line,
            borderBottomWidth: Platform.OS === 'web' ? 1 : 0,
            paddingHorizontal: Platform.OS === 'web' ? 18 : 0,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Survey',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'clipboard' : 'clipboard-outline'}
                size={22}
                color={String(color)}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="studio"
          options={{
            title: 'Studio',
            href: isCreatorActive ? '/studio' : null,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'flask' : 'flask-outline'}
                size={22}
                color={String(color)}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Insights',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'stats-chart' : 'stats-chart-outline'}
                size={22}
                color={String(color)}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="community"
          options={{
            title: 'Community',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'people' : 'people-outline'}
                size={22}
                color={String(color)}
              />
            ),
          }}
        />
      </Tabs>
      <WelcomeScreen visible={isWelcomeOpen} onClose={closeWelcome} />
      <AccountDrawer
        visible={isAccountDrawerOpen}
        onClose={closeAccountDrawer}
        onOpenAuth={openWelcome}
      />
      </View>
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.minHeight = '100%';
      document.documentElement.style.fontSize = '16px';
      document.body.style.minHeight = '100vh';
      document.body.style.margin = '0';
      document.body.style.backgroundColor = colors.canvas;
      document.body.style.fontFamily = sansFont;
      document.body.style.fontSize = '16px';
      document.body.style.lineHeight = '1.5';
      const fontId = 'feedora-google-fonts';
      if (!document.getElementById(fontId)) {
        const link = document.createElement('link');
        link.id = fontId;
        link.rel = 'stylesheet';
        link.href =
          'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Serif+Display:ital@0;1&family=Inter:wght@300;400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap';
        document.head.appendChild(link);
      }
    }
  }, []);

  return (
    <FeedoraProvider>
      <FeedoraTabs />
    </FeedoraProvider>
  );
}

const styles = StyleSheet.create({
  nativeViewport: { flex: 1 },
  nativeAppFrame: { flex: 1 },
  webViewport: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 0,
    backgroundColor: colors.canvas,
  },
  webViewportNarrow: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  webAppFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 1480,
    backgroundColor: colors.canvas,
  },
  webHeader: {
    minHeight: 68,
    paddingHorizontal: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    zIndex: 2,
  },
  webHeaderCompact: { minHeight: 62, paddingHorizontal: 10 },
  webBrand: { flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 170 },
  webBrandCompact: { minWidth: 0, gap: 6 },
  webBrandName: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '500',
    letterSpacing: -0.2,
    fontFamily: serifFont,
  },
  webBrandNameCompact: { fontSize: 18, lineHeight: 24 },
  webNav: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' },
  webNavCompact: { gap: 2 },
  webNavItem: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  webNavItemCompact: { width: 40, paddingHorizontal: 0, justifyContent: 'center' },
  webNavItemActive: { backgroundColor: '#F2F1ED' },
  webNavLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.muted, fontFamily: sansFont },
  webNavLabelActive: { color: colors.ink },
  webHeaderRight: { minWidth: 170, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16 },
  webHeaderRightCompact: { minWidth: 0, marginLeft: 4 },
  webHeaderContext: { fontSize: 14, lineHeight: 20, color: colors.muted, fontFamily: sansFont },
  webAccountButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  webAccountButtonCompact: { width: 44, paddingHorizontal: 0, justifyContent: 'center' },
  webAccountLabel: { fontSize: 14, lineHeight: 20, color: colors.ink, fontWeight: '600', fontFamily: sansFont },
});

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={errorStyles.container}>
      <Text style={errorStyles.title}>Feedora couldn’t start</Text>
      <Text selectable style={errorStyles.message}>
        {error.message || 'An unexpected error occurred while opening the app.'}
      </Text>
      <Pressable accessibilityRole="button" onPress={retry} style={errorStyles.button}>
        <Text style={errorStyles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F5F0',
    padding: 24,
    gap: 14,
  },
  title: {
    color: '#172033',
    fontSize: 22,
    fontWeight: '700',
  },
  message: {
    color: '#687386',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  button: {
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: '#1F4D8F',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
