import type { IEntityExtractorPort, ExtractionOptions, ExtractedEntity } from '../../ports/IEntityExtractorPort.js';

/**
 * CompositeEntityExtractorAdapter: Chains multiple extraction providers (e.g. offline Regex fast-path
 * followed by remote LLM fallback), merging results with highest confidence score per field.
 * Failsafe: if one provider throws, remaining providers still succeed.
 */
export class CompositeEntityExtractorAdapter implements IEntityExtractorPort {
  readonly providerId = 'composite-entity-extractor';
  private providers: IEntityExtractorPort[];

  constructor(providers: IEntityExtractorPort[]) {
    this.providers = providers;
  }

  public async extract(text: string, options?: Partial<ExtractionOptions>): Promise<ExtractedEntity[]> {
    return this.extractEntities({
      text,
      targetFields: options?.targetFields,
      ...options,
    });
  }

  public async extractEntities(options: ExtractionOptions): Promise<ExtractedEntity[]> {
    if (options.signal?.aborted) return [];

    const fieldMap = new Map<string, ExtractedEntity>();

    for (const provider of this.providers) {
      if (options.signal?.aborted) break;

      try {
        const entities = await provider.extractEntities(options);
        for (const entity of entities) {
          const existing = fieldMap.get(entity.field);
          if (!existing || entity.confidence > existing.confidence) {
            fieldMap.set(entity.field, entity);
          }
        }
      } catch {
        // Continue to next provider; hostile failure in one provider never terminates the pipeline
      }
    }

    let results = Array.from(fieldMap.values());
    if (options.minConfidence !== undefined) {
      results = results.filter((r) => r.confidence >= options.minConfidence!);
    }

    return results;
  }
}
