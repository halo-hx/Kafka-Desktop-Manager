/**
 * JSON 语法着色展示（递归渲染，字体使用 design token --font-heading）
 */
import React, { type ReactNode } from 'react';

function indentNewline(depth: number): string {
  return `\n${'  '.repeat(depth)}`;
}

function renderValue(v: unknown, depth: number): ReactNode {
  if (v === null) {
    return <span style={{ color: 'var(--color-info)' }}>null</span>;
  }
  if (typeof v === 'boolean') {
    return <span style={{ color: 'var(--color-info)' }}>{String(v)}</span>;
  }
  if (typeof v === 'number') {
    return <span style={{ color: 'var(--color-warning)' }}>{v}</span>;
  }
  if (typeof v === 'string') {
    return <span style={{ color: 'var(--color-primary)' }}>{JSON.stringify(v)}</span>;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    return (
      <>
        [{indentNewline(depth + 1)}
        {v.map((item, i) => (
          <React.Fragment key={i}>
            {renderValue(item, depth + 1)}
            {i < v.length - 1 ? ',' : ''}
            {i < v.length - 1 ? indentNewline(depth + 1) : ''}
          </React.Fragment>
        ))}
        {indentNewline(depth)}]
      </>
    );
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return (
      <>
        {'{'}
        {entries.map(([k, val], i) => (
          <React.Fragment key={k}>
            {indentNewline(depth + 1)}
            <span style={{ color: 'var(--color-text-muted)' }}>{JSON.stringify(k)}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>: </span>
            {renderValue(val, depth + 1)}
            {i < entries.length - 1 ? ',' : ''}
          </React.Fragment>
        ))}
        {indentNewline(depth)}
        {'}'}
      </>
    );
  }
  return String(v);
}

/** 尽量将 Schema Registry 返回的 schema 字符串格式化为可读 JSON */
export function formatSchemaForDisplay(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    try {
      const inner = JSON.parse(raw) as unknown;
      if (typeof inner === 'string') {
        return JSON.stringify(JSON.parse(inner), null, 2);
      }
    } catch {
      /* keep raw */
    }
  }
  return raw;
}

export function HighlightedJson({ text }: { text: string }): ReactNode {
  const trimmed = text.trim();
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return (
      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 12, lineHeight: 1.45 }}>
        {renderValue(parsed, 0)}
      </span>
    );
  } catch {
    return (
      <span
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 12,
          color: 'var(--color-text)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </span>
    );
  }
}
