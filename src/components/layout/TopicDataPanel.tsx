/**
 * Topic 数据面板 — 消息管理
 */
import { TopicMessageViewer } from '../topic/TopicMessageViewer';

export function TopicDataPanel({ clusterId, topicName }: { clusterId: string; topicName: string }) {
  return <TopicMessageViewer clusterId={clusterId} topicName={topicName} />;
}
