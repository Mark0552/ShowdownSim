/**
 * ModalFrame — shared modal chrome used by all in-game popups (Substitution
 * Modal, Defense Setup Modal, Bullpen Panel).
 *
 * Goal: visual consistency across modals (same border, header, close
 * affordance, body scroll, optional footer) and mobile-first defaults
 * (full-viewport, sticky header + footer, × close icon).
 *
 * Usage:
 *   <ModalFrame title="PINCH HIT" onClose={onClose}>
 *     ...body content...
 *   </ModalFrame>
 *
 * For modals that need a sticky bottom action row (Confirm, Accept), pass
 * the `footer` prop. The header can carry extra inline content (e.g. a
 * defense totals bar) via `headerExtra`.
 *
 * Backdrop click closes by default when onClose is provided. Pass
 * `closeOnBackdrop={false}` for forced-action modals (DefenseSetupModal at
 * a half-inning boundary, where the user must commit a valid alignment).
 */

import React from 'react';
import './ModalFrame.css';

interface Props {
    title: string;
    /** When provided, renders a CLOSE button in the header (× on mobile)
     *  and closes the modal on backdrop click (unless closeOnBackdrop is
     *  explicitly false). Forced-action modals omit this. */
    onClose?: () => void;
    children: React.ReactNode;
    /** Optional sticky footer — typically a Confirm / Accept / Cancel row.
     *  On mobile this stays pinned to the bottom of the panel via
     *  position: sticky inside .mf-body. */
    footer?: React.ReactNode;
    /** Extra inline content rendered to the right of the title in the
     *  header. Used by DefenseSetupModal for its totals bar. */
    headerExtra?: React.ReactNode;
    /** Default true when onClose is set. Disable for forced-action modals. */
    closeOnBackdrop?: boolean;
    /** Optional class on the panel for per-modal sizing tweaks. */
    panelClassName?: string;
    /** Optional class on the body for per-modal padding / layout. Defaults
     *  to 'mf-body-default' which adds 16px 18px padding. Pass a custom
     *  class (or '' for none) to override. */
    bodyClassName?: string;
    /** When true (and onClose is set), the overlay's z-index is reduced so
     *  another modal layered on top of it (e.g. CardTooltip) wins focus.
     *  Rarely needed. */
    lowZ?: boolean;
}

export default function ModalFrame({
    title, onClose, children, footer, headerExtra,
    closeOnBackdrop, panelClassName = '', bodyClassName = 'mf-body-default', lowZ,
}: Props) {
    const handleBackdropClick = () => {
        if (closeOnBackdrop === false) return;
        if (closeOnBackdrop || (onClose && closeOnBackdrop !== false)) {
            onClose?.();
        }
    };

    return (
        <div
            className={`mf-overlay${lowZ ? ' mf-overlay-low' : ''}`}
            onClick={handleBackdropClick}
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            <div
                className={`mf-panel ${panelClassName}`}
                onClick={e => e.stopPropagation()}
            >
                <div className="mf-header">
                    <span className="mf-title">{title}</span>
                    {headerExtra && <div className="mf-header-extra">{headerExtra}</div>}
                    {onClose && (
                        <button className="mf-close" onClick={onClose} aria-label="Close">CLOSE</button>
                    )}
                </div>
                <div className={`mf-body ${bodyClassName}`}>
                    {children}
                    {footer && <div className="mf-footer">{footer}</div>}
                </div>
            </div>
        </div>
    );
}
