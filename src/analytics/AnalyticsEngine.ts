import type { FieldDefinition, FormResponse } from '@intuitui-labs/form-builder-engine/schema/FormSchema';

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
   * Converts form responses to a CSV string
   */
  toCSV(fields: FieldDefinition[], responses: FormResponse[]): string {
    if (responses.length === 0) return '';

    const headers = ['Submitted At', ...fields.map((f) => f.label ?? f.name ?? f.id)];
    const rows = responses.map((r) => {
      const row = [
        new Date(r.submittedAt).toLocaleString(),
        ...fields.map((f) => {
          const val = r.data[f.name];
          // Handle commas and quotes for CSV safety
          if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val ?? '';
        }),
      ];
      return row.join(',');
    });

    return [headers.join(','), ...rows].join('\n');
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
${headers.map((h) => `    <Cell><Data ss:Type="String">${h}</Data></Cell>`).join('\n')}
   </Row>`;

    const dataRows = rows
      .map((row) => {
        return `   <Row>
${row.map((val) => `    <Cell><Data ss:Type="${typeof val === 'number' ? 'Number' : 'String'}">${val}</Data></Cell>`).join('\n')}
   </Row>`;
      })
      .join('\n');

    return `${xmlHeader}\n${headerRow}\n${dataRows}\n${xmlFooter}`;
  },
};
