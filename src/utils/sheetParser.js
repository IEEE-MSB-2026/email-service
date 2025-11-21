const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const { fetch } = require('undici');

// Infer format from filename extension
function detectFormat(filename = '') {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.tsv')) return 'tsv';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
  return 'csv'; // default
}

function parseBuffer(buffer, format) {
  if (format === 'xlsx') {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = wb.SheetNames[0];
    const sheet = wb.Sheets[firstSheet];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
    return json;
  }
  // CSV/TSV
  const delimiter = format === 'tsv' ? '\t' : ',';
  const text = buffer.toString('utf8');
  const records = parse(text, { delimiter, relax_column_count: true });
  return records;
}

function sanitizeMatrix(matrix) {
  // Remove empty trailing rows
  return matrix.filter(row => Array.isArray(row) && row.some(cell => String(cell).trim().length));
}

function normalizeHeaders(rawHeaders) {
  return rawHeaders.map(h => String(h).trim());
}

function sliceRows(matrix) {
  if (!matrix.length) return { headers: [], rows: [] };
  const headers = normalizeHeaders(matrix[0]);
  const rows = matrix.slice(1).map(r => r.map(c => (c === null || c === undefined ? '' : String(c))));
  return { headers, rows };
}

async function parseSheetFromFile(file) {
  if (!file) throw new Error('file required');
  const format = detectFormat(file.originalname || '');
  const matrix = parseBuffer(file.buffer, format);
  const cleaned = sanitizeMatrix(matrix);
  return sliceRows(cleaned);
}

async function parseSheetFromUrl(url) {
  if (!url) throw new Error('sheetUrl required');
  const lower = url.toLowerCase();
  const format = detectFormat(lower);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`);
  const arrayBuffer = await resp.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const matrix = parseBuffer(buffer, format);
  const cleaned = sanitizeMatrix(matrix);
  return sliceRows(cleaned);
}

module.exports = { parseSheetFromFile, parseSheetFromUrl };