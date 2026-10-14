import type { FieldDefinition, FormResponse } from '../schema/FormSchema.js';

export const SpreadsheetExporter = {
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
    const sanitizedHeaders = headers.map((h) => SpreadsheetExporter.sanitizeCSVValue(h));

    const rows = responses.map((r) => {
      const row = [
        SpreadsheetExporter.sanitizeCSVValue(new Date(r.submittedAt).toLocaleString()),
        ...fields.map((f) => SpreadsheetExporter.sanitizeCSVValue(r.data[f.name])),
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
${headers.map((h) => `    <Cell><Data ss:Type="String">${SpreadsheetExporter.escapeXML(h)}</Data></Cell>`).join('\n')}
   </Row>`;

    const dataRows = rows
      .map((row) => {
        return `   <Row>
${row
  .map((val) => {
    const isNum = typeof val === 'number';
    return `    <Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${isNum ? val : SpreadsheetExporter.escapeXML(val)}</Data></Cell>`;
  })
  .join('\n')}
   </Row>`;
      })
      .join('\n');

    return `${xmlHeader}\n${headerRow}\n${dataRows}\n${xmlFooter}`;
  },
};
