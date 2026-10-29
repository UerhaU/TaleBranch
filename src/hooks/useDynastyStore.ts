import { createContext, useContext } from "react";
import type { DynastyStore } from "../lib/dynastyStore";
import { platformStore } from "../lib/platformStore";

/** Tests put a store with fake folders here; the application uses the one for its platform. */
export const DynastyStoreContext = createContext<DynastyStore | undefined>(undefined);

export function useDynastyStore(): DynastyStore {
  return useContext(DynastyStoreContext) ?? platformStore();
}
