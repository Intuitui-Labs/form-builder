/**
 * Outbound Port: Sanitization contract for URLs, rich text, and multimedia embeds
 */

export interface ISanitizerPort {
  /**
   * Sanitizes URLs, allowing only safe schemes (http, https, mailto, tel)
   * Rejects javascript:, data:text/html, and dangerous URI exploits.
   */
  sanitizeUrl(url: string): string;

  /**
   * Sanitizes rich text content or Markdown snippets.
   * Strips script tags, unsafe iframe embeds, and inline HTML event handlers.
   */
  sanitizeRichText(markdownOrHtml: string): string;

  /**
   * Checks if an embed URL belongs to an allowed host (e.g. YouTube, Vimeo, Loom)
   */
  isSafeEmbedUrl(url: string, allowedHosts?: string[]): boolean;
}
