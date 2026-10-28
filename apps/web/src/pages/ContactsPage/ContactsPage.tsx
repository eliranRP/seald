import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  MoreHorizontal,
  Pencil,
  Search,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { MenuButton } from '@/components/Menu';
import { MWBottomSheet } from '@/components/MWBottomSheet';
import { Skeleton } from '@/components/Skeleton';
import { Toast } from '@/components/Toast';
import type { AddSignerContact } from '@/components/AddSignerDropdown/AddSignerDropdown.types';
import {
  AddContactsDialog,
  EditContactDialog,
  useBulkCreateContactsMutation,
  useDeleteContactsMutation,
  useRestoreContactsMutation,
} from '@/features/contacts';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { relativeAgo } from '@/lib/relativeAgo';
import { useAppState } from '@/providers/AppStateProvider';
import {
  BulkBar,
  BulkClear,
  BulkLabel,
  Cell,
  CheckBox,
  Count,
  DocsLink,
  Ellipsis,
  HeaderRow,
  Inner,
  Main,
  Meta,
  MobileList,
  MobileMeta,
  MobileName,
  MobileRow,
  NameCell,
  Quiet,
  Row,
  RowActions,
  SearchField,
  SheetActions,
  SheetHead,
  SkeletonRow,
  Spacer,
  SrOnly,
  THead,
  Table,
  Title,
  Toolbar,
} from './ContactsPage.styles';

type SortKey = 'last_sent' | 'name';
const SORT_STORAGE_KEY = 'seald.contacts.sort';
/** Delete acts at once; Undo stays on screen this long (rule: undo over confirm). */
const UNDO_MS = 10000;
const SKELETON_ROWS = 6;

function readSort(): SortKey {
  try {
    return window.localStorage.getItem(SORT_STORAGE_KEY) === 'name' ? 'name' : 'last_sent';
  } catch {
    return 'last_sent';
  }
}

function writeSort(sort: SortKey): void {
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, sort);
  } catch {
    /* storage can be blocked; the choice just won't be remembered */
  }
}

function sentTime(c: AddSignerContact): number {
  return c.lastSentAt ? new Date(c.lastSentAt).getTime() : Number.NEGATIVE_INFINITY;
}

/** Last sent (never-sent last, ties by name) or A to Z. */
function sortContacts(
  list: ReadonlyArray<AddSignerContact>,
  sort: SortKey,
): ReadonlyArray<AddSignerContact> {
  const byName = (a: AddSignerContact, b: AddSignerContact): number =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  return [...list].sort((a, b) => {
    if (sort === 'name') return byName(a, b);
    const diff = sentTime(b) - sentTime(a);
    return Number.isNaN(diff) || diff === 0 ? byName(a, b) : diff;
  });
}

function matches(c: AddSignerContact, q: string): boolean {
  return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
}

const EMPTY_HINT = 'People you send documents to are saved here, so you can pick them in one tap.';

function docsLabel(n: number): string {
  return `${String(n)} ${n === 1 ? 'document' : 'documents'}`;
}

interface ToastState {
  readonly title: string;
  readonly tone: 'success' | 'error';
  readonly undo?: () => void;
}

/**
 * Contacts (`/signers`): the people you send documents to. Search, sort by
 * last sent or name, a table whose documents count links to the Documents
 * list filtered to that person, a hover Send action, add-many by pasted list,
 * and select-many delete. Delete acts at once and offers Undo (contacts are
 * soft-deleted), so there is no "Are you sure?" step. On phones the table becomes a list and
 * the row actions open a bottom sheet.
 */
