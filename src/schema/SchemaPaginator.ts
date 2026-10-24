import type { FormField, FormPage } from './FormSchema.js';

export interface PaginatorOptions {
  /** Maximum number of fields per page. Default: 5 */
  maxFieldsPerPage?: number;
  /** Grouping key function, e.g. (f) => f.group or (f) => f.sectionTitle */
  groupBy?: (field: FormField) => string | undefined;
  /** Optional cover/welcome page configuration */
  coverPage?: {
    id?: string;
    title: string;
    description?: string;
    badge?: string;
  };
}

/**
 * Paginates a flat collection of FormFields into balanced multi-step FormPages.
 * Supports semantic section grouping and automatic chunking for cognitive ergonomics.
 */
export class SchemaPaginator {
  static paginateFields(fields: FormField[], options?: PaginatorOptions): FormPage[] {
    const maxPerPage = Math.max(1, options?.maxFieldsPerPage ?? 5);
    const pages: FormPage[] = [];

    if (options?.coverPage) {
      pages.push({
        id: options.coverPage.id ?? 'welcome',
        title: options.coverPage.title,
        role: 'cover',
        description: options.coverPage.description,
        badge: options.coverPage.badge,
        fields: [],
      });
    }

    if (options?.groupBy) {
      const groups = new Map<string, FormField[]>();
      for (const field of fields) {
        const key = options.groupBy(field) || 'General';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(field);
      }

      let sectionIdx = 1;
      for (const [sectionName, groupFields] of groups.entries()) {
        if (groupFields.length > maxPerPage) {
          const totalChunks = Math.ceil(groupFields.length / maxPerPage);
          for (let i = 0; i < groupFields.length; i += maxPerPage) {
            const chunk = groupFields.slice(i, i + maxPerPage);
            const chunkNum = Math.floor(i / maxPerPage) + 1;
            pages.push({
              id: `section-${sectionIdx}-part-${chunkNum}`,
              title: `${sectionName} (${chunkNum}/${totalChunks})`,
              badge: `SECTION ${sectionIdx}`,
              fields: chunk,
            });
          }
        } else {
          pages.push({
            id: `section-${sectionIdx}`,
            title: sectionName,
            badge: `SECTION ${sectionIdx}`,
            fields: groupFields,
          });
        }
        sectionIdx++;
      }
    } else {
      const pageCount = Math.ceil(Math.max(1, fields.length) / maxPerPage);
      for (let p = 0; p < pageCount; p++) {
        const chunk = fields.slice(p * maxPerPage, (p + 1) * maxPerPage);
        pages.push({
          id: `step-${p + 1}`,
          title: pageCount > 1 ? `Step ${p + 1} of ${pageCount}` : 'Form',
          badge: pageCount > 1 ? `PART ${p + 1}` : undefined,
          fields: chunk,
        });
      }
    }

    return pages;
  }
}
