import { useEffect, useState, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, Pressable, LayoutAnimation } from 'react-native';
import { useFeedora } from '../feedora';
import { FEEDORA_REMOTE } from '../config';
import { colors, radii } from '../theme';

export function OfflineSyncBanner() {
  const { outboxPort, refresh } = useFeedora();
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSyncedToast, setShowSyncedToast] = useState(false);
  const prevPendingRef = useRef(0);

  const checkConnectivity = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`${FEEDORA_REMOTE.baseUrl}/api/v1/openapi.json`, {
        method: 'HEAD',
        signal: controller.signal,
      }).catch(() => null);
      clearTimeout(timeoutId);

      const online = res !== null && (res.status === 200 || res.status === 404);
      setIsOnline(online);
      return online;
    } catch {
      setIsOnline(false);
      return false;
    }
  }, []);

  const handleSync = useCallback(async () => {
    if (!outboxPort || isSyncing) return;
    setIsSyncing(true);
    try {
      await outboxPort.flush(true);
      const remaining = await outboxPort.getPendingCount();
      setPendingCount(remaining);
      if (remaining === 0 && prevPendingRef.current > 0) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setShowSyncedToast(true);
        setTimeout(() => setShowSyncedToast(false), 3000);
      }
      prevPendingRef.current = remaining;
      refresh();
    } catch (err) {
      console.warn('Sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [outboxPort, isSyncing, refresh]);

  useEffect(() => {
    if (!outboxPort) return;

    // Initial check
    outboxPort.getPendingCount().then((count) => {
      setPendingCount(count);
      prevPendingRef.current = count;
    });

    const unsub = outboxPort.subscribe((q) => {
      q.getPendingCount().then((count) => {
        setPendingCount(count);
        prevPendingRef.current = count;
      });
    });

    // Check heartbeat every 10 seconds
    checkConnectivity();
    const timer = setInterval(async () => {
      const nowOnline = await checkConnectivity();
      if (nowOnline) {
        const count = await outboxPort.getPendingCount();
        if (count > 0) {
          handleSync();
        }
      }
    }, 10000);

    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [outboxPort, checkConnectivity, handleSync]);

  if (showSyncedToast) {
    return (
      <View style={styles.syncedBanner}>
        <Text style={styles.syncedText}>✓ All responses successfully synced with Django database</Text>
      </View>
    );
  }

  if (!isOnline) {
    return (
      <View style={styles.offlineBanner}>
        <View style={styles.textCol}>
          <Text style={styles.offlineTitle}>📡 Offline Mode</Text>
          <Text style={styles.offlineSub}>
            {pendingCount > 0
              ? `${pendingCount} survey response${pendingCount > 1 ? 's' : ''} safely queued in local outbox`
              : 'Network disconnected. Surveys will be saved locally.'}
          </Text>
        </View>
        <Pressable
          style={styles.retryBtn}
          onPress={async () => {
            const online = await checkConnectivity();
            if (online && pendingCount > 0) {
              handleSync();
            }
          }}
        >
          <Text style={styles.retryBtnText}>Retry ⚡</Text>
        </Pressable>
      </View>
    );
  }

  if (pendingCount > 0) {
    return (
      <View style={styles.pendingBanner}>
        <View style={styles.textCol}>
          <Text style={styles.pendingTitle}>
            📦 {pendingCount} Pending Response{pendingCount > 1 ? 's' : ''}
          </Text>
          <Text style={styles.pendingSub}>Stored in local outbox · Auto-syncing to Django</Text>
        </View>
        <Pressable style={styles.syncBtn} onPress={handleSync} disabled={isSyncing}>
          <Text style={styles.syncBtnText}>{isSyncing ? 'Syncing…' : 'Sync Now ⚡'}</Text>
        </Pressable>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  offlineBanner: {
    backgroundColor: '#FFFBEB',
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  offlineTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#B45309',
  },
  offlineSub: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 1,
  },
  retryBtn: {
    backgroundColor: '#D97706',
    borderRadius: radii.small,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  pendingBanner: {
    backgroundColor: '#FAF5FF',
    borderBottomWidth: 1,
    borderBottomColor: '#E9D5FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pendingTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#7A4FA8',
  },
  pendingSub: {
    fontSize: 11,
    color: '#581C87',
    marginTop: 1,
  },
  syncBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.small,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  syncBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  syncedBanner: {
    backgroundColor: '#F0FDF4',
    borderBottomWidth: 1,
    borderBottomColor: '#BBF7D0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  syncedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  textCol: {
    flex: 1,
  },
});
