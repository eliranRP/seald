import { useId, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Toggle } from './Disclosure.styles';
import type { DisclosureProps } from './Disclosure.types';

/** Quiet toggle that keeps what is behind it out of the page until tapped. */
export function Disclosure({ label, ariaLabel, children }: DisclosureProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div>
      <Toggle
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
      </Toggle>
      <div id={panelId} hidden={!open}>
        {open ? children : null}
      </div>
    </div>
  );
}
