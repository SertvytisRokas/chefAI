"use client";

import React from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

/**
 * Centred overlay modal — dark theme, rounded panel.
 */
export default function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        <div className="modal-header">
          {title ? (
            <h2 id="modal-title" className="modal-title">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {/* Scrolls independently so a long body can never push the actions
            below the fold — with many ingredients the confirm buttons used to
            end up off-screen entirely. */}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
