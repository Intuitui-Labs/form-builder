import type { FormSchema } from '../schema/FormSchema.js';
import type {
  IQrAirDropPort,
  AirDropManifestResult,
  ChunkReassemblyResult,
} from '../ports/IQrAirDropPort.js';
import { StudioShareCodec } from '../studio/StudioShareCodec.js';

function computeCrc32(str: string): string {
  let crc = 0 ^ -1;
  for (let i = 0; i < str.length; i++) {
    let byte = str.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      const bit = (crc ^ byte) & 1;
      crc = (crc >>> 1) ^ (bit ? 0xedb88320 : 0);
      byte >>>= 1;
    }
  }
  return ((crc ^ -1) >>> 0).toString(16).padStart(8, '0');
}

export class QrAirDropAdapter implements IQrAirDropPort {
  private readonly defaultMaxBytesPerChunk = 450;

  public encodeManifest(schema: FormSchema): string {
    const slug = StudioShareCodec.encodeToSlug(schema);
    const checksum = computeCrc32(slug);
    return `FDR1:${checksum}:${slug}`;
  }

  public decodeManifest(payload: string): AirDropManifestResult {
    if (!payload || typeof payload !== 'string' || !payload.trim()) {
      return { success: false, error: 'Empty or invalid AirDrop payload' };
    }

    const trimmed = payload.trim();
    if (!trimmed.startsWith('FDR1:')) {
      return { success: false, error: 'Invalid AirDrop format: missing FDR1 header' };
    }

    const parts = trimmed.split(':');
    if (parts.length < 3) {
      return { success: false, error: 'Malformed AirDrop envelope: missing checksum or body' };
    }

    const checksum = parts[1]!;
    const slug = parts.slice(2).join(':'); // Handle any colons in slug if present

    const expectedChecksum = computeCrc32(slug);
    if (checksum !== expectedChecksum) {
      return {
        success: false,
        error: `AirDrop payload checksum mismatch: expected ${expectedChecksum}, got ${checksum} (corrupted or tampered)`,
      };
    }

    const decodeRes = StudioShareCodec.decodeFromSlug(slug);
    if (!decodeRes.success || !decodeRes.schema) {
      return { success: false, error: decodeRes.error ?? 'Failed to parse schema AST' };
    }

    return {
      success: true,
      schema: decodeRes.schema,
    };
  }

  public chunkPayload(payload: string, maxBytesPerChunk?: number): string[] {
    const chunkSize = maxBytesPerChunk ?? this.defaultMaxBytesPerChunk;
    if (payload.length <= chunkSize) {
      return [payload];
    }

    const totalChunks = Math.ceil(payload.length / chunkSize);
    const chunks: string[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const slice = payload.slice(i * chunkSize, (i + 1) * chunkSize);
      chunks.push(`FDR_CHUNK:${i}/${totalChunks}:${slice}`);
    }

    return chunks;
  }

  public reassembleChunks(chunks: string[]): ChunkReassemblyResult {
    if (!chunks || chunks.length === 0) {
      return { success: false, error: 'No chunks provided for reassembly' };
    }

    // Single chunk without chunking header
    if (chunks.length === 1 && !chunks[0]!.startsWith('FDR_CHUNK:')) {
      return { success: true, payload: chunks[0] };
    }

    const parsedChunks = new Map<number, string>();
    let expectedTotal = -1;

    for (const chunk of chunks) {
      const match = chunk.match(/^FDR_CHUNK:(\d+)\/(\d+):(.*)$/s);
      if (!match) {
        return { success: false, error: `Invalid chunk format: ${chunk.slice(0, 30)}...` };
      }

      const idx = parseInt(match[1]!, 10);
      const total = parseInt(match[2]!, 10);
      const data = match[3]!;

      if (expectedTotal === -1) {
        expectedTotal = total;
      } else if (expectedTotal !== total) {
        return { success: false, error: 'Inconsistent chunk total counts detected' };
      }

      parsedChunks.set(idx, data);
    }

    if (parsedChunks.size !== expectedTotal) {
      return {
        success: false,
        error: `Incomplete chunk set: received ${parsedChunks.size} of ${expectedTotal} chunks`,
      };
    }

    let assembled = '';
    for (let i = 0; i < expectedTotal; i++) {
      const chunkData = parsedChunks.get(i);
      if (chunkData === undefined) {
        return { success: false, error: `Missing chunk index ${i}` };
      }
      assembled += chunkData;
    }

    return { success: true, payload: assembled };
  }
}
