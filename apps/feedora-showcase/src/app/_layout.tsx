import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { FeedoraProvider } from '../feedora';
import { colors } from '../theme';

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
        <Tabs.Screen name="studio" options={{ title: 'Studio' }} />
        <Tabs.Screen name="dashboard" options={{ title: 'Insights' }} />
        <Tabs.Screen name="community" options={{ title: 'Community' }} />
      </Tabs>
    </FeedoraProvider>
  );
}
