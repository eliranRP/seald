import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DisclosureButton } from './DevelopersPanel.styles';

export interface DisclosureProps {
  /** Visible label. The page uses "Advanced" everywhere. */
  readonly label: string;
  /** Accessible name when several "Advanced" toggles share a page. Must start with `label`. */
  readonly ariaLabel?: string | undefined;
  readonly children: ReactNode;
}

/** Quiet "Advanced" toggle that hides everything behind it until tapped. */
export function Disclosure({ label, ariaLabel, children }: DisclosureProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div>
      <DisclosureButton
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <Chevron size={16} aria-hidden />
        {label}
      </DisclosureButton>
      <div id={panelId} hidden={!open}>
        {open ? children : null}
      </div>
    </div>
  );
}
