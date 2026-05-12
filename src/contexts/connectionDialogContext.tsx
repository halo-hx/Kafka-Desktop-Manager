import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface ConnectionDialogOptions {
  /** 编辑已有连接时传入 */
  connectionId?: string;
}

interface ConnectionDialogContextValue {
  openConnectionDialog: (options?: ConnectionDialogOptions) => void;
  closeConnectionDialog: () => void;
  dialogOptions: ConnectionDialogOptions | null;
  isOpen: boolean;
}

const ConnectionDialogContext = createContext<ConnectionDialogContextValue | null>(null);

export function ConnectionDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [dialogOptions, setDialogOptions] = useState<ConnectionDialogOptions | null>(null);

  const openConnectionDialog = useCallback((options?: ConnectionDialogOptions) => {
    setDialogOptions(options ?? null);
    setIsOpen(true);
  }, []);

  const closeConnectionDialog = useCallback(() => {
    setIsOpen(false);
    setDialogOptions(null);
  }, []);

  const value = useMemo(
    () => ({
      openConnectionDialog,
      closeConnectionDialog,
      dialogOptions,
      isOpen,
    }),
    [openConnectionDialog, closeConnectionDialog, dialogOptions, isOpen],
  );

  return (
    <ConnectionDialogContext.Provider value={value}>{children}</ConnectionDialogContext.Provider>
  );
}

export function useConnectionDialogContext() {
  const ctx = useContext(ConnectionDialogContext);
  if (!ctx) {
    throw new Error('useConnectionDialogContext must be used within ConnectionDialogProvider');
  }
  return ctx;
}
