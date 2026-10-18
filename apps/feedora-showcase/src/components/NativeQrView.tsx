import { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import QRCode from 'qrcode';

interface NativeQrViewProps {
  value: string;
  size?: number;
  darkColor?: string;
  lightColor?: string;
}

export function NativeQrView({
  value,
  size = 220,
  darkColor = '#0F172A',
  lightColor = '#FFFFFF',
}: NativeQrViewProps) {
  const result = useMemo(() => {
    if (!value) return null;
    try {
      const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
      const moduleCount = qr.modules.size;
      const rows: number[][] = [];
      for (let r = 0; r < moduleCount; r++) {
        const row: number[] = [];
        for (let c = 0; c < moduleCount; c++) {
          row.push(qr.modules.get(r, c));
        }
        rows.push(row);
      }
      return { rows, moduleCount };
    } catch (err: any) {
      return { error: err?.message || 'Failed to encode QR' };
    }
  }, [value]);

  if (!result || 'error' in result) {
    return (
      <View style={[styles.errorContainer, { width: size, height: size }]}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>
          {result && 'error' in result
            ? 'Data payload too large for optical QR. Please share the Access Code or Link directly.'
            : 'Generating QR code…'}
        </Text>
      </View>
    );
  }

  const cellSize = Math.floor(size / result.moduleCount);
  const actualSize = cellSize * result.moduleCount;

  return (
    <View
      style={[
        styles.container,
        {
          width: actualSize + 20,
          height: actualSize + 20,
          backgroundColor: lightColor,
        },
      ]}
    >
      {result.rows.map((row, rIdx) => (
        <View key={rIdx} style={styles.row}>
          {row.map((cell, cIdx) => (
            <View
              key={cIdx}
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: cell ? darkColor : lightColor,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
  },
  errorContainer: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    gap: 8,
  },
  errorIcon: {
    fontSize: 28,
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '600',
  },
});
