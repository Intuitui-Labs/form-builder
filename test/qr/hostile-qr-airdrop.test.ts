import { describe, it, expect } from 'vitest';
import { QrAirDropAdapter } from '../../src/studio/QrAirDropAdapter.js';
import type { FormSchema } from '../../src/schema/FormSchema.js';

describe('Hostile Peer-to-Peer QR Schema AirDrop Codec', () => {
  const adapter = new QrAirDropAdapter();

  const testSchema: FormSchema = {
    v: '1.0',
    id: 'hmsam-research-airdrop',
    tenantId: 'feedora-org',
    title: 'Offline AirDrop HMSAM Survey',
    description: 'Peer-to-peer field survey manifest',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pages: [
      {
        id: 'p1',
        title: 'Core Constructs',
        fields: [
          {
            id: 'f1',
            name: 'peou_1',
            type: 'likert',
            label: 'Easy to learn how to use',
            required: true,
            order: 0,
            options: [
              { label: 'Strongly Disagree', value: 1 },
              { label: 'Disagree', value: 2 },
              { label: 'Neutral', value: 3 },
              { label: 'Agree', value: 4 },
              { label: 'Strongly Agree', value: 5 },
            ],
          },
          {
            id: 'f2',
            name: 'pu_1',
            type: 'likert',
            label: 'Useful in daily life',
            required: true,
            order: 1,
            options: [
              { label: 'Strongly Disagree', value: 1 },
              { label: 'Disagree', value: 2 },
              { label: 'Neutral', value: 3 },
              { label: 'Agree', value: 4 },
              { label: 'Strongly Agree', value: 5 },
            ],
          },
        ],
      },
    ],
  };

  describe('Hostile Vector 1: Anti-Tamper Checksum & Malformed Payloads', () => {
    it('encodes schema into a valid compact airDrop manifest with checksum header', () => {
      const manifest = adapter.encodeManifest(testSchema);
      expect(typeof manifest).toBe('string');
      expect(manifest.startsWith('FDR1:')).toBe(true);

      const decoded = adapter.decodeManifest(manifest);
      expect(decoded.success).toBe(true);
      expect(decoded.schema?.id).toBe(testSchema.id);
      expect(decoded.schema?.pages[0]?.fields.length).toBe(2);
    });

    it('rejects tampered manifest where single bit or character was altered in transit', () => {
      const manifest = adapter.encodeManifest(testSchema);
      // Alter a character in the body
      const tampered = manifest.slice(0, 15) + 'X' + manifest.slice(16);

      const decoded = adapter.decodeManifest(tampered);
      expect(decoded.success).toBe(false);
      expect(decoded.error).toMatch(/checksum|corrupted|tampered/i);
    });

    it('rejects empty, null, or garbage payloads without throwing unhandled exceptions', () => {
      expect(adapter.decodeManifest('').success).toBe(false);
      expect(adapter.decodeManifest('FDR1:badchecksum:badpayload').success).toBe(false);
      expect(adapter.decodeManifest('random-noise').success).toBe(false);
    });
  });

  describe('Hostile Vector 2: Multi-Frame Chunking for High-Density QR Codes', () => {
    it('splits large schema manifest into scannable chunks and reassembles deterministically', () => {
      const largeSchema: FormSchema = {
        ...testSchema,
        pages: Array.from({ length: 5 }, (_, pageIdx) => ({
          id: `p${pageIdx}`,
          title: `Construct Section ${pageIdx}`,
          fields: Array.from({ length: 8 }, (_, fieldIdx) => ({
            id: `f_${pageIdx}_${fieldIdx}`,
            name: `item_${pageIdx}_${fieldIdx}`,
            type: 'likert',
            label: `Psychometric item label for question ${pageIdx}-${fieldIdx} with detailed explanation`,
            required: true,
            order: fieldIdx,
            options: [
              { label: 'Strongly Disagree', value: 1 },
              { label: 'Disagree', value: 2 },
              { label: 'Neutral', value: 3 },
              { label: 'Agree', value: 4 },
              { label: 'Strongly Agree', value: 5 },
            ],
          })),
        })),
      };

      const manifest = adapter.encodeManifest(largeSchema);
      const chunks = adapter.chunkPayload(manifest, 500); // 500 chars max per QR frame

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(520); // within header boundary
        expect(chunk).toMatch(/^FDR_CHUNK:\d+\/\d+:/);
      }

      // Reassemble in order
      const reassembled = adapter.reassembleChunks(chunks);
      expect(reassembled.success).toBe(true);
      expect(reassembled.payload).toBe(manifest);

      // Verify the reassembled payload decodes to original schema
      const decoded = adapter.decodeManifest(reassembled.payload!);
      expect(decoded.success).toBe(true);
      expect(decoded.schema?.pages.length).toBe(5);
    });

    it('detects missing chunks and returns descriptive error during reassembly', () => {
      const manifest = adapter.encodeManifest(testSchema);
      const chunks = adapter.chunkPayload(manifest, 150);

      if (chunks.length > 1) {
        const missingChunkList = [chunks[0]!]; // dropped the rest
        const result = adapter.reassembleChunks(missingChunkList);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/incomplete|missing/i);
      }
    });
  });
});
