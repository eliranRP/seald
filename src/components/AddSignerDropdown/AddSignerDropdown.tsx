import { forwardRef, useId, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '../Button';
import type { AddSignerContact, AddSignerDropdownProps } from './AddSignerDropdown.types';
import {
  CreateFooter,
  CreateHint,
  Email,
  EmptyHint,
  Initials,
  List,
  Name,
  OptionButton,
  Root,
  RowBody,
  SearchInput,
  SearchWrap,
} from './AddSignerDropdown.styles';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_PLACEHOLDER = 'Search contacts or type an email…';
const DEFAULT_MAX_RESULTS = 8;

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => (part[0] ?? '').toUpperCase())
    .slice(0, 2)
    .join('');
}

export const AddSignerDropdown = forwardRef<HTMLDivElement, AddSignerDropdownProps>(
  (props, ref) => {
    const {
      contacts,
      existingContactIds,
      onPick,
      onCreate,
      onClose,
      placeholder = DEFAULT_PLACEHOLDER,
      maxResults = DEFAULT_MAX_RESULTS,
      autoFocus = true,
      onKeyDown,
      ...rest
    } = props;

    const [query, setQuery] = useState('');
    const listId = useId();

    const trimmed = query.trim();
    const lowered = trimmed.toLowerCase();

    const filtered = useMemo(() => {
      const excluded = existingContactIds ?? [];
      const q = query.toLowerCase();
      return contacts.filter((c) => {
        if (excluded.includes(c.id)) return false;
        return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
      });
    }, [contacts, existingContactIds, query]);

    const visible = filtered.slice(0, maxResults);
    const isEmail = EMAIL_RE.test(trimmed);
    const noExactMatch = !contacts.some((c) => c.email.toLowerCase() === lowered);
    const showCreate = isEmail && noExactMatch;
    const showEmptyHint = filtered.length === 0 && !isEmail;

    const handleRootKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
      onKeyDown?.(e);
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation();
        onClose();
      }
    };

    const handleCreate = (): void => {
      const localPart = trimmed.split('@')[0] ?? '';
      onCreate(localPart, trimmed);
    };

    return (
      <Root
        {...rest}
        ref={ref}
        onKeyDown={handleRootKeyDown}
        role="combobox"
        aria-expanded="true"
        aria-haspopup="listbox"
        aria-controls={listId}
      >
        <SearchWrap>
          <SearchInput
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            role="searchbox"
            autoFocus={autoFocus}
          />
        </SearchWrap>
        <List id={listId} role="listbox">
          {visible.map((c: AddSignerContact) => (
            <OptionButton
              key={c.id}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => onPick(c)}
            >
              <Initials $color={c.color} aria-hidden>
                {initialsOf(c.name)}
              </Initials>
              <RowBody>
                <Name>{c.name}</Name>
                <Email>{c.email}</Email>
              </RowBody>
            </OptionButton>
          ))}
          {showEmptyHint ? (
            <EmptyHint>Type a name or email to search your contacts.</EmptyHint>
          ) : null}
        </List>
        {showCreate ? (
          <CreateFooter>
            <CreateHint>Not in your contacts.</CreateHint>
            <Button
              variant="primary"
              size="sm"
              iconLeft={UserPlus}
              fullWidth
              onClick={handleCreate}
            >
              {`Add "${trimmed}" as new contact`}
            </Button>
          </CreateFooter>
        ) : null}
      </Root>
    );
  },
);

AddSignerDropdown.displayName = 'AddSignerDropdown';
