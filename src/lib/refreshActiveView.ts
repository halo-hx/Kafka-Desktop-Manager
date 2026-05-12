import { useUIStore } from '../stores/uiStore';
import { useClusterStore } from '../stores/clusterStore';
import { useConnectionStore } from '../stores/connectionStore';

/**
 * 刷新当前标签对应的数据（快捷键 Cmd+R）。
 */
export function refreshActiveView(): void {
  const { tabs, activeTabId } = useUIStore.getState();
  const tab = tabs.find((t) => t.id === activeTabId);
  const clusterStore = useClusterStore.getState();
  const connectionStore = useConnectionStore.getState();

  if (!tab) {
    void connectionStore.loadConnections();
    void connectionStore.loadGroups();
    return;
  }

  const panel = tab.panel;

  switch (panel.type) {
    case 'welcome':
    case 'settings':
      void connectionStore.loadConnections();
      void connectionStore.loadGroups();
      break;

    case 'cluster-dashboard':
      void clusterStore.loadClusterOverview(panel.clusterId);
      void clusterStore.loadTopics(panel.clusterId);
      void clusterStore.loadConsumerGroups(panel.clusterId);
      break;

    case 'cluster-overview':
      void clusterStore.loadClusterOverview(panel.clusterId);
      void clusterStore.loadTopics(panel.clusterId);
      void clusterStore.loadConsumerGroups(panel.clusterId);
      break;

    case 'broker-detail':
      void clusterStore.loadClusterOverview(panel.clusterId);
      break;

    case 'topic-data':
      window.dispatchEvent(
        new CustomEvent('km:refresh-topic-messages', {
          detail: { clusterId: panel.clusterId, topicName: panel.topicName },
        }),
      );
      void clusterStore.loadTopics(panel.clusterId);
      break;

    case 'topic-properties':
    case 'topic-partitions':
      void clusterStore.loadTopics(panel.clusterId);
      break;

    case 'consumer-group-list':
      void clusterStore.loadConsumerGroups(panel.clusterId);
      break;

    case 'consumer-group-detail':
      void clusterStore.loadConsumerGroups(panel.clusterId);
      break;

    case 'schema-registry':
    case 'schema-detail':
    case 'kafka-connect':
    case 'connector-detail':
    case 'acl-list': {
      const cid = panel.clusterId;
      void clusterStore.loadClusterOverview(cid);
      break;
    }
    default: {
      const _e: never = panel;
      return _e;
    }
  }
}
