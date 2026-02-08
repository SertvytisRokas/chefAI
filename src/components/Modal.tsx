"use client";

import React from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

/**
 * A reusable modal component that renders its children in a
 * centred overlay. The modal uses the dark theme colours defined in
 * globals.css. When `open` is false, nothing is rendered. The
 * `onClose` callback is called when the user clicks the close
 * button or outside the modal content. You can pass an optional
 * `title` to display a header.
 */
export default function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted-text-color)', fontSize: '1.2rem' }}
          >
            ✕
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}