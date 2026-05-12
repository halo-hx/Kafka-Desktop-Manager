/**
 * ClusterDashboard — 集群主面板
 * 连接后右侧显示，内含模块导航：概览 / Topics / 消费组 / Schema / Connect / ACL
 */
import { useMemo } from 'react';
import {
  BookOpen,
  Database,
  Link2,
  Network,
  Server,
  Shield,
  Users,
} from 'lucide-react';
import { ClusterOverview } from './ClusterOverview';
import { TopicListSubPanel } from './TopicListSubPanel';
import { ConsumerGroupListPanel } from '../consumer/ConsumerGroupListPanel';
import { SchemaListPanel } from '../schema/SchemaListPanel';
import { ConnectorListPanel } from '../connect/ConnectorListPanel';
import { AclListPanel } from '../acl/AclListPanel';
import { useConnectionStore } from '../../stores/connectionStore';
import { useUIStore } from '../../stores/uiStore';
import { useT } from '../../i18n';

type DashboardModule = 'overview' | 'topics' | 'consumers' | 'schema' | 'connect' | 'acl';

const VALID_MODULES: DashboardModule[] = ['overview', 'topics', 'consumers', 'schema', 'connect', 'acl'];

function isDashboardModule(v: string | undefined): v is DashboardModule {
  return !!v && (VALID_MODULES as string[]).includes(v);
}

interface ModuleDef {
  id: DashboardModule;
  label: string;
  icon: React.ReactNode;
}

interface Props {
  clusterId: string;
}

export function ClusterDashboard({ clusterId }: Props) {
  const t = useT();
  const persisted = useUIStore((s) => s.clusterDashboardModules[clusterId]);
  const setPersisted = useUIStore((s) => s.setClusterDashboardModule);
  const activeModule: DashboardModule = isDashboardModule(persisted) ? persisted : 'overview';
  const setActiveModule = (m: DashboardModule) => setPersisted(clusterId, m);
  const conn = useConnectionStore((s) => s.getConnection(clusterId));
  const clusterName = conn?.name || t('common.cluster');

  const modules = useMemo<ModuleDef[]>(
    () => [
      { id: 'overview', label: t('dashboard.overview'), icon: <Database size={16} strokeWidth={2} /> },
      { id: 'topics', label: t('dashboard.topics'), icon: <Network size={16} strokeWidth={2} /> },
      { id: 'consumers', label: t('dashboard.consumers'), icon: <Users size={16} strokeWidth={2} /> },
      { id: 'schema', label: t('dashboard.schema'), icon: <BookOpen size={16} strokeWidth={2} /> },
      { id: 'connect', label: t('dashboard.connect'), icon: <Link2 size={16} strokeWidth={2} /> },
      { id: 'acl', label: t('dashboard.acl'), icon: <Shield size={16} strokeWidth={2} /> },
    ],
    [t],
  );

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Module navigation sidebar */}
      <nav
        aria-label={t('dashboard.clusterNav')}
        style={{
          width: 180,
          minWidth: 180,
          borderRight: '1px solid var(--color-border-subtle)',
          background: 'var(--color-surface)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 14px 12px',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Server size={16} strokeWidth={2} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <span
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--color-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={clusterName}
            >
              {clusterName}
            </span>
          </div>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 4,
              fontSize: 11,
              color: 'var(--color-primary)',
              fontFamily: 'var(--font-body)',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--color-connected)',
                boxShadow: '0 0 6px var(--color-connected)',
              }}
            />
            {t('dashboard.connected')}
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
          {modules.map((mod) => {
            const isActive = activeModule === mod.id;
            return (
              <button
                key={mod.id}
                type="button"
                aria-label={mod.label}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setActiveModule(mod.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '9px 12px',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  background: isActive ? 'var(--color-primary-muted)' : 'transparent',
                  transition: 'background var(--transition-fast), color var(--transition-fast)',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--color-surface-2)';
                    e.currentTarget.style.color = 'var(--color-text)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-muted)';
                  }
                }}
              >
                <span style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }}>{mod.icon}</span>
                {mod.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        {activeModule === 'overview' && <ClusterOverview clusterId={clusterId} onNavigate={(mod) => setActiveModule(mod as DashboardModule)} />}
        {activeModule === 'topics' && <TopicListSubPanel clusterId={clusterId} />}
        {activeModule === 'consumers' && <ConsumerGroupListPanel clusterId={clusterId} />}
        {activeModule === 'schema' && <SchemaListPanel clusterId={clusterId} />}
        {activeModule === 'connect' && <ConnectorListPanel clusterId={clusterId} />}
        {activeModule === 'acl' && <AclListPanel clusterId={clusterId} />}
      </div>
    </div>
  );
}
