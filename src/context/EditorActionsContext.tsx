import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { Circuit } from '../api/types';

/**
 * Bridges the header (AppLayout) and the editor (EditorPage), which are
 * separated by the router's <Outlet/>. EditorPage registers callbacks on
 * mount so the header's Save button can serialize the canvas and capture a
 * thumbnail. Intentionally throwaway — the upcoming editor redesign should
 * replace it with a proper state colocation.
 */
export interface EditorActions {
  serialize: () => { circuit: Circuit; unconnectedGateIds: number[] };
  captureThumbnail: () => string | undefined;
}

interface EditorActionsContextValue {
  actions: EditorActions | null;
  registerActions: (actions: EditorActions | null) => void;
}

const EditorActionsContext = createContext<EditorActionsContextValue | null>(null);

export function EditorActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<EditorActions | null>(null);
  const registerActions = useCallback((next: EditorActions | null) => setActions(() => next), []);
  return (
    <EditorActionsContext.Provider value={{ actions, registerActions }}>
      {children}
    </EditorActionsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEditorActions() {
  const ctx = useContext(EditorActionsContext);
  if (!ctx) {
    throw new Error('useEditorActions must be used within an EditorActionsProvider');
  }
  return ctx;
}
