import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ChevronDown,
  Download,
  FileText,
  HardDrive,
  List,
  Lock,
  Package,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/Button';
import { Menu } from '@/components/Menu';
import type { MenuEntry } from '@/components/Menu';
import { DownloadAnchor, Hint, MenuHint, MenuLabelRow, Split } from './EnvelopeDetailPage.styles';

export type DownloadKind = 'bundle' | 'sealed' | 'audit' | 'original' | 'zip' | 'gdrive';

export interface DownloadSplitButtonProps {
  readonly sealed: boolean;
  readonly sealing: boolean;
  readonly originalAvailable: boolean;
  readonly gdriveEnabled: boolean;
  /** Several documents: the main button and the menu offer one zip instead of a single sealed PDF. */
  readonly multiDoc: boolean;
  readonly busy: string | null;
  readonly gdriveLastSaved?: string | null | undefined;
  readonly fullWidth?: boolean | undefined;
  readonly onSelect: (kind: DownloadKind) => void;
}

/**
 * Download button with one primary action and a menu. Before the envelope
 * is sealed only the original PDF can be downloaded; the sealed items show a
 * lock and "After all sign" (or "about 1 min" while sealing).
 */
export function DownloadSplitButton(props: DownloadSplitButtonProps) {
  const {
    sealed,
    sealing,
    originalAvailable,
    gdriveEnabled,
    multiDoc,
    busy,
    gdriveLastSaved,
    fullWidth,
    onSelect,
  } = props;
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const lockText = sealing ? 'about 1 min' : 'After all sign';
  const labelFor = (label: string): ReactNode =>
    sealed ? (
      label
    ) : (
      <MenuLabelRow>
        {label}
        <MenuHint>{lockText}</MenuHint>
        <Lock size={12} aria-hidden />
      </MenuLabelRow>
    );
  const pick = (kind: DownloadKind) => () => onSelect(kind);
  const entries: MenuEntry[] = [
    multiDoc
      ? {
          id: 'zip',
          label: labelFor('All documents (zip)'),
          icon: Package,
          disabled: !sealed,
          busy: busy === 'zip',
          onSelect: pick('zip'),
        }
      : {
          id: 'sealed',
          label: labelFor('Sealed PDF'),
          icon: ShieldCheck,
          disabled: !sealed,
          busy: busy === 'sealed',
          onSelect: pick('sealed'),
        },
    {
      id: 'audit',
      label: labelFor('Audit trail'),
      icon: List,
      disabled: !sealed,
      busy: busy === 'audit',
      onSelect: pick('audit'),
    },
    // Several documents have no single original; each has its own row in the documents card.
    ...(multiDoc
      ? []
      : [
          {
            id: 'original',
            label: 'Original PDF',
            icon: FileText,
            disabled: !originalAvailable,
            busy: busy === 'original',
            onSelect: pick('original'),
          } satisfies MenuEntry,
        ]),
    ...(gdriveEnabled
      ? ([
          { type: 'separator', id: 'sep' },
          {
            id: 'gdrive',
            label:
              sealed && gdriveLastSaved ? (
                <MenuLabelRow>
                  Save to Drive
                  <MenuHint>{gdriveLastSaved}</MenuHint>
                </MenuLabelRow>
              ) : (
                labelFor('Save to Drive')
              ),
            icon: HardDrive,
            disabled: !sealed,
            busy: busy === 'gdrive',
            onSelect: pick('gdrive'),
          },
        ] satisfies MenuEntry[])
      : []),
  ];
  const sealedKind: DownloadKind = multiDoc ? 'zip' : 'bundle';
  const mainKind: DownloadKind = sealed ? sealedKind : 'original';
  const mainDisabled = sealing || (!sealed && !originalAvailable);
  return (
    <>
      {sealing ? <Hint>about 1 min</Hint> : null}
      <DownloadAnchor $full={fullWidth === true}>
        <Split $full={fullWidth === true}>
          <Button
            variant={sealed ? 'primary' : 'secondary'}
            iconLeft={Download}
            fullWidth={fullWidth}
            disabled={mainDisabled}
            loading={busy === mainKind}
            onClick={() => onSelect(mainKind)}
          >
            Download
          </Button>
          <Button
            ref={anchorRef}
            variant={sealed ? 'primary' : 'secondary'}
            iconOnly
            iconLeft={ChevronDown}
            aria-label="Download options"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          />
        </Split>
        <Menu
          open={open}
          onClose={() => setOpen(false)}
          items={entries}
          anchorRef={anchorRef}
          aria-label="Download"
        />
      </DownloadAnchor>
    </>
  );
}
