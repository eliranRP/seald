import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, JSX, KeyboardEvent } from 'react';
import { ChevronDown, Search as SearchIcon, UserPlus } from 'lucide-react';
import { isEmailShape } from 'shared';
import { Avatar } from '../Avatar';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { TextField } from '../TextField';
import type { PersonPickerProps } from './PersonPicker.types';
import {
  Chevron,
  Empty,
  ErrorText,
  List,
  NewFields,
  NewRow,
  Option,
  Panel,
  PersonMeta,
  PersonName,
  Placeholder,
  Root,
  Search,
  Sep,
  Trigger,
  Two,
} from './PersonPicker.styles';

function matches(p: { name: string; email: string }, q: string): boolean {
  return p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q);
}

/**
 * L2 widget: choose who fills a role. Shows the person (avatar, name, email)
 * or a dashed "Choose a person"; opens a searchable list with an inline
 * "+ New email" row that saves a contact and picks it. Escape closes only the
 * list, so it can sit inside a dialog.
 */
export function PersonPicker(props: PersonPickerProps): JSX.Element {
  const {
    value,
    options,
    onChange,
    onCreate,
    'aria-label': ariaLabel,
    disabledIds = [],
    youId,
    inline = false,
  } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const close = (): void => {
    setOpen(false);
    setQuery('');
    setAdding(false);
    setEmail('');
    setCreateError(null);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => (q ? options.filter((o) => matches(o, q)) : options), [options, q]);
  const blocked = useMemo(() => new Set(disabledIds), [disabledIds]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      close();
      triggerRef.current?.focus();
    }
  };

  const pick = (person: (typeof options)[number]): void => {
    onChange(person);
    close();
    triggerRef.current?.focus();
  };

  const submitNew = (e: FormEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    const next = email.trim().toLowerCase();
    if (!isEmailShape(next)) {
      setCreateError('Enter a valid email address.');
      return;
    }
    const existing = options.find((o) => o.email.toLowerCase() === next);
    if (existing) {
      pick(existing);
      return;
    }
    if (!onCreate) return;
    setBusy(true);
    setCreateError(null);
    onCreate(next)
      .then(pick)
      .catch(() => setCreateError('Could not add this person. Try again.'))
      .finally(() => setBusy(false));
  };

  const secondLine = (p: { id: string; email: string }): string =>
    youId !== undefined && p.id === youId ? 'Your account' : p.email;

  return (
    <Root ref={rootRef} onKeyDown={onKeyDown}>
      <Trigger
        ref={triggerRef}
        type="button"
        $open={open}
        $empty={value === null}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {value ? (
          <>
            <Avatar name={value.name} size={32} />
            <Two>
              <PersonName>{value.name}</PersonName>
              <PersonMeta>{secondLine(value)}</PersonMeta>
            </Two>
          </>
        ) : (
          <>
            <Icon icon={UserPlus} size={16} />
            <Placeholder>Choose a person</Placeholder>
          </>
        )}
        <Chevron aria-hidden>
          <ChevronDown size={16} />
        </Chevron>
      </Trigger>

      {open ? (
        <Panel $inline={inline}>
          <Search>
            <SearchIcon size={16} aria-hidden />
            <input
              type="search"
              autoFocus
              value={query}
              placeholder="Search contacts"
              aria-label="Search contacts"
              onChange={(e) => setQuery(e.target.value)}
            />
          </Search>
          <List id={listId} role="listbox" aria-label={ariaLabel}>
            {shown.length === 0 ? <Empty>No contacts match</Empty> : null}
            {shown.map((o) => {
              const taken = blocked.has(o.id) && o.id !== value?.id;
              return (
                <Option
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={o.id === value?.id}
                  $selected={o.id === value?.id}
                  disabled={taken}
                  title={taken ? 'Already chosen for another role' : undefined}
                  onClick={() => pick(o)}
                >
                  <Avatar name={o.name} size={32} />
                  <Two>
                    <PersonName>{o.name}</PersonName>
                    <PersonMeta>{secondLine(o)}</PersonMeta>
                  </Two>
                </Option>
              );
            })}
          </List>
          {onCreate ? (
            <>
              <Sep role="separator" />
              {adding ? (
                <NewRow noValidate onSubmit={submitNew} aria-label="Add a person by email">
                  <NewFields>
                    <TextField
                      type="email"
                      aria-label="New email"
                      placeholder="name@company.com"
                      value={email}
                      autoFocus
                      onChange={(v) => {
                        setEmail(v);
                        setCreateError(null);
                      }}
                    />
                    <Button type="submit" variant="primary" loading={busy}>
                      Add
                    </Button>
                  </NewFields>
                  {createError ? <ErrorText role="alert">{createError}</ErrorText> : null}
                </NewRow>
              ) : (
                <Button
                  variant="ghost"
                  iconLeft={UserPlus}
                  fullWidth
                  onClick={() => setAdding(true)}
                >
                  New email
                </Button>
              )}
            </>
          ) : null}
        </Panel>
      ) : null}
    </Root>
  );
}
