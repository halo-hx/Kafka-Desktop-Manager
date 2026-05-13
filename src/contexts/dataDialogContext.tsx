import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ExportTopicDataDialog } from '../components/data/ExportTopicDataDialog';
import { ImportTopicDataDialog } from '../components/data/ImportTopicDataDialog';
import { ConnectionExportDialog } from '../components/data/ConnectionExportDialog';
import { ConnectionImportDialog } from '../components/data/ConnectionImportDialog';
import { CrossClusterCopyDialog } from '../components/data/CrossClusterCopyDialog';

export interface ExportTopicOpenArgs {
  clusterId: string;
  topicName: string;
}

export interface ImportTopicOpenArgs {
  clusterId: string;
  defaultTopicName?: string;
}

export interface CrossClusterCopyOpenArgs {
  sourceClusterId: string;
  topicName: string;
}

interface DataDialogContextValue {
  openExportTopicData: (args: ExportTopicOpenArgs) => void;
  openImportTopicData: (args: ImportTopicOpenArgs) => void;
  openConnectionExport: () => void;
  openConnectionImport: () => void;
  openCrossClusterCopy: (args: CrossClusterCopyOpenArgs) => void;
}

const DataDialogContext = createContext<DataDialogContextValue | null>(null);

export function DataDialogProvider({ children }: { children: ReactNode }) {
  const [exportTopic, setExportTopic] = useState<ExportTopicOpenArgs | null>(null);
  const [importTopic, setImportTopic] = useState<ImportTopicOpenArgs | null>(null);
  const [connectionExportOpen, setConnectionExportOpen] = useState(false);
  const [connectionImportOpen, setConnectionImportOpen] = useState(false);
  const [crossCopy, setCrossCopy] = useState<CrossClusterCopyOpenArgs | null>(null);

  const openExportTopicData = useCallback((args: ExportTopicOpenArgs) => {
    setExportTopic(args);
  }, []);

  const openImportTopicData = useCallback((args: ImportTopicOpenArgs) => {
    setImportTopic(args);
  }, []);

  const openConnectionExport = useCallback(() => setConnectionExportOpen(true), []);
  const openConnectionImport = useCallback(() => setConnectionImportOpen(true), []);

  const openCrossClusterCopy = useCallback((args: CrossClusterCopyOpenArgs) => {
    setCrossCopy(args);
  }, []);

  const value = useMemo(
    () => ({
      openExportTopicData,
      openImportTopicData,
      openConnectionExport,
      openConnectionImport,
      openCrossClusterCopy,
    }),
    [
      openExportTopicData,
      openImportTopicData,
      openConnectionExport,
      openConnectionImport,
      openCrossClusterCopy,
    ],
  );

  return (
    <DataDialogContext.Provider value={value}>
      {children}
      {exportTopic && (
        <ExportTopicDataDialog
          open
          clusterId={exportTopic.clusterId}
          topicName={exportTopic.topicName}
          onClose={() => setExportTopic(null)}
        />
      )}
      {importTopic && (
        <ImportTopicDataDialog
          open
          clusterId={importTopic.clusterId}
          defaultTopicName={importTopic.defaultTopicName}
          onClose={() => setImportTopic(null)}
        />
      )}
      <ConnectionExportDialog
        open={connectionExportOpen}
        onClose={() => setConnectionExportOpen(false)}
      />
      <ConnectionImportDialog
        open={connectionImportOpen}
        onClose={() => setConnectionImportOpen(false)}
      />
      {crossCopy && (
        <CrossClusterCopyDialog
          open
          sourceClusterId={crossCopy.sourceClusterId}
          topicName={crossCopy.topicName}
          onClose={() => setCrossCopy(null)}
        />
      )}
    </DataDialogContext.Provider>
  );
}

export function useDataDialogs() {
  const ctx = useContext(DataDialogContext);
  if (!ctx) {
    throw new Error('useDataDialogs must be used within DataDialogProvider');
  }
  return ctx;
}
