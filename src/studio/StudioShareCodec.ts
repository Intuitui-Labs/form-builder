import type { FormSchema, FormPage, FormField } from '../schema/FormSchema.js';
import type { ISanitizerPort } from '../ports/ISanitizerPort.js';
import { DefaultSanitizer } from '../core/DefaultSanitizer.js';

interface GlobalBufferHolder {
  Buffer?: {
    from(content: string, encoding: string): {
      toString(encoding: string): string;
    };
  };
}

/**
 * Universal base64url encoding and decoding with UTF-8 character boundary safety.
 */
function base64UrlEncode(str: string): string {
  let base64: string;
  const globalBuf = (globalThis as unknown as GlobalBufferHolder).Buffer;
  if (globalBuf) {
    base64 = globalBuf.from(str, 'utf-8').toString('base64');
  } else if (typeof btoa !== 'undefined') {
    const utf8Bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]!);
    }
    base64 = btoa(binary);
  } else {
    throw new Error('No base64 encoding capability available in this runtime');
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(base64url: string): string {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  const globalBuf = (globalThis as unknown as GlobalBufferHolder).Buffer;
  if (globalBuf) {
    return globalBuf.from(base64, 'base64').toString('utf-8');
  } else if (typeof atob !== 'undefined') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } else {
    throw new Error('No base64 decoding capability available in this runtime');
  }
}

/**
 * Recursively deep-sanitizes all user-facing text fields in a FormSchema against XSS,
 * malicious HTML/script injection, and unsafe protocols.
 */
function sanitizeSchemaTree(schema: FormSchema, sanitizer: ISanitizerPort): FormSchema {
  const clean: FormSchema = {
    ...schema,
    title: sanitizer.sanitizeRichText(schema.title ?? ''),
    description: schema.description ? sanitizer.sanitizeRichText(schema.description) : undefined,
    pages: schema.pages.map((p): FormPage => ({
      ...p,
      title: sanitizer.sanitizeRichText(p.title ?? ''),
      description: p.description ? sanitizer.sanitizeRichText(p.description) : undefined,
      fields: p.fields.map((f): FormField => {
        const cleanField: FormField = {
          ...f,
          label: sanitizer.sanitizeRichText(f.label || ''),
          placeholder: f.placeholder ? sanitizer.sanitizeRichText(f.placeholder) : undefined,
          helperText: f.helperText ? sanitizer.sanitizeRichText(f.helperText) : undefined,
          content: f.content ? sanitizer.sanitizeRichText(f.content) : undefined,
        };

        if (cleanField.options && Array.isArray(cleanField.options)) {
          cleanField.options = cleanField.options.map((opt) => ({
            ...opt,
            label: sanitizer.sanitizeRichText(opt.label),
            description: opt.description ? sanitizer.sanitizeRichText(opt.description) : undefined,
          }));
        }

        return cleanField;
      }),
    })),
  };

  return clean;
}

export interface DecodeSchemaResult {
  success: boolean;
  schema?: FormSchema;
  error?: string;
}

/**
 * StudioShareCodec
 *
 * Lightweight, zero-dependency serialization codec for zero-backend sharing of form schemas.
 * Compresses schemas into URL-safe Base64 slugs and enforces strict anti-XSS sanitization upon receipt.
 */
export const StudioShareCodec = {
  /**
   * Encodes a FormSchema into a URL-safe compact slug.
   */
  encodeToSlug(schema: FormSchema): string {
    const jsonString = JSON.stringify(schema);
    return base64UrlEncode(jsonString);
  },

  /**
   * Decodes a URL-safe slug into a validated and sanitized FormSchema.
   */
  decodeFromSlug(
    slug: string,
    options?: { sanitizer?: ISanitizerPort },
  ): DecodeSchemaResult {
    if (!slug || typeof slug !== 'string' || slug.trim() === '') {
      return { success: false, error: 'Empty or invalid slug payload' };
    }

    try {
      const decodedJson = base64UrlDecode(slug.trim());
      const parsed = JSON.parse(decodedJson) as FormSchema;

      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.pages)) {
        return { success: false, error: 'Invalid schema AST: missing pages array' };
      }

      if (parsed.pages.length === 0) {
        return { success: false, error: 'Invalid schema AST: form must have at least one page' };
      }

      const sanitizer = options?.sanitizer ?? new DefaultSanitizer();
      const cleanSchema = sanitizeSchemaTree(parsed, sanitizer);

      return { success: true, schema: cleanSchema };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to decode or parse schema payload';
      return { success: false, error: message };
    }
  },

  /**
   * Generates a complete shareable URL with a compact schema slug in the hash fragment or query string.
   */
  generateShareableUrl(
    baseUrl: string,
    schema: FormSchema,
    mode: 'hash' | 'query' = 'hash',
    paramKey = 'f',
  ): string {
    const slug = this.encodeToSlug(schema);
    const cleanBase = baseUrl.split('#')[0]!.split('?')[0]!;

    if (mode === 'hash') {
      return `${cleanBase}#${paramKey}=${slug}`;
    } else {
      const glue = cleanBase.includes('?') ? '&' : '?';
      return `${cleanBase}${glue}${paramKey}=${slug}`;
    }
  },

  /**
   * Extracts and decodes a FormSchema from a shareable URL (query param or hash fragment).
   */
  extractFromUrl(
    url: string,
    paramKey = 'f',
    options?: { sanitizer?: ISanitizerPort },
  ): DecodeSchemaResult {
    try {
      // 1. Check hash fragment first
      const hashIndex = url.indexOf('#');
      if (hashIndex !== -1) {
        const hash = url.substring(hashIndex + 1);
        const params = new URLSearchParams(hash);
        const slug = params.get(paramKey);
        if (slug) {
          return this.decodeFromSlug(slug, options);
        }
      }

      // 2. Check query string
      const parsed = new URL(url, 'https://dummy.intuitui.local');
      const slug = parsed.searchParams.get(paramKey);
      if (slug) {
        return this.decodeFromSlug(slug, options);
      }

      return { success: false, error: `Parameter '${paramKey}' not found in URL` };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Malformed URL provided';
      return { success: false, error: message };
    }
  },
};
