import { useEffect } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { FeedoraProvider, useFeedora } from '../feedora';
import { colors } from '../theme';

function FeedoraTabs() {
  const { authUser, effectiveRole, switchPreviewRole, previewRole } = useFeedora();

  const isCreatorActive = effectiveRole === 'creator';
  const isCreatorPreviewingRespondent =
    authUser?.role === 'creator' && previewRole === 'respondent';

  return (
    <View style={{ flex: 1 }}>
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

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.ink,
          tabBarInactiveTintColor: colors.faint,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 0.2,
            paddingBottom: 4,
          },
          tabBarStyle: {
            height: 62,
            paddingTop: 8,
            paddingBottom: 6,
            backgroundColor: '#FFFFFF',
            borderTopColor: colors.line,
            borderTopWidth: 1,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Survey' }} />
        <Tabs.Screen
          name="studio"
          options={{
            title: 'Studio',
            href: isCreatorActive ? '/studio' : null,
          }}
        />
        <Tabs.Screen name="dashboard" options={{ title: 'Insights' }} />
        <Tabs.Screen name="community" options={{ title: 'Community' }} />
      </Tabs>
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
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
