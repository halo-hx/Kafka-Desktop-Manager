/**
 * 根据当前活动标签路由主内容面板
 */
import { BrokerDetailPanel } from '../cluster/BrokerDetailPanel';
import { ClusterDashboard } from '../cluster/ClusterDashboard';
import { ClusterOverview } from '../cluster/ClusterOverview';
import { TopicDataPanel } from './TopicDataPanel';
import { WelcomePanel } from './WelcomePanel';
import { TopicPropertiesPanel } from '../topic/TopicPropertiesPanel';
import { TopicPartitionsPanel } from '../topic/TopicPartitionsPanel';
import { ConsumerGroupListPanel } from '../consumer/ConsumerGroupListPanel';
import { ConsumerGroupDetailPanel } from '../consumer/ConsumerGroupDetailPanel';
import { SchemaDetailPanel } from '../schema/SchemaDetailPanel';
import { SchemaListPanel } from '../schema/SchemaListPanel';
import { ConnectorListPanel } from '../connect/ConnectorListPanel';
import { ConnectorDetailPanel } from '../connect/ConnectorDetailPanel';
import { AclListPanel } from '../acl/AclListPanel';
import { SettingsPanel } from '../settings/SettingsPanel';
import { useUIStore } from '../../stores/uiStore';

export function PanelRouter() {
  const activeTab = useUIStore((s) => s.tabs.find((t) => t.id === s.activeTabId));

  if (!activeTab) {
    return <WelcomePanel />;
  }

  switch (activeTab.panel.type) {
    case 'welcome':
      return <WelcomePanel />;
    case 'cluster-dashboard':
      return <ClusterDashboard clusterId={activeTab.panel.clusterId} />;
    case 'cluster-overview':
      return <ClusterOverview clusterId={activeTab.panel.clusterId} />;
    case 'broker-detail':
      return (
        <BrokerDetailPanel
          clusterId={activeTab.panel.clusterId}
          brokerId={activeTab.panel.brokerId}
        />
      );
    case 'topic-data':
      return (
        <TopicDataPanel
          clusterId={activeTab.panel.clusterId}
          topicName={activeTab.panel.topicName}
        />
      );
    case 'topic-properties':
      return (
        <TopicPropertiesPanel
          clusterId={activeTab.panel.clusterId}
          topicName={activeTab.panel.topicName}
        />
      );
    case 'topic-partitions':
      return (
        <TopicPartitionsPanel
          clusterId={activeTab.panel.clusterId}
          topicName={activeTab.panel.topicName}
        />
      );
    case 'consumer-group-list':
      return <ConsumerGroupListPanel clusterId={activeTab.panel.clusterId} />;
    case 'consumer-group-detail':
      return (
        <ConsumerGroupDetailPanel
          clusterId={activeTab.panel.clusterId}
          groupId={activeTab.panel.groupId}
        />
      );
    case 'schema-registry':
      return <SchemaListPanel clusterId={activeTab.panel.clusterId} />;
    case 'schema-detail':
      return (
        <SchemaDetailPanel
          clusterId={activeTab.panel.clusterId}
          subject={activeTab.panel.subject}
        />
      );
    case 'kafka-connect':
      return <ConnectorListPanel clusterId={activeTab.panel.clusterId} />;
    case 'connector-detail':
      return (
        <ConnectorDetailPanel
          clusterId={activeTab.panel.clusterId}
          connectorName={activeTab.panel.connectorName}
        />
      );
    case 'acl-list':
      return <AclListPanel clusterId={activeTab.panel.clusterId} />;
    case 'settings':
      return <SettingsPanel />;
    default: {
      const _exhaustive: never = activeTab.panel;
      return _exhaustive;
    }
  }
}
