import { describe, it, expect, vi } from 'vitest';
import { FormManager } from '../src/manager/FormManager.js';
import { RegexRuleExtractorAdapter } from '../src/adapters/ai/RegexRuleExtractorAdapter.js';
import { CallbackLLMExtractorAdapter } from '../src/adapters/ai/CallbackLLMExtractorAdapter.js';
import { CompositeEntityExtractorAdapter } from '../src/adapters/ai/CompositeEntityExtractorAdapter.js';
import type { IEntityExtractorPort, ExtractedEntity } from '../src/ports/IEntityExtractorPort.js';

describe('Ghost Form & Freeform Entity Ingestion', () => {
  describe('RegexRuleExtractorAdapter (0 kB Offline Heuristics)', () => {
    const extractor = new RegexRuleExtractorAdapter();

    it('extracts emails, phones, postal codes, and currencies from unstructured text', async () => {
      const bioText = `
        Hi there, my name is Bruce Wayne.
        You can reach me at bruce.wayne@waynecorp.com or call +1 (555) 019-2834.
        Our headquarters are in Gotham City, postal code 90210.
        We have allocated a budget of $2,500,000 for this enterprise initiative.
        Best regards from Wayne Enterprises Inc.
      `;

      const entities = await extractor.extract(bioText);
      expect(entities.length).toBeGreaterThanOrEqual(4);

      const email = entities.find((e) => e.field === 'email');
      expect(email).toBeDefined();
      expect(email?.value).toBe('bruce.wayne@waynecorp.com');
      expect(email?.confidence).toBeGreaterThanOrEqual(0.9);

      const phone = entities.find((e) => e.field === 'phone');
      expect(phone).toBeDefined();
      expect(phone?.value).toContain('555');

      const postal = entities.find((e) => e.field === 'postalCode');
      expect(postal).toBeDefined();
      expect(postal?.value).toBe('90210');

      const amount = entities.find((e) => e.field === 'amount');
      expect(amount).toBeDefined();
      expect(amount?.value).toBe(2500000);

      const org = entities.find((e) => e.field === 'organization');
      expect(org).toBeDefined();
      expect(org?.value).toContain('Wayne Enterprises');
    });

    it('honors minConfidence filtering and targetFields constraints', async () => {
      const text = 'Contact support@domain.co.uk or dial 0771234567, postal 10001.';

      // Filter by confidence
      const highConfidenceOnly = await extractor.extract(text, { minConfidence: 0.95 });
      expect(highConfidenceOnly.every((e) => e.confidence >= 0.95)).toBe(true);

      // Filter by target fields
      const emailOnly = await extractor.extract(text, { targetFields: ['email'] });
      expect(emailOnly).toHaveLength(1);
      expect(emailOnly[0].field).toBe('email');
      expect(emailOnly[0].value).toBe('support@domain.co.uk');
    });

    it('gracefully handles empty, non-string, or garbage inputs without throwing', async () => {
      expect(await extractor.extract('')).toEqual([]);
      expect(await extractor.extract('   ')).toEqual([]);
      expect(await extractor.extract('!@#$%^&*()_+{}:"<>?')).toEqual([]);
    });
  });

  describe('CallbackLLMExtractorAdapter (Hostile LLM Defenses)', () => {
    it('parses valid structured LLM responses into ExtractedEntity records', async () => {
      const mockLLM = vi.fn().mockResolvedValue(
        JSON.stringify([
          { field: 'fullName', value: 'Arthur Dent', confidence: 0.98, snippet: 'Arthur Dent' },
          { field: 'occupation', value: 'Sandwich Maker', confidence: 0.85, snippet: 'Sandwich Maker' },
        ]),
      );

      const adapter = new CallbackLLMExtractorAdapter(mockLLM);
      const results = await adapter.extract('My name is Arthur Dent and I am a Sandwich Maker.');

      expect(results).toHaveLength(2);
      expect(results[0].field).toBe('fullName');
      expect(results[0].value).toBe('Arthur Dent');
      expect(results[1].field).toBe('occupation');
    });

    it('defends against malformed JSON or markdown code block fences returned by LLMs', async () => {
      const markdownWrapped = '```json\n[{"field":"city","value":"London","confidence":0.9}]\n```';
      const adapter = new CallbackLLMExtractorAdapter(async () => markdownWrapped);

      const results = await adapter.extract('I live in London');
      expect(results).toHaveLength(1);
      expect(results[0].field).toBe('city');
      expect(results[0].value).toBe('London');
    });

    it('isolates prototype pollution injection attempts in untrusted LLM outputs', async () => {
      const hostilePayload = JSON.stringify([
        { field: '__proto__', value: { polluted: true }, confidence: 1.0 },
        { field: 'constructor', value: 'malicious', confidence: 1.0 },
        { field: 'validField', value: 'safeValue', confidence: 0.9 },
      ]);

      const adapter = new CallbackLLMExtractorAdapter(async () => hostilePayload);
      const results = await adapter.extract('Test hostile injection');

      // Unsafe keys __proto__ and constructor must be omitted
      expect(results.some((r) => r.field === '__proto__')).toBe(false);
      expect(results.some((r) => r.field === 'constructor')).toBe(false);
      expect(results.some((r) => r.field === 'validField')).toBe(true);
      expect((Object.prototype as any).polluted).toBeUndefined();
    });

    it('gracefully handles LLM timeouts or network crashes without crashing caller', async () => {
      const failingAdapter = new CallbackLLMExtractorAdapter(
        async () => {
          throw new Error('503 Service Unavailable');
        },
        { timeoutMs: 50 },
      );

      const results = await failingAdapter.extract('Some text');
      expect(results).toEqual([]);
    });
  });

  describe('CompositeEntityExtractorAdapter', () => {
    it('chains multiple extractors, deduplicates keys, and preserves highest confidence entity', async () => {
      const lowConfidenceExtractor: IEntityExtractorPort = {
        providerId: 'heuristic-low',
        extractEntities: async () => [
          { field: 'company', value: 'SmallCo', confidence: 0.5, sourceSnippet: 'SmallCo' },
          { field: 'role', value: 'Engineer', confidence: 0.7, sourceSnippet: 'Engineer' },
        ],
      };

      const highConfidenceExtractor: IEntityExtractorPort = {
        providerId: 'model-high',
        extractEntities: async () => [
          { field: 'company', value: 'MegaCorp', confidence: 0.95, sourceSnippet: 'MegaCorp' },
        ],
      };

      const composite = new CompositeEntityExtractorAdapter([
        lowConfidenceExtractor,
        highConfidenceExtractor,
      ]);

      const results = await composite.extract('Text about MegaCorp');
      expect(results).toHaveLength(2);

      const company = results.find((r) => r.field === 'company');
      expect(company?.value).toBe('MegaCorp');
      expect(company?.confidence).toBe(0.95);

      const role = results.find((r) => r.field === 'role');
      expect(role?.value).toBe('Engineer');
    });

    it('survives individual extractor failures in the chain', async () => {
      const brokenExtractor: IEntityExtractorPort = {
        providerId: 'broken',
        extractEntities: async () => {
          throw new Error('Fatal engine crash');
        },
      };

      const healthyExtractor: IEntityExtractorPort = {
        providerId: 'healthy',
        extractEntities: async () => [{ field: 'status', value: 'active', confidence: 1.0, sourceSnippet: 'active' }],
      };

      const composite = new CompositeEntityExtractorAdapter([brokenExtractor, healthyExtractor]);
      const results = await composite.extract('Status is active');

      expect(results).toHaveLength(1);
      expect(results[0].field).toBe('status');
      expect(results[0].value).toBe('active');
    });
  });

  describe('FormManager.enrichFromFreeformText Integration', () => {
    it('autofills matching schema fields and provides atomic rollback capability', async () => {
      const extractor = new RegexRuleExtractorAdapter();

      const manager = new FormManager<{
        fullName: string;
        email: string;
        postalCode: string;
        phone: string;
      }>({
        fields: {
          fullName: { type: 'text', label: 'Full Name' },
          email: { type: 'text', label: 'Email Address' },
          postalCode: { type: 'text', label: 'Postal Code' },
          phone: { type: 'text', label: 'Telephone' },
        },
        entityExtractor: extractor,
        onSubmit: vi.fn(),
      });

      // Initially set an email
      manager.setFieldValue('email', 'original@intuitui.org');

      // Ingest freeform note with overwritePolicy: 'if-empty' (should preserve email)
      const enrichResult = await manager.enrichFromFreeformText(
        'Call me at 0771234567, postal code 94043, email new@domain.com',
        { overwritePolicy: 'if-empty' },
      );

      expect(enrichResult.appliedCount).toBe(2); // phone and postalCode
      expect(manager.getFieldValue('email')).toBe('original@intuitui.org'); // preserved
      expect(manager.getFieldValue('postalCode')).toBe('94043');
      expect(manager.getFieldValue('phone')).toBe('0771234567');

      // Atomic undo / rollback
      expect(typeof enrichResult.rollback).toBe('function');
      enrichResult.rollback();

      // Should be rolled back
      expect(manager.getFieldValue('postalCode')).toBe('');
      expect(manager.getFieldValue('phone')).toBe('');
      expect(manager.getFieldValue('email')).toBe('original@intuitui.org');
    });

    it('overwrites fields when overwritePolicy: always is specified', async () => {
      const extractor = new RegexRuleExtractorAdapter();

      const manager = new FormManager<{
        email: string;
        postalCode: string;
      }>({
        fields: {
          email: { type: 'text', label: 'Email' },
          postalCode: { type: 'text', label: 'Postal' },
        },
        entityExtractor: extractor,
        onSubmit: vi.fn(),
      });

      manager.setFieldValue('email', 'old@domain.com');

      const enrichResult = await manager.enrichFromFreeformText(
        'Please update my contact to fresh@domain.com postal 12345',
        { overwritePolicy: 'always' },
      );

      expect(enrichResult.appliedCount).toBe(2);
      expect(manager.getFieldValue('email')).toBe('fresh@domain.com');
      expect(manager.getFieldValue('postalCode')).toBe('12345');
    });
  });
});
