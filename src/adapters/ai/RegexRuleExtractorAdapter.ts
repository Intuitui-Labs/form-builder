import type { FormField } from '../../schema/FormSchema.js';
import type { IEntityExtractorPort, ExtractionOptions, ExtractedEntity } from '../../ports/IEntityExtractorPort.js';
import { NameParser } from '../../affordance/NameParser.js';

/**
 * RegexRuleExtractorAdapter: Zero-dependency, offline deterministic entity extractor.
 * Scans freeform text blocks for emails, telephone numbers, postal codes, currencies,
 * companies, and candidate names using bounded, ReDoS-safe patterns.
 */
export class RegexRuleExtractorAdapter implements IEntityExtractorPort {
  readonly providerId = 'regex-rule-extractor';

  /**
   * Ergonomic helper to extract entities directly from a string with optional overrides.
   */
  public async extract(text: string, options?: Partial<ExtractionOptions>): Promise<ExtractedEntity[]> {
    return this.extractEntities({
      text,
      targetFields: options?.targetFields,
      ...options,
    });
  }

  public async extractEntities(options: ExtractionOptions): Promise<ExtractedEntity[]> {
    if (options.signal?.aborted) return [];

    const text = options.text || '';
    if (!text.trim()) return [];

    const results: ExtractedEntity[] = [];
    const defaultFields: FormField[] = [
      { id: 'email', name: 'email', label: 'Email', type: 'email', semanticIntent: 'contact-email', required: false, order: 0 },
      { id: 'phone', name: 'phone', label: 'Phone', type: 'text', semanticIntent: 'contact-phone', inputMode: 'tel', required: false, order: 1 },
      { id: 'amount', name: 'amount', label: 'Amount', type: 'number', required: false, order: 2 },
      { id: 'postalCode', name: 'postalCode', label: 'Postal Code', type: 'text', semanticIntent: 'address-postal-code', required: false, order: 3 },
      { id: 'organization', name: 'organization', label: 'Organization', type: 'text', semanticIntent: 'organization-name', required: false, order: 4 },
      { id: 'fullName', name: 'fullName', label: 'Full Name', type: 'text', semanticIntent: 'name-full', required: false, order: 5 },
      { id: 'firstName', name: 'firstName', label: 'First Name', type: 'text', semanticIntent: 'name-given', required: false, order: 6 },
      { id: 'lastName', name: 'lastName', label: 'Last Name', type: 'text', semanticIntent: 'name-family', required: false, order: 7 },
    ];
    const rawFields = (options.targetFields && options.targetFields.length > 0) ? options.targetFields : defaultFields;
    const fields: FormField[] = rawFields.map((f) =>
      typeof f === 'string'
        ? { id: f, name: f, label: f, type: 'text' as const, required: false, order: 0 }
        : f,
    );

    // 1. Extract Email
    const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
    if (emailMatch) {
      const emailField = fields.find(
        (f) =>
          f.semanticIntent === 'contact-email' ||
          f.type === 'email' ||
          f.name.toLowerCase().includes('email'),
      );
      if (emailField) {
        results.push({
          field: emailField.name,
          value: emailMatch[0],
          confidence: 0.99,
          sourceSnippet: emailMatch[0],
          origin: this.providerId,
        });
      }
    }

    // 2. Extract Phone Number
    // Bounded pattern for international and standard phone representations
    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/);
    if (phoneMatch && phoneMatch[0].replace(/\D/g, '').length >= 7) {
      const phoneField = fields.find(
        (f) =>
          f.semanticIntent === 'contact-phone' ||
          f.inputMode === 'tel' ||
          f.name.toLowerCase().includes('phone') ||
          f.name.toLowerCase().includes('mobile') ||
          f.name.toLowerCase().includes('tel'),
      );
      if (phoneField) {
        results.push({
          field: phoneField.name,
          value: phoneMatch[0].trim(),
          confidence: 0.95,
          sourceSnippet: phoneMatch[0],
          origin: this.providerId,
        });
      }
    }

