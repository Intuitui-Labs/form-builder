/**
 * Outbound Port: Attachment management, local pointer caching, and upload lifecycle
 */

export interface AttachmentPointer {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  localUri: string;
  remoteUrl?: string;
  uploadedAt?: string;
  metadata?: Record<string, unknown>;
}

export type AttachmentUploadStatus = 'idle' | 'uploading' | 'uploaded' | 'failed';

export interface AttachmentUploadState {
  pointer: AttachmentPointer;
  status: AttachmentUploadStatus;
  progressPercentage: number;
  error?: string;
}

export interface IAttachmentStoragePort {
  storeLocal(file: {
    name: string;
    size: number;
    mimeType: string;
    uri: string;
    metadata?: Record<string, unknown>;
  }): Promise<AttachmentPointer>;
  deleteLocal(pointerId: string): Promise<void>;
  getLocal(pointerId: string): Promise<AttachmentPointer | null>;
}

export interface IAttachmentUploadPort {
  upload(
    pointer: AttachmentPointer,
    onProgress?: (progressPercentage: number) => void
  ): Promise<{ remoteUrl: string; receiptId: string }>;
}
