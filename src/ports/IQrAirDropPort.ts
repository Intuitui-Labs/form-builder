import type { FormSchema } from '../schema/FormSchema.js';

export interface AirDropManifestResult {
  success: boolean;
  schema?: FormSchema;
  error?: string;
}

export interface ChunkReassemblyResult {
  success: boolean;
  payload?: string;
  error?: string;
}

export interface IQrAirDropPort {
  /**
   * Serializes and compresses a FormSchema into a URL/QR-safe payload with integrity checksum.
   */
  encodeManifest(schema: FormSchema): string;

  /**
   * Decodes, validates checksum, and sanitizes an incoming AirDrop QR payload.
   */
  decodeManifest(payload: string): AirDropManifestResult;

  /**
   * Splits a high-density manifest into scannable chunks for animated/paginated QR display.
   */
  chunkPayload(payload: string, maxBytesPerChunk?: number): string[];

  /**
   * Reassembles a set of chunks back into the original manifest.
   */
  reassembleChunks(chunks: string[]): ChunkReassemblyResult;
}