    // 3. Extract Monetary / Numeric Amounts
    // Matches e.g. $50,000, €12,500, Rs. 150000, 50k
    const moneyMatch = text.match(/(?:\$|€|£|Rs\.?|USD|EUR|GBP|LKR)\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i);
    if (moneyMatch && moneyMatch[1]) {
      const rawNum = moneyMatch[1].replace(/,/g, '');
      const parsedNum = parseFloat(rawNum);
      if (!Number.isNaN(parsedNum)) {
        const moneyField = fields.find(
          (f) =>
            f.type === 'number' ||
            f.name.toLowerCase().includes('income') ||
            f.name.toLowerCase().includes('salary') ||
            f.name.toLowerCase().includes('amount') ||
            f.name.toLowerCase().includes('revenue') ||
            f.name.toLowerCase().includes('debt'),
        );
        if (moneyField) {
          results.push({
            field: moneyField.name,
            value: moneyField.type === 'number' ? parsedNum : moneyMatch[0].trim(),
            confidence: 0.92,
            sourceSnippet: moneyMatch[0],
            origin: this.providerId,
          });
        }
      }
    }

    // 4. Extract Postal / Zip Code
    const postalMatch = text.match(/\b\d{5}(?:-\d{4})?\b/);
    if (postalMatch) {
      const postalField = fields.find(
        (f) =>
          f.semanticIntent === 'address-postal-code' ||
          f.name.toLowerCase().includes('postal') ||
          f.name.toLowerCase().includes('zip'),
      );
      if (postalField) {
        results.push({
          field: postalField.name,
          value: postalMatch[0],
          confidence: 0.9,
          sourceSnippet: postalMatch[0],
          origin: this.providerId,
        });
      }
    }

    // 5. Extract Company / Organization
    const companyMatch = text.match(/(?:at|from|company|organization)\s+([A-Z][A-Za-z0-9&.,\s]{2,25})/);
    if (companyMatch && companyMatch[1]) {
      const orgField = fields.find(
        (f) =>
          f.semanticIntent === 'organization-name' ||
          f.name.toLowerCase().includes('company') ||
          f.name.toLowerCase().includes('organization') ||
          f.name.toLowerCase().includes('employer'),
      );
      if (orgField) {
        results.push({
          field: orgField.name,
          value: companyMatch[1].trim(),
          confidence: 0.85,
          sourceSnippet: companyMatch[0],
          origin: this.providerId,
        });
      }
    }

    // 6. Extract Full Name / Decomposed Name
    // Look for phrases like "I am [Name]", "I'm [Name]", "Name: [Name]" or leading capital name
    const introMatch = text.match(/(?:I am|I'm|Name:\s*|Sincerely,\s*|Regards,\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
    const candidateName = introMatch ? introMatch[1].trim() : undefined;

    if (candidateName) {
      const parsed = NameParser.parse(candidateName);

      const fullNameField = fields.find(
        (f) => f.semanticIntent === 'name-full' || f.name.toLowerCase() === 'name' || f.name.toLowerCase().includes('fullname'),
      );
      if (fullNameField) {
        results.push({
          field: fullNameField.name,
          value: candidateName,
          confidence: 0.88,
          sourceSnippet: candidateName,
          origin: this.providerId,
        });
      }

      const firstNameField = fields.find(
        (f) => f.semanticIntent === 'name-given' || f.name.toLowerCase().includes('first'),
      );
      if (firstNameField && parsed.firstName) {
        results.push({
          field: firstNameField.name,
          value: parsed.firstName,
          confidence: 0.88,
          sourceSnippet: candidateName,
          origin: this.providerId,
        });
      }

      const lastNameField = fields.find(
        (f) => f.semanticIntent === 'name-family' || f.name.toLowerCase().includes('last'),
      );
      if (lastNameField && parsed.lastName) {
        results.push({
          field: lastNameField.name,
          value: parsed.lastName,
          confidence: 0.88,
          sourceSnippet: candidateName,
          origin: this.providerId,
        });
      }
    }

    if (options.minConfidence !== undefined) {
      return results.filter((r) => r.confidence >= options.minConfidence!);
    }

    return results;
  }
}
