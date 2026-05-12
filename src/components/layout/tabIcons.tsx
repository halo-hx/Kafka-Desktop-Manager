import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BookOpen,
  Construction,
  Database,
  FileText,
  GitBranch,
  LayoutDashboard,
  List,
  Lock,
  MessageSquare,
  Plug,
  Server,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import type { PanelType } from '../../types';

const ICON_BY_NAME: Record<string, LucideIcon> = {
  database: Database,
  'layout-dashboard': LayoutDashboard,
  server: Server,
  list: List,
  users: Users,
  shield: Shield,
  plug: Plug,
  lock: Lock,
  settings: Settings,
  activity: Activity,
  message: MessageSquare,
  book: BookOpen,
  branch: GitBranch,
  construction: Construction,
  'file-text': FileText,
};

export function resolveTabIcon(panel: PanelType, iconKey?: string): LucideIcon {
  if (iconKey && ICON_BY_NAME[iconKey]) {
    return ICON_BY_NAME[iconKey];
  }
  switch (panel.type) {
    case 'welcome':
      return Database;
    case 'settings':
      return Settings;
    case 'cluster-dashboard':
      return LayoutDashboard;
    case 'cluster-overview':
      return LayoutDashboard;
    case 'broker-detail':
      return Server;
    case 'topic-data':
    case 'topic-properties':
    case 'topic-partitions':
      return List;
    case 'consumer-group-list':
    case 'consumer-group-detail':
      return Users;
    case 'schema-registry':
      return BookOpen;
    case 'schema-detail':
      return FileText;
    case 'kafka-connect':
    case 'connector-detail':
      return Plug;
    case 'acl-list':
      return Shield;
    default: {
      const _x: never = panel;
      return _x;
    }
  }
}
