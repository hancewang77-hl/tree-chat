"use client";

import { createContext, useContext, useReducer, useEffect, type ReactNode } from "react";
import type { TreeState, TreeAction } from "@/src/types/tree";
import { treeReducer, initialState, loadInitialState } from "./treeReducer";

type TreeContextType = {
  state: TreeState;
  dispatch: React.Dispatch<TreeAction>;
};

const TreeContext = createContext<TreeContextType | null>(null);

export function TreeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(treeReducer, undefined, initialState);

  // After mount, hydrate from localStorage (avoids SSR hydration mismatch)
  useEffect(() => {
    const stored = loadInitialState();
    if (Object.keys(stored.projects).length > 0) {
      dispatch({ type: "HYDRATE", state: stored });
    }
  }, []);

  return (
    <TreeContext.Provider value={{ state, dispatch }}>
      {children}
    </TreeContext.Provider>
  );
}

export function useTree(): TreeContextType {
  const ctx = useContext(TreeContext);
  if (!ctx) throw new Error("useTree must be used within TreeProvider");
  return ctx;
}

export function useTreeState(): TreeState {
  return useTree().state;
}

export function useTreeDispatch(): React.Dispatch<TreeAction> {
  return useTree().dispatch;
}
