import type { KafkaMessage } from '../types';
import { snakeToCamel } from './tauri';
import { getT } from '../i18n';

export function normalizeKafkaMessage(row: unknown): KafkaMessage {
  const m = snakeToCamel(row) as Partial<KafkaMessage> & {
    headers?: Record<string, string> | unknown;
  };
  let headers: Record<string, string> = {};
  if (m.headers && typeof m.headers === 'object' && !Array.isArray(m.headers)) {
    headers = m.headers as Record<string, string>;
  }
  return {
    partition: Number(m.partition ?? 0),
    offset: Number(m.offset ?? 0),
    timestamp: String(m.timestamp ?? ''),
    key: String(m.key ?? ''),
    value: String(m.value ?? ''),
    headers,
    size: Number(m.size ?? 0),
  };
}

export function csvEscape(s: string): string {
  const needs = /[,"\n\r]/.test(s);
  if (!needs) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function messagesToExportText(
  rows: KafkaMessage[],
  format: 'jsonl' | 'csv',
  includeKey: boolean,
  includeValue: boolean,
  includeHeaders: boolean,
): string {
  if (format === 'jsonl') {
    const lines: string[] = [];
    for (const m of rows) {
      const o: Record<string, unknown> = {
        partition: m.partition,
        offset: m.offset,
        timestamp: m.timestamp,
      };
      if (includeKey) o.key = m.key;
      if (includeValue) o.value = m.value;
      if (includeHeaders) o.headers = m.headers;
      lines.push(JSON.stringify(o));
    }
    return `${lines.join('\n')}\n`;
  }

  const cols: string[] = ['partition', 'offset', 'timestamp'];
  if (includeKey) cols.push('key');
  if (includeValue) cols.push('value');
  if (includeHeaders) cols.push('headers');
  const head = cols.join(',');
  const body = rows.map((m) =>
    cols
      .map((c) => {
        if (c === 'headers') return csvEscape(JSON.stringify(m.headers));
        const v =
          c === 'key'
            ? m.key
            : c === 'value'
              ? m.value
              : String((m as unknown as Record<string, unknown>)[c] ?? '');
        return csvEscape(v);
      })
      .join(','),
  );
  return `${head}\n${body.join('\n')}\n`;
}

export interface ParsedImportRecord {
  partition: number | null;
  key: string;
  value: string;
  headers: Record<string, string>;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else cur += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseImportFilePreview(
  text: string,
  format: 'jsonl' | 'csv',
): { records: ParsedImportRecord[]; error?: string } {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(Boolean);
  if (!lines.length) return { records: [], error: getT()('importError.fileEmpty') };

  if (format === 'jsonl') {
    const records: ParsedImportRecord[] = [];
    for (const line of lines) {
      try {
        const o = JSON.parse(line) as Record<string, unknown>;
        const headers =
          o.headers && typeof o.headers === 'object' && !Array.isArray(o.headers)
            ? (o.headers as Record<string, string>)
            : {};
        const p = o.partition;
        records.push({
          partition: typeof p === 'number' && Number.isFinite(p) ? p : null,
          key: String(o.key ?? ''),
          value: String(o.value ?? ''),
          headers,
        });
      } catch {
        return { records: [], error: getT()('importError.jsonlParseFailed') };
      }
    }
    return { records };
  }

  const headerCells = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => headerCells.indexOf(name);
  const pi = idx('partition');
  const ki = idx('key');
  const vi = idx('value');
  const hi = idx('headers');
  if (vi < 0) return { records: [], error: getT()('importError.csvMissingValue') };

  const records: ParsedImportRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    let headers: Record<string, string> = {};
    if (hi >= 0 && cells[hi]) {
      try {
        const parsed = JSON.parse(cells[hi]) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          headers = Object.fromEntries(
            Object.entries(parsed as Record<string, string>).map(([k, v]) => [k, String(v ?? '')]),
          );
        }
      } catch {
        headers = {};
      }
    }
    const pRaw = pi >= 0 ? Number(cells[pi]) : NaN;
    records.push({
      partition: Number.isFinite(pRaw) ? pRaw : null,
      key: ki >= 0 ? cells[ki] ?? '' : '',
      value: cells[vi] ?? '',
      headers,
    });
  }
  return { records };
}
