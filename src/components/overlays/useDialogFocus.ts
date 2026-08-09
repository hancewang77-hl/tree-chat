"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hidden && element.getAttribute("aria-hidden") !== "true",
  );
}

type ModalEntry = {
  id: symbol;
  root: HTMLElement;
  onEscape: () => void;
};

type AttributeSnapshot = {
  inert: string | null;
  ariaHidden: string | null;
};

const modalStack: ModalEntry[] = [];
const backgroundSnapshots = new Map<HTMLElement, AttributeSnapshot>();

function restoreBackgroundAttributes() {
  for (const [element, snapshot] of backgroundSnapshots) {
    if (snapshot.inert === null) element.removeAttribute("inert");
    else element.setAttribute("inert", snapshot.inert);

    if (snapshot.ariaHidden === null) element.removeAttribute("aria-hidden");
    else element.setAttribute("aria-hidden", snapshot.ariaHidden);
  }
  backgroundSnapshots.clear();
}

function syncBackgroundInertness() {
  restoreBackgroundAttributes();

  const topmostRoot = modalStack.at(-1)?.root;
  if (!topmostRoot) return;

  for (const child of Array.from(document.body.children)) {
    if (!(child instanceof HTMLElement) || child === topmostRoot) continue;
    backgroundSnapshots.set(child, {
      inert: child.getAttribute("inert"),
      ariaHidden: child.getAttribute("aria-hidden"),
    });
    child.setAttribute("inert", "");
    child.setAttribute("aria-hidden", "true");
  }
}

function handleModalEscape(event: KeyboardEvent) {
  if (event.key !== "Escape") return;

  const topmost = modalStack.at(-1);
  if (!topmost) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  topmost.onEscape();
}

function syncEscapeListener() {
  window.removeEventListener("keydown", handleModalEscape, true);
  if (modalStack.length > 0) {
    window.addEventListener("keydown", handleModalEscape, true);
  }
}

export function hasOpenModal() {
  return modalStack.length > 0;
}

export function DialogPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

export function useDialogFocus<T extends HTMLElement>({
  open,
  initialFocusRef,
  onEscape,
}: {
  open: boolean;
  initialFocusRef: RefObject<HTMLElement | null>;
  onEscape: () => void;
}) {
  const modalId = useRef(Symbol("modal"));
  const modalRootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<T>(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useLayoutEffect(() => {
    if (!open) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modalRoot = modalRootRef.current;
    const dialog = dialogRef.current;
    if (!modalRoot || !dialog) return;

    const entry: ModalEntry = {
      id: modalId.current,
      root: modalRoot,
      onEscape: () => onEscapeRef.current(),
    };
    modalStack.push(entry);
    syncEscapeListener();
    syncBackgroundInertness();

    const initialFocus = initialFocusRef.current ?? (dialog ? focusableElements(dialog)[0] : null);
    initialFocus?.focus();

    return () => {
      const wasTopmost = modalStack.at(-1)?.id === entry.id;
      const entryIndex = modalStack.findIndex((candidate) => candidate.id === entry.id);
      if (entryIndex >= 0) modalStack.splice(entryIndex, 1);
      syncEscapeListener();
      syncBackgroundInertness();
      if (wasTopmost && opener?.isConnected) opener.focus();
    };
  }, [initialFocusRef, open]);

  const onDialogKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    if (modalStack.at(-1)?.id !== modalId.current) return;

    const focusable = focusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  const isTopmost = useCallback(
    () => modalStack.at(-1)?.id === modalId.current,
    [],
  );

  return { modalRootRef, dialogRef, onDialogKeyDown, isTopmost };
}
