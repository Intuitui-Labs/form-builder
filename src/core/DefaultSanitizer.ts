import type { ISanitizerPort } from '../ports/ISanitizerPort.js';

const DEFAULT_ALLOWED_EMBED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'vimeo.com',
  'player.vimeo.com',
  'loom.com',
  'www.loom.com',
  'wistia.com',
  'fast.wistia.net',
]);

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Zero-dependency pure TypeScript sanitizer for URLs, rich text, and multimedia embeds.
 * Defends against XSS, dangerous iframe injection, and malicious script executions.
 */
export class DefaultSanitizer implements ISanitizerPort {
  public sanitizeUrl(url: string): string {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();

    // Relative URLs and hash fragments are safe
    if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
      return trimmed;
    }

    try {
      const parsed = new URL(trimmed);
      if (ALLOWED_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
        return trimmed;
      }
      return '';
    } catch {
      // If not a parseable absolute URL and contains dangerous tokens
      const lower = trimmed.toLowerCase();
      if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
        return '';
      }
      return trimmed;
    }
  }

  public sanitizeRichText(markdownOrHtml: string): string {
    if (!markdownOrHtml || typeof markdownOrHtml !== 'string') return '';

    let sanitized = markdownOrHtml;
    let prev = '';
    let iterations = 0;

    // Iterative pass to defeat nested tag evasion (e.g. <scr<script>ipt>)
    while (sanitized !== prev && iterations < 5) {
      prev = sanitized;
      iterations++;

      // 1. Strip script tags and their content
      sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

      // 2. Strip style tags
      sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

      // 3. Strip dangerous HTML container tags: object, embed, applet, form, meta, link, iframe, base
      sanitized = sanitized.replace(/<\/?(object|embed|applet|form|meta|link|iframe|base)\b[^>]*>/gi, '');

      // 4. Strip inline event handlers (e.g. onload=, onerror=, onclick=)
      sanitized = sanitized.replace(/\son\w+\s*=\s*(["'][^"']*["']|[^\s>]+)/gi, '');
    }

    // 5. Strip dangerous protocols in markdown links: [text](javascript:...), [text](data:...), [text](vbscript:...)
    sanitized = sanitized.replace(
      /\[([^\]]+)\]\(\s*(?:javascript|data|vbscript):(?:[^()]+|\([^()]*\))*\)/gi,
      '[$1](#)',
    );

    // 6. Strip dangerous protocols in HTML href/src attributes: href="javascript:..."
    sanitized = sanitized.replace(
      /(href|src)\s*=\s*["']\s*(?:javascript|data|vbscript):[^"']*["']/gi,
      '$1="#"',
    );

    return sanitized;
  }

  public isSafeEmbedUrl(url: string, allowedHosts?: string[]): boolean {
    if (!url || typeof url !== 'string') return false;

    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return false;
      }

      const host = parsed.hostname.toLowerCase();
      if (allowedHosts && allowedHosts.length > 0) {
        return allowedHosts.some((h) => host === h || host.endsWith('.' + h));
      }

      return DEFAULT_ALLOWED_EMBED_HOSTS.has(host) || Array.from(DEFAULT_ALLOWED_EMBED_HOSTS).some((h) => host.endsWith('.' + h));
    } catch {
      return false;
    }
  }
}
