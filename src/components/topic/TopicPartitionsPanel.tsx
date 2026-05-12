/**
 * Topic 分区列表
 */
import { AlertTriangle, OctagonAlert } from 'lucide-react';
import { useT, type TranslationKey } from '../../i18n';

export interface PartitionRow {
  partition: number;
  leader: number;
  replicas: number;
  isr: number;
  startOffset: string;
  endOffset: string;
  messageCount: string;
  size: string;
}

const PLACEHOLDER: PartitionRow[] = [
  {
    partition: 0,
    leader: 1,
    replicas: 3,
    isr: 3,
    startOffset: '0',
    endOffset: '1284092',
    messageCount: '1,284,092',
    size: '412 MB',
  },
  {
    partition: 1,
    leader: 2,
    replicas: 3,
    isr: 2,
    startOffset: '0',
    endOffset: '990001',
    messageCount: '990,001',
    size: '305 MB',
  },
  {
    partition: 2,
    leader: -1,
    replicas: 3,
    isr: 3,
    startOffset: '0',
    endOffset: '0',
    messageCount: '0',
    size: '0 B',
  },
];

export function TopicPartitionsPanel({ topicName }: { clusterId: string; topicName: string }) {
  const t = useT();
  const rows = PLACEHOLDER;

  const columns: { key: TranslationKey; align: 'center' | 'right' }[] = [
    { key: 'partitions.partition', align: 'center' as const },
    { key: 'partitions.leader', align: 'center' as const },
    { key: 'partitions.replicas', align: 'center' as const },
    { key: 'partitions.isr', align: 'right' as const },
    { key: 'partitions.startOffset', align: 'center' as const },
    { key: 'partitions.endOffset', align: 'center' as const },
    { key: 'partitions.messageCount', align: 'right' as const },
    { key: 'partitions.size', align: 'right' as const },
  ];

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: 'var(--space-6)',
        fontFamily: 'var(--font-body)',
        background: 'var(--color-bg)',
      }}
    >
      <header style={{ marginBottom: 'var(--space-5)' }}>
        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--color-text)',
            marginBottom: 4,
          }}
        >
          {topicName}
        </h1>
        <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>{t('partitions.sampleDataNote')}</p>
      </header>

      <div
        style={{
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          overflow: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--color-surface)', position: 'sticky', top: 0, zIndex: 1 }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    padding: '8px 12px',
                    textAlign: col.align,
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--color-text-faint)',
                    borderBottom: '1px solid var(--color-border-subtle)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isrLtRep = r.isr < r.replicas;
              const noLeader = r.leader === -1;
              let bg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)';
              if (noLeader) bg = 'rgba(239, 68, 68, 0.12)';
              else if (isrLtRep) bg = 'rgba(245, 158, 11, 0.1)';

              return (
                <tr
                  key={r.partition}
                  style={{
                    background: bg,
                    transition: 'background var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = noLeader
                      ? 'rgba(239, 68, 68, 0.18)'
                      : isrLtRep
                        ? 'rgba(245, 158, 11, 0.16)'
                        : 'var(--color-surface-2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = bg;
                  }}
                >
                  <td
                    style={{
                      padding: '9px 12px',
                      textAlign: 'center',
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 600,
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {r.partition}
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      textAlign: 'center',
                      fontFamily: 'var(--font-heading)',
                      color: noLeader ? 'var(--color-error)' : 'var(--color-text)',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      {noLeader && <OctagonAlert size={15} strokeWidth={2} color="var(--color-error)" aria-hidden />}
                      {r.leader}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      textAlign: 'center',
                      fontFamily: 'var(--font-heading)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {r.replicas}
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-heading)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      {isrLtRep && !noLeader && (
                        <AlertTriangle size={15} strokeWidth={2} color="var(--color-warning)" aria-hidden />
                      )}
                      {r.isr}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      textAlign: 'center',
                      fontFamily: 'var(--font-heading)',
                      fontSize: 12,
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {r.startOffset}
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      textAlign: 'center',
                      fontFamily: 'var(--font-heading)',
                      fontSize: 12,
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {r.endOffset}
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-heading)',
                      fontSize: 12,
                      color: 'var(--color-text)',
                    }}
                  >
                    {r.messageCount}
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      textAlign: 'right',
                      fontSize: 12,
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {r.size}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
