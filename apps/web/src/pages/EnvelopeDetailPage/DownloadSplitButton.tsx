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
import type { MenuActionItem, MenuEntry } from '@/components/Menu';
import { MWBottomSheet } from '@/components/MWBottomSheet';
import {
  DownloadAnchor,
  Hint,
  MenuHint,
  MenuLabelRow,
  SheetList,
  Split,
} from './EnvelopeDetailPage.styles';

export type DownloadKind = 'sealed' | 'audit' | 'original' | 'zip' | 'gdrive';

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
  /**
   * Phones: the button sits in the bar pinned to the bottom of the screen, so
   * the options open in a bottom sheet instead of a menu dropping off-screen.
   */
  readonly asSheet?: boolean | undefined;
  readonly onSelect: (kind: DownloadKind) => void;
}

function isAction(entry: MenuEntry): entry is MenuActionItem {
  return entry.type === undefined || entry.type === 'item';
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
    asSheet,
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
  // The main action is the signed document alone; the audit trail is its
  // own file, downloaded from the menu, never bundled with it.
  const sealedKind: DownloadKind = multiDoc ? 'zip' : 'sealed';
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
        {asSheet === true ? null : (
          <Menu
            open={open}
            onClose={() => setOpen(false)}
            items={entries}
            anchorRef={anchorRef}
            aria-label="Download"
          />
        )}
      </DownloadAnchor>
      {asSheet === true ? (
        <MWBottomSheet open={open} onClose={() => setOpen(false)} title="Download">
          <SheetList>
            {entries.filter(isAction).map((entry) => (
              <Button
                key={entry.id}
                variant="ghost"
                size="lg"
                fullWidth
                iconLeft={entry.icon}
                disabled={entry.disabled === true}
                loading={entry.busy === true}
                onClick={() => {
                  setOpen(false);
                  entry.onSelect();
                }}
              >
                {entry.label}
              </Button>
            ))}
          </SheetList>
        </MWBottomSheet>
      ) : null}
    </>
  );
}
