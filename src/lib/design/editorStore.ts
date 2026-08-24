"use client";

import { create } from "zustand";
import type { DesignDoc, DesignElement } from "./doc";

/**
 * Editor state for a single design.
 *
 * The document is treated as immutable: every mutation produces a new
 * `DesignDoc`, which makes undo/redo a plain array of snapshots and lets the
 * canvas re-render off referential equality. `dirty` drives the autosave
 * effect in the editor shell.
 */

const HISTORY_LIMIT = 50;

export interface DesignEditorState {
  doc: DesignDoc;
  selectedId: string | null;
  /** Element currently being edited via the inline textarea. */
  editingTextId: string | null;
  zoom: number;
  /** True when `doc` differs from what the server last acknowledged. */
  dirty: boolean;
  past: DesignDoc[];
  future: DesignDoc[];

  init: (doc: DesignDoc) => void;
  select: (id: string | null) => void;
  setEditingText: (id: string | null) => void;
  setZoom: (zoom: number) => void;
  markSaved: () => void;

  /** Replace the doc and push the previous one onto the undo stack. */
  commit: (next: DesignDoc) => void;
  /** Replace the doc without touching history (live drag feedback). */
  preview: (next: DesignDoc) => void;
  /** Push the current doc onto the undo stack before a preview sequence. */
  beginInteraction: () => void;

  addElement: (element: DesignElement) => void;
  updateElement: (id: string, patch: Partial<DesignElement>, options?: { history?: boolean }) => void;
  removeElement: (id: string) => void;
  duplicateElement: (id: string) => void;
  reorderElement: (id: string, direction: "front" | "back" | "forward" | "backward") => void;
  setBackgroundColor: (color: string) => void;

  undo: () => void;
  redo: () => void;
}

function pushHistory(past: DesignDoc[], doc: DesignDoc): DesignDoc[] {
  const next = [...past, doc];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

/**
 * Apply a partial patch to one element. The cast is needed because
 * `Partial<DesignElement>` is a union of partials and TypeScript cannot prove
 * the spread stays within a single variant; callers always pass fields
 * belonging to the element's own kind.
 */
function patchElement(element: DesignElement, patch: Partial<DesignElement>): DesignElement {
  return { ...element, ...patch } as DesignElement;
}

export const useDesignEditor = create<DesignEditorState>((set, get) => ({
  doc: { version: 1, background: { color: "#ffffff" }, elements: [] },
  selectedId: null,
  editingTextId: null,
  zoom: 1,
  dirty: false,
  past: [],
  future: [],

  init: (doc) =>
    set({
      doc,
      selectedId: null,
      editingTextId: null,
      dirty: false,
      past: [],
      future: [],
    }),

  select: (id) => set({ selectedId: id, editingTextId: null }),
  setEditingText: (id) => set({ editingTextId: id }),
  setZoom: (zoom) => set({ zoom }),
  markSaved: () => set({ dirty: false }),

  commit: (next) =>
    set((state) => ({
      doc: next,
      past: pushHistory(state.past, state.doc),
      future: [],
      dirty: true,
    })),

  preview: (next) => set({ doc: next, dirty: true }),

  beginInteraction: () =>
    set((state) => ({ past: pushHistory(state.past, state.doc), future: [] })),

  addElement: (element) => {
    const { doc, commit } = get();
    commit({ ...doc, elements: [...doc.elements, element] });
    set({ selectedId: element.id });
  },

  updateElement: (id, patch, options) => {
    const { doc } = get();
    const elements = doc.elements.map((el) =>
      el.id === id ? patchElement(el, patch) : el,
    );
    const next = { ...doc, elements };
    if (options?.history === false) {
      get().preview(next);
    } else {
      get().commit(next);
    }
  },

  removeElement: (id) => {
    const { doc, commit, selectedId } = get();
    commit({ ...doc, elements: doc.elements.filter((el) => el.id !== id) });
    if (selectedId === id) set({ selectedId: null, editingTextId: null });
  },

  duplicateElement: (id) => {
    const { doc, commit } = get();
    const index = doc.elements.findIndex((el) => el.id === id);
    if (index < 0) return;
    const source = doc.elements[index];
    const copy: DesignElement = {
      ...source,
      id: `${source.id}c${Date.now().toString(36)}`,
      x: source.x + Math.round(source.width * 0.06),
      y: source.y + Math.round(source.height * 0.06),
    };
    const elements = [...doc.elements];
    elements.splice(index + 1, 0, copy);
    commit({ ...doc, elements });
    set({ selectedId: copy.id });
  },

  reorderElement: (id, direction) => {
    const { doc, commit } = get();
    const index = doc.elements.findIndex((el) => el.id === id);
    if (index < 0) return;

    let target: number;
    if (direction === "front") target = doc.elements.length - 1;
    else if (direction === "back") target = 0;
    else if (direction === "forward") target = Math.min(doc.elements.length - 1, index + 1);
    else target = Math.max(0, index - 1);
    if (target === index) return;

    const elements = [...doc.elements];
    const [moved] = elements.splice(index, 1);
    elements.splice(target, 0, moved);
    commit({ ...doc, elements });
  },

  setBackgroundColor: (color) => {
    const { doc, commit } = get();
    commit({ ...doc, background: { color } });
  },

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future].slice(0, HISTORY_LIMIT),
        dirty: true,
        editingTextId: null,
      };
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        doc: next,
        past: pushHistory(state.past, state.doc),
        future: state.future.slice(1),
        dirty: true,
        editingTextId: null,
      };
    }),
}));

/** Currently selected element, or `null`. */
export function selectSelectedElement(state: DesignEditorState): DesignElement | null {
  if (!state.selectedId) return null;
  return state.doc.elements.find((el) => el.id === state.selectedId) ?? null;
}
