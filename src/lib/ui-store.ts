"use client";

import { create } from "zustand";
import type { Transaction } from "./portfolio/types";

interface TxDialogState {
  open: boolean;
  /** Transaction being edited. */
  editId?: string;
  /** Prefilled fields for a new transaction. */
  initial?: Partial<Transaction>;
}

interface UiState {
  commandOpen: boolean;
  txDialog: TxDialogState;
  importOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  openTransaction: (opts?: { editId?: string; initial?: Partial<Transaction> }) => void;
  closeTransaction: () => void;
  setImportOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  commandOpen: false,
  txDialog: { open: false },
  importOpen: false,
  setCommandOpen: (open) => set({ commandOpen: open }),
  openTransaction: (opts) => set({ txDialog: { open: true, ...opts }, commandOpen: false }),
  closeTransaction: () => set((s) => ({ txDialog: { ...s.txDialog, open: false } })),
  setImportOpen: (open) => set({ importOpen: open, commandOpen: false }),
}));
