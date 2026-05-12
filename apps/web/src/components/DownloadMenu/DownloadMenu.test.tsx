import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { FileCheck2, FileText, HardDriveUpload, Package, ShieldCheck } from 'lucide-react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { DownloadMenu } from './DownloadMenu';
import type { DownloadMenuItem } from './DownloadMenu.types';

const items: ReadonlyArray<DownloadMenuItem> = [
  {
    kind: 'original',
    icon: FileText,
    title: 'Original PDF',
    description: 'The document as uploaded.',
    meta: '4 pages · 214 KB',
    available: true,
  },
  {
    kind: 'sealed',
    icon: FileCheck2,
    title: 'Sealed PDF',
    description: 'Final signed document.',
    meta: '5 pages · 312 KB · PAdES-LT',
    available: true,
    recommended: true,
    primaryLabel: 'sealed PDF',
  },
  {
    kind: 'audit',
    icon: ShieldCheck,
    title: 'Audit trail',
    description: 'Cryptographic event log.',
    meta: 'PDF · 2 pages',
    available: true,
  },
  {
    kind: 'bundle',
    icon: Package,
    title: 'Full package',
    description: 'Sealed + audit bundled together.',
    meta: 'Available once sealed',
    available: false,
  },
];

describe('DownloadMenu', () => {
  it('renders the split-button with the recommended row as primary', () => {
    renderWithTheme(<DownloadMenu items={items} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /download sealed pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show all download options/i })).toBeInTheDocument();
  });

  it('primary button fires onSelect with the recommended kind', () => {
    const onSelect = vi.fn();
    renderWithTheme(<DownloadMenu items={items} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /download sealed pdf/i }));
    expect(onSelect).toHaveBeenCalledWith('sealed');
  });

  it('chevron opens the menu, outside click closes it', () => {
    renderWithTheme(<DownloadMenu items={items} onSelect={() => {}} />);
    const chevron = screen.getByRole('button', { name: /show all download options/i });
    fireEvent.click(chevron);
    expect(screen.getByRole('menu', { name: /download options/i })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu', { name: /download options/i })).not.toBeInTheDocument();
  });

  it('menu row fires onSelect with the row kind and closes the menu', () => {
    const onSelect = vi.fn();
    renderWithTheme(<DownloadMenu items={items} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /show all download options/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /original pdf/i }));
    expect(onSelect).toHaveBeenCalledWith('original');
    expect(screen.queryByRole('menu', { name: /download options/i })).not.toBeInTheDocument();
  });

  it('unavailable rows render a LOCKED pill and cannot be picked', () => {
    const onSelect = vi.fn();
    renderWithTheme(<DownloadMenu items={items} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /show all download options/i }));
    const bundle = screen.getByRole('menuitem', { name: /full package/i });
    expect(bundle).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('LOCKED')).toBeInTheDocument();
    fireEvent.click(bundle);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('recommended row shows a RECOMMENDED pill', () => {
    renderWithTheme(<DownloadMenu items={items} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /show all download options/i }));
    expect(screen.getByText('RECOMMENDED')).toBeInTheDocument();
  });

  it('inFlight row shows "Preparing…" in the meta line', () => {
    renderWithTheme(<DownloadMenu items={items} onSelect={() => {}} inFlight="sealed" />);
    fireEvent.click(screen.getByRole('button', { name: /show all download options/i }));
    expect(screen.getByText('Preparing…')).toBeInTheDocument();
  });

  it('Escape closes the menu', () => {
    renderWithTheme(<DownloadMenu items={items} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /show all download options/i }));
    expect(screen.getByRole('menu', { name: /download options/i })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: /download options/i })).not.toBeInTheDocument();
  });

  describe('with a "Save to Google Drive" (gdrive) row', () => {
    const gdriveItem: DownloadMenuItem = {
      kind: 'gdrive',
      icon: HardDriveUpload,
      title: 'Save to Google Drive',
      description: 'Push the sealed PDF + audit trail into a Drive folder you pick.',
      meta: 'Sends the sealed PDF + audit trail',
      busyMeta: 'Choosing a folder…',
      available: true,
      action: 'gdrive',
    };
    const withGdrive = [...items, gdriveItem];

    it('renders the gdrive row below a separator and never as the split-button primary', () => {
      renderWithTheme(<DownloadMenu items={withGdrive} onSelect={() => {}} />);
      // Primary is still the recommended download row, not the gdrive row.
      expect(screen.getByRole('button', { name: /download sealed pdf/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /show all download options/i }));
      const menu = screen.getByRole('menu', { name: /download options/i });
      expect(within(menu).getByRole('separator')).toBeInTheDocument();
      expect(
        within(menu).getByRole('menuitem', { name: /save to google drive/i }),
      ).toBeInTheDocument();
    });

    it('fires onSelect("gdrive") when the row is clicked', () => {
      const onSelect = vi.fn();
      renderWithTheme(<DownloadMenu items={withGdrive} onSelect={onSelect} />);
      fireEvent.click(screen.getByRole('button', { name: /show all download options/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: /save to google drive/i }));
      expect(onSelect).toHaveBeenCalledWith('gdrive');
    });

    it('renders the gdrive row LOCKED + unselectable when unavailable', () => {
      const onSelect = vi.fn();
      renderWithTheme(
        <DownloadMenu
          items={[...items, { ...gdriveItem, available: false }]}
          onSelect={onSelect}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /show all download options/i }));
      const row = screen.getByRole('menuitem', { name: /save to google drive/i });
      expect(row).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(row);
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('shows the gdrive busy meta when inFlight === "gdrive"', () => {
      renderWithTheme(<DownloadMenu items={withGdrive} onSelect={() => {}} inFlight="gdrive" />);
      fireEvent.click(screen.getByRole('button', { name: /show all download options/i }));
      expect(screen.getByText('Choosing a folder…')).toBeInTheDocument();
    });

    it('does not render a separator when there are no gdrive rows', () => {
      renderWithTheme(<DownloadMenu items={items} onSelect={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /show all download options/i }));
      const menu = screen.getByRole('menu', { name: /download options/i });
      expect(within(menu).queryByRole('separator')).not.toBeInTheDocument();
    });
  });
});
