import type { ClusterConnection } from '../types';
import type { ConnectionFormData } from '../components/cluster/ConnectionDialog';

export function connectionToFormData(c: ClusterConnection): ConnectionFormData {
  return {
    name: c.name,
    bootstrapServers: c.bootstrapServers,
    kafkaVersion: c.kafkaVersion || '3.7',
    zookeeperHost: c.zookeeperHost ?? '',
    zookeeperPort: c.zookeeperPort ?? 2181,
    zkChrootPath: c.zkChrootPath ?? '/',
    securityProtocol: c.securityProtocol,
    saslMechanism: c.saslMechanism ?? '',
    jaasConfig: c.saslJaasConfig ?? '',
    awsRegion: '',
    sslCaCertPath: c.sslCaCertPath ?? '',
    sslClientCertPath: c.sslClientCertPath ?? '',
    sslClientKeyPath: c.sslClientKeyPath ?? '',
    sslClientKeyPassword: c.sslClientKeyPassword ?? '',
    sslVerifyHostname: c.sslVerifyHostname,
    schemaRegistryUrl: c.schemaRegistryUrl ?? '',
    schemaRegistryUsername: c.schemaRegistryUsername ?? '',
    schemaRegistryPassword: c.schemaRegistryPassword ?? '',
    connectWorkerUrls: c.connectUrls ?? '',
    notes: c.notes ?? '',
  };
}

export function formDataToConnectionPayload(
  data: ConnectionFormData,
  existing?: ClusterConnection,
): Partial<ClusterConnection> {
  const connectUrlsStr = data.connectWorkerUrls
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(',');

  return {
    id: existing?.id,
    name: data.name,
    bootstrapServers: data.bootstrapServers,
    kafkaVersion: data.kafkaVersion,
    zookeeperHost: data.zookeeperHost || undefined,
    zookeeperPort: data.zookeeperPort,
    zkChrootPath: data.zkChrootPath || undefined,
    securityProtocol: data.securityProtocol,
    saslMechanism: data.saslMechanism || undefined,
    saslJaasConfig: data.jaasConfig || undefined,
    sslCaCertPath: data.sslCaCertPath || undefined,
    sslClientCertPath: data.sslClientCertPath || undefined,
    sslClientKeyPath: data.sslClientKeyPath || undefined,
    sslClientKeyPassword: data.sslClientKeyPassword || undefined,
    sslVerifyHostname: data.sslVerifyHostname,
    schemaRegistryUrl: data.schemaRegistryUrl || undefined,
    schemaRegistryUsername: data.schemaRegistryUsername || undefined,
    schemaRegistryPassword: data.schemaRegistryPassword || undefined,
    connectUrls: connectUrlsStr || undefined,
    notes: data.notes || undefined,
    groupId: existing?.groupId,
    clusterMode: existing?.clusterMode ?? 'AUTO_DETECT',
    isFavorite: existing?.isFavorite ?? false,
    colorTag: existing?.colorTag,
    status: existing?.status ?? 'disconnected',
  };
}
