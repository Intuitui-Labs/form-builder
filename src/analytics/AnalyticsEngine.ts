import type { FieldDefinition, FormResponse } from '../schema/FormSchema.js';

export interface FieldAnalytics {
  fieldId: string;
  label: string;
  type: string;
  totalResponses: number;
  data: unknown; // Frequency counts, averages, or raw list
}

export const AnalyticsEngine = {
  /**
   * Aggregates raw responses into structured analytical data
   */
  aggregate(fields: FieldDefinition[], responses: FormResponse[]): FieldAnalytics[] {
    return fields.map((field) => {
      const fieldLabel = field.label ?? field.name ?? field.id;
      const values = responses
        .map((r) => r.data[field.name])
        .filter((v) => v !== undefined && v !== null);

      let aggregatedData: unknown = null;

      if (field.type === 'select') {
        const initialCounts: Record<string, number> = {};
        field.options?.forEach((opt) => {
          initialCounts[opt.value] = 0;
        });

        aggregatedData = values.reduce<Record<string, number>>((acc, val) => {
          const key = String(val);
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, initialCounts);
      } else if (field.type === 'number') {
        const numericValues = values.map(Number).filter((v) => !Number.isNaN(v));
        const sum = numericValues.reduce((a, b) => a + b, 0);
        aggregatedData = {
          average: numericValues.length > 0 ? sum / numericValues.length : 0,
          min: Math.min(...numericValues),
          max: Math.max(...numericValues),
          count: numericValues.length,
        };
      } else {
        // For text/email etc, just return the last 10 unique entries
        aggregatedData = Array.from(new Set(values)).slice(-10);
      }

      return {
        fieldId: field.id,
        label: fieldLabel,
        type: field.type,
        totalResponses: values.length,
        data: aggregatedData,
      };
    });
  },

  /**
   * Sanitizes values against CSV Formula Injection (OWASP mitigation)
   */
  sanitizeCSVValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    let str = String(value);

    // Prepend single-quote to prevent spreadsheet formula execution if starting with trigger characters
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }

    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  },

  /**
   * Escapes XML special characters for SpreadsheetML
   */
  escapeXML(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  },

  /**
   * Converts form responses to a CSV string
   */
  toCSV(fields: FieldDefinition[], responses: FormResponse[]): string {
    if (responses.length === 0) return '';

    const headers = ['Submitted At', ...fields.map((f) => f.label ?? f.name ?? f.id)];
    const sanitizedHeaders = headers.map((h) => this.sanitizeCSVValue(h));

    const rows = responses.map((r) => {
      const row = [
        this.sanitizeCSVValue(new Date(r.submittedAt).toLocaleString()),
        ...fields.map((f) => this.sanitizeCSVValue(r.data[f.name])),
      ];
      return row.join(',');
    });

    return [sanitizedHeaders.join(','), ...rows].join('\n');
  },

  /**
   * Converts form responses to an Excel-compatible XML (SpreadsheetML) string
   */
  toXLSX(fields: FieldDefinition[], responses: FormResponse[]): string {
    const headers = ['Submitted At', ...fields.map((f) => f.label ?? f.name ?? f.id)];
    const rows = responses.map((r) => {
      return [new Date(r.submittedAt).toLocaleString(), ...fields.map((f) => r.data[f.name] ?? '')];
    });

    const xmlHeader = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="Form Responses">
  <Table>`;

    const xmlFooter = `  </Table>
 </Worksheet>
 </Workbook>`;

    const headerRow = `   <Row ss:StyleID="Header">
${headers.map((h) => `    <Cell><Data ss:Type="String">${this.escapeXML(h)}</Data></Cell>`).join('\n')}
   </Row>`;

    const dataRows = rows
      .map((row) => {
        return `   <Row>
${row
  .map((val) => {
    const isNum = typeof val === 'number';
    return `    <Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${isNum ? val : this.escapeXML(val)}</Data></Cell>`;
  })
  .join('\n')}
   </Row>`;
      })
      .join('\n');

    return `${xmlHeader}\n${headerRow}\n${dataRows}\n${xmlFooter}`;
  },
};