export function ContactsPage(): JSX.Element {
  const navigate = useNavigate();
  const isMobile = useIsMobileViewport();
  const { contacts, contactsLoading, updateContact } = useAppState();
  const bulkCreate = useBulkCreateContactsMutation();
  const deleteContacts = useDeleteContactsMutation();
  const restoreContacts = useRestoreContactsMutation();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>(readSort);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AddSignerContact | null>(null);
  const [sheetFor, setSheetFor] = useState<AddSignerContact | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => sortContacts(q ? contacts.filter((c) => matches(c, q)) : contacts, sort),
    [contacts, q, sort],
  );
  const existingEmails = useMemo(
    () => new Set(contacts.map((c) => c.email.toLowerCase())),
    [contacts],
  );
  const loading = contactsLoading && contacts.length === 0;
  const selectedCount = selected.size;
  const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(c.id));

  // Drop selected ids that are no longer listed (deleted, or filtered away).
  useEffect(() => {
    setSelected((prev) => {
      const live = new Set(contacts.map((c) => c.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [contacts]);

  // Escape empties the selection (the dialogs handle their own Escape).
  const clearSelection = useCallback((): void => {
    setSelected(new Set());
    setSelectMode(false);
  }, []);
  useEffect(() => {
    if (selectedCount === 0) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedCount, clearSelection]);

  const toggleSort = (): void => {
    const next: SortKey = sort === 'last_sent' ? 'name' : 'last_sent';
    setSort(next);
    writeSort(next);
  };

  const toggleOne = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (): void => {
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((c) => c.id)));
  };

  const sendTo = (c: AddSignerContact): void => {
    navigate(`/document/new?to=${encodeURIComponent(c.email)}`);
  };

  const openDocs = (c: AddSignerContact): string =>
    `/documents?signer=${encodeURIComponent(c.email)}`;

  const handleAdd = async (emails: ReadonlyArray<string>): Promise<void> => {
    const result = await bulkCreate.mutateAsync(emails);
    const n = result.created.length;
    setToast({
      tone: 'success',
      title: n === 1 ? 'Contact added' : `${String(n)} contacts added`,
    });
  };

  /** Put soft-deleted contacts back; a failed restore offers Undo again. */
  const undoDelete = (ids: ReadonlyArray<string>): void => {
    setToast(null);
    restoreContacts.mutate(ids, {
      onError: () =>
        setToast({
          tone: 'error',
          title: 'Could not restore. Check your connection and try again.',
          undo: () => undoDelete(ids),
        }),
    });
  };

  /** Delete now; the toast's Undo restores the soft-deleted rows. */
  const deleteNow = (targets: ReadonlyArray<AddSignerContact>): void => {
    if (targets.length === 0) return;
    const ids = targets.map((c) => c.id);
    const only = targets.length === 1 ? targets[0] : undefined;
    setSheetFor(null);
    clearSelection();
    deleteContacts.mutate(ids, {
      onSuccess: () =>
        setToast({
          tone: 'success',
          title: only ? `${only.name} deleted` : `${String(ids.length)} contacts deleted`,
          undo: () => undoDelete(ids),
        }),
      onError: () =>
        setToast({
          tone: 'error',
          title: 'Could not delete. Check your connection and try again.',
        }),
    });
  };

  const rowItems = (c: AddSignerContact) => [
    { id: 'edit', label: 'Edit', icon: Pencil, onSelect: () => setEditing(c) },
    { type: 'separator' as const, id: 'sep' },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      danger: true,
      onSelect: () => deleteNow([c]),
    },
  ];

  const sortLabel = sort === 'last_sent' ? 'Sort: Last sent' : 'Sort: Name';
  const resultsText = `${String(visible.length)} ${visible.length === 1 ? 'result' : 'results'}`;
  const isEmpty = !loading && contacts.length === 0;
  const noMatches = !loading && contacts.length > 0 && visible.length === 0;

  /** Dialogs and the toast, shared by the desktop and phone layouts. */
  const renderOverlays = (): JSX.Element => {
    return (
      <>
        <AddContactsDialog
          open={adding}
          onClose={() => setAdding(false)}
          existingEmails={existingEmails}
          onAdd={handleAdd}
        />
        <EditContactDialog
          open={editing !== null}
          contact={editing}
          contacts={contacts}
          onClose={() => setEditing(null)}
          onSave={(patch) => updateContact(editing?.id ?? '', patch)}
        />
        {toast ? (
          <Toast
            title={toast.title}
            tone={toast.tone}
            /* Errors stay until dismissed; successes (with Undo) time out. */
            {...(toast.tone === 'error' ? {} : { duration: UNDO_MS })}
            onClose={() => setToast(null)}
            {...(toast.undo ? { action: { label: 'Undo', onClick: toast.undo } } : {})}
          />
        ) : null}
      </>
    );
  };

  // ---------------------------------------------------------------- mobile
  if (isMobile) {
    return (
      <Main>
        <Inner>
          {searchOpen ? (
            <HeaderRow>
              <Button
                variant="ghost"
                iconOnly
                iconLeft={ChevronLeft}
                aria-label="Back"
                onClick={() => {
                  setSearchOpen(false);
                  setQuery('');
                }}
              />
              <SearchField>
                <Icon icon={Search} size={16} />
                <SrOnly>Search name or email</SrOnly>
                <input
                  type="search"
                  value={query}
                  autoFocus
                  placeholder="Search name or email"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </SearchField>
            </HeaderRow>
          ) : (
            <HeaderRow>
              {selectMode ? (
                <>
                  <Button
                    variant="ghost"
                    iconOnly
                    iconLeft={X}
                    aria-label="Clear selection"
                    onClick={clearSelection}
                  />
                  <Title as="h2">{`${String(selectedCount)} selected`}</Title>
                </>
              ) : (
                <>
                  <Title>Contacts</Title>
                  <Spacer />
                  <Button
                    variant="ghost"
                    iconOnly
                    iconLeft={CheckCircle2}
                    aria-label="Select contacts"
                    onClick={() => setSelectMode(true)}
                  />
                  <Button
                    variant="ghost"
                    iconOnly
                    iconLeft={Search}
                    aria-label="Search contacts"
                    onClick={() => setSearchOpen(true)}
                  />
                  <Button
                    variant="ghost"
                    iconOnly
                    iconLeft={UserPlus}
                    aria-label="Add contacts"
                    onClick={() => setAdding(true)}
                  />
                </>
              )}
            </HeaderRow>
          )}

          {contacts.length > 0 ? (
            <Toolbar>
              <Button variant="secondary" iconLeft={ArrowUpDown} onClick={toggleSort}>
                {sortLabel}
              </Button>
              <Spacer />
              <Meta>{q ? resultsText : `${String(contacts.length)} total`}</Meta>
            </Toolbar>
          ) : null}

          {loading ? (
            <div aria-busy="true" aria-label="Loading contacts">
              {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <MobileRow key={`sk-${String(i)}`} as="div" aria-hidden>
                  <Skeleton variant="circle" width={40} height={40} />
                  <MobileName>
                    <Skeleton width="60%" height={12} />
                    <Skeleton width="40%" height={10} />
                  </MobileName>
                </MobileRow>
              ))}
            </div>
          ) : null}

          {isEmpty ? (
            <EmptyState
              icon={Users}
              title="No contacts yet"
              action={
                <Button variant="primary" iconLeft={UserPlus} onClick={() => setAdding(true)}>
                  Add contacts
                </Button>
              }
            >
              {EMPTY_HINT}
            </EmptyState>
          ) : null}

          {noMatches ? (
            <EmptyState
              icon={Search}
              title="No matches"
              action={
                <Button variant="ghost" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              }
            />
          ) : null}

          {visible.length > 0 ? (
            <MobileList>
              {visible.map((c) => (
                <MobileRow
                  key={c.id}
                  type="button"
                  $selected={selected.has(c.id)}
                  aria-pressed={selectMode ? selected.has(c.id) : undefined}
                  onClick={() => (selectMode ? toggleOne(c.id) : setSheetFor(c))}
                >
                  <Avatar name={c.name} size={36} />
                  <MobileName>
                    <Ellipsis title={c.name}>{c.name}</Ellipsis>
                    <Quiet title={c.email}>{c.email}</Quiet>
                  </MobileName>
                  <MobileMeta>
                    {(c.docsCount ?? 0) === 1 ? '1 doc' : `${String(c.docsCount ?? 0)} docs`}
                  </MobileMeta>
                </MobileRow>
              ))}
            </MobileList>
          ) : null}
        </Inner>

        {selectMode ? (
          <BulkBar role="toolbar" aria-label="Selection actions">
            <BulkLabel>{`${String(selectedCount)} selected`}</BulkLabel>
            <BulkClear variant="ghost" onClick={clearSelection}>
              Clear
            </BulkClear>
            <Button
              variant="danger"
              iconLeft={Trash2}
              disabled={selectedCount === 0}
              onClick={() => deleteNow(contacts.filter((c) => selected.has(c.id)))}
            >
              {selectedCount > 0 ? `Delete ${String(selectedCount)}` : 'Delete'}
            </Button>
          </BulkBar>
        ) : null}

        <MWBottomSheet open={sheetFor !== null} onClose={() => setSheetFor(null)}>
          {sheetFor ? (
            <>
              <SheetHead>
                <Avatar name={sheetFor.name} size={36} />
                <MobileName>
                  <Ellipsis title={sheetFor.name}>{sheetFor.name}</Ellipsis>
                  <Quiet title={sheetFor.email}>{sheetFor.email}</Quiet>
                </MobileName>
              </SheetHead>
              <SheetActions>
                <Button
                  variant="ghost"
                  fullWidth
                  iconLeft={Send}
                  onClick={() => {
                    const target = sheetFor;
                    setSheetFor(null);
                    sendTo(target);
                  }}
                >
                  Send
                </Button>
                <Button
                  variant="ghost"
                  fullWidth
                  iconLeft={Pencil}
                  onClick={() => {
                    setEditing(sheetFor);
                    setSheetFor(null);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  fullWidth
                  iconLeft={Trash2}
                  onClick={() => {
                    deleteNow([sheetFor]);
                  }}
                >
                  Delete
                </Button>
              </SheetActions>
            </>
          ) : null}
        </MWBottomSheet>

        {renderOverlays()}
      </Main>
    );
  }

  // --------------------------------------------------------------- desktop
  return (
    <Main>
      <Inner>
        <HeaderRow>
          <Title>Contacts</Title>
          {loading ? (
            <Skeleton variant="circle" width={20} height={20} />
          ) : (
            <Count aria-label={`${String(contacts.length)} contacts`}>{contacts.length}</Count>
          )}
          <Spacer />
          {isEmpty || loading ? null : (
            <Button variant="primary" iconLeft={UserPlus} onClick={() => setAdding(true)}>
              Add contacts
            </Button>
          )}
        </HeaderRow>

        {isEmpty ? null : (
          <Toolbar>
            <SearchField>
              <Icon icon={Search} size={16} />
              <SrOnly>Search name or email</SrOnly>
              <input
                type="search"
                value={query}
                placeholder="Search name or email"
                onChange={(e) => setQuery(e.target.value)}
              />
            </SearchField>
            {q ? <Meta role="status">{resultsText}</Meta> : null}
            <Spacer />
            <Button variant="ghost" size="sm" iconLeft={ArrowUpDown} onClick={toggleSort}>
              {sortLabel}
            </Button>
          </Toolbar>
        )}

        {isEmpty ? (
          <Table>
            <EmptyState
              icon={Users}
              title="No contacts yet"
              action={
                <Button variant="primary" iconLeft={UserPlus} onClick={() => setAdding(true)}>
                  Add contacts
                </Button>
              }
            >
              {EMPTY_HINT}
            </EmptyState>
          </Table>
        ) : (
          <Table role="table" aria-label="Contacts" aria-busy={loading || undefined}>
            <THead role="row">
              <Cell role="columnheader">
                <CheckBox
                  type="checkbox"
                  aria-label="Select all"
                  checked={allVisibleSelected}
                  disabled={loading || visible.length === 0}
                  onChange={toggleAll}
                />
              </Cell>
              <span role="columnheader">Name</span>
              <span role="columnheader">Email</span>
              <span role="columnheader">Documents</span>
              <span role="columnheader">Last sent</span>
              <span role="columnheader" aria-label="Actions" />
            </THead>

            {loading
              ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <SkeletonRow key={`sk-${String(i)}`} aria-hidden>
                    <Skeleton variant="rect" width={16} height={16} />
                    <NameCell>
                      <Skeleton variant="circle" width={28} height={28} />
                      <Skeleton width={140} height={12} />
                    </NameCell>
                    <Skeleton width={190} height={10} />
                    <Skeleton width={70} height={10} />
                    <Skeleton width={48} height={10} />
                    <span />
                  </SkeletonRow>
                ))
              : visible.map((c) => {
                  const docs = c.docsCount ?? 0;
                  return (
                    <Row key={c.id} role="row" $selected={selected.has(c.id)}>
                      <Cell role="cell">
                        <CheckBox
                          type="checkbox"
                          aria-label={`Select ${c.name}`}
                          checked={selected.has(c.id)}
                          onChange={() => toggleOne(c.id)}
                        />
                      </Cell>
                      <NameCell role="cell">
                        <Avatar name={c.name} size={32} />
                        <Ellipsis title={c.name}>{c.name}</Ellipsis>
                      </NameCell>
                      <Quiet role="cell" title={c.email}>
                        {c.email}
                      </Quiet>
                      <Cell role="cell">
                        {docs > 0 ? (
                          <DocsLink
                            href={openDocs(c)}
                            onClick={(e) => {
                              e.preventDefault();
                              navigate(openDocs(c));
                            }}
                          >
                            {docsLabel(docs)}
                          </DocsLink>
                        ) : (
                          <Meta>{docsLabel(0)}</Meta>
                        )}
                      </Cell>
                      <Meta role="cell">{docs > 0 ? relativeAgo(c.lastSentAt) : 'never'}</Meta>
                      <RowActions role="cell">
                        <Button
                          variant="secondary"
                          size="sm"
                          iconLeft={Send}
                          aria-label={`Send to ${c.name}`}
                          onClick={() => sendTo(c)}
                        >
                          Send
                        </Button>
                        <MenuButton
                          aria-label={`Actions for ${c.name}`}
                          items={rowItems(c)}
                          trigger={(p) => (
                            <Button
                              variant="ghost"
                              size="sm"
                              iconOnly
                              iconLeft={MoreHorizontal}
                              aria-label={`More for ${c.name}`}
                              {...p}
                            />
                          )}
                        />
                      </RowActions>
                    </Row>
                  );
                })}

            {noMatches ? (
              <EmptyState
                icon={Search}
                title="No matches"
                action={
                  <Button variant="ghost" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                }
              />
            ) : null}
          </Table>
        )}
      </Inner>

      {selectedCount > 0 ? (
        <BulkBar role="toolbar" aria-label="Bulk actions">
          <BulkLabel>{`${String(selectedCount)} selected`}</BulkLabel>
          <BulkClear variant="ghost" size="sm" onClick={clearSelection}>
            Clear
          </BulkClear>
          <Button
            variant="danger"
            size="sm"
            iconLeft={Trash2}
            onClick={() => deleteNow(contacts.filter((c) => selected.has(c.id)))}
          >
            {`Delete ${String(selectedCount)}`}
          </Button>
        </BulkBar>
      ) : null}

      {renderOverlays()}
    </Main>
  );
}
