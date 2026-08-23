"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

export interface FileDropzoneProps {
  /** Same syntax as `<input accept>`; also used to filter dropped files. */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  /** Applied to the wrapper element. */
  className?: string;
  /** Applied to the wrapper only while a drag hovers over the zone. */
  dragActiveClassName?: string;
  /**
   * Zone content. Either static nodes or a render function receiving the
   * current drag state (for custom highlight inside the zone).
   */
  children: ReactNode | ((dragActive: boolean) => ReactNode);
  /**
   * When true (default) clicking anywhere in the zone opens the file picker.
   * Set to false if the content has its own interactive elements and only a
   * nested `<label>` should trigger browsing.
   */
  clickToBrowse?: boolean;
  ariaLabel?: string;
}

/**
 * Matches a File against an `<input accept>`-style list ("image/*",
 * ".pdf,image/png", …). Browsers only enforce `accept` in the file picker —
 * drag-and-drop delivers anything, so we re-filter here.
 */
function matchesAccept(file: File, accept: string): boolean {
  const rules = accept
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  if (rules.length === 0) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith(".")) return name.endsWith(rule);
    if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

/**
 * Shared native drag-and-drop file zone (no external deps). Wraps arbitrary
 * content; drops and (optionally) clicks feed `onFiles`. Uses a drag-enter
 * counter so highlight doesn't flicker while dragging over child elements.
 */
export function FileDropzone({
  accept,
  multiple = false,
  disabled = false,
  onFiles,
  className,
  dragActiveClassName,
  children,
  clickToBrowse = true,
  ariaLabel,
}: FileDropzoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const emitFiles = useCallback(
    (list: FileList | File[] | null) => {
      if (!list) return;
      let files = Array.from(list);
      if (accept) files = files.filter((f) => matchesAccept(f, accept));
      if (!multiple) files = files.slice(0, 1);
      if (files.length > 0) onFiles(files);
    },
    [accept, multiple, onFiles],
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragDepth.current += 1;
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragActive(false);
    if (disabled) return;
    emitFiles(e.dataTransfer.files);
  };

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div
      role={clickToBrowse ? "button" : undefined}
      tabIndex={clickToBrowse && !disabled ? 0 : undefined}
      aria-label={ariaLabel}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={clickToBrowse ? openPicker : undefined}
      onKeyDown={
        clickToBrowse
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openPicker();
              }
            }
          : undefined
      }
      className={`${className ?? ""} ${dragActive ? dragActiveClassName ?? "" : ""}`.trim()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          emitFiles(e.target.files);
          // Allow re-selecting the same file (e.g. after removing it).
          e.target.value = "";
        }}
      />
      {typeof children === "function" ? children(dragActive) : children}
    </div>
  );
}
