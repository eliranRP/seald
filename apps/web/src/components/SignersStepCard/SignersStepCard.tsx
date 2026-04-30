import { forwardRef, useState } from 'react';
import { ArrowRight, Check, Plus, Search, X } from 'lucide-react';
import { Button } from '../Button';
import { Icon } from '../Icon';
import type { SignersStepCardProps } from './SignersStepCard.types';
import {
  AddSignerPill,
  Avatar,
  BackLink,
  Card,
  EmptyPill,
  Footer,
  Heading,
  InlinePickerAddGuestBadge,
  InlinePickerAddGuestRow,
  InlinePickerAvatar,
  InlinePickerCheck,
  InlinePickerCloseBtn,
  InlinePickerDoneButton,
  InlinePickerEmail,
  InlinePickerEmpty,
  InlinePickerFooter,
  InlinePickerHeader,
  InlinePickerInfo,
  InlinePickerList,
  InlinePickerName,
  InlinePickerRow,
  InlinePickerSearchInput,
  InlinePickerWrap,
  OrdinalChip,
  Page,
  RemoveButton,
  SignerEmail,
  SignerInfo,
  SignerList,
  SignerName,
  SignerRow,
  Subhead,
} from './SignersStepCard.styles';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function initialsOf(name: string, fallback: string): string {
  const source = name.trim() || fallback.trim();
  return source
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (part[0] ?? '').toUpperCase())
    .slice(0, 2)
    .join('');
}

/**
 * L3 page surface — Step 2 of the templates wizard. Centered card with
 * an empty-state pill, the picked-signers list (with ordinal `#1`/`#2`
 * chips so the sender can see the signing order at a glance), an
 * "Add signer" affordance that toggles to an inline contacts picker,
 * and a footer with Back link + primary "Continue" CTA.
 *
 * The inline picker is implemented in-place (not by reusing
 * `AddSignerDropdown`) because that component is built as an
 * absolute-positioned popover — it would escape this card's layout
 * and float to the viewport bottom. The design guide's inline picker
 * is a flat panel with a search header, list, and footer; replicated
 * here to match.
 */
export const SignersStepCard = forwardRef<HTMLDivElement, SignersStepCardProps>((props, ref) => {
  const {
    mode,
    signers,
    contacts,
    onPickContact,
    onCreateGuest,
    onRemoveSigner,
    onContinue,
    onBack,
    continueLabel = 'Continue',
    heading: headingOverride,
    subtitle: subtitleOverride,
    ...rest
  } = props;

  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  const trimmed = query.trim();
  const isEmail = EMAIL_RE.test(trimmed);
  const lowered = trimmed.toLowerCase();

  const filtered = trimmed
    ? contacts.filter(
        (c) => c.name.toLowerCase().includes(lowered) || c.email.toLowerCase().includes(lowered),
      )
    : contacts;

  const isContactPicked = (email: string): boolean =>
    signers.some((s) => s.email.toLowerCase() === email.toLowerCase());

  const handleAddCustom = (): void => {
    if (!isEmail) return;
    if (isContactPicked(trimmed)) {
      setQuery('');
      return;
    }
    const localPart = trimmed.split('@')[0] ?? trimmed;
    onCreateGuest(localPart, trimmed);
    setQuery('');
  };

  const heading =
    headingOverride ?? (mode === 'new' ? 'Who will sign this?' : "Who's signing this time?");
  const subtitle =
    subtitleOverride ??
    (mode === 'new'
      ? 'Pick the people who will fill this template.'
      : 'Pre-filled from last time. Adjust as needed.');

  const showAddGuestRow = isEmail && !contacts.some((c) => c.email.toLowerCase() === lowered);

  return (
    <Page>
      <Card ref={ref} {...rest}>
        <Heading>{heading}</Heading>
        <Subhead>{subtitle}</Subhead>

        {signers.length === 0 ? (
          <EmptyPill role="status">Add at least one receiver to continue.</EmptyPill>
        ) : (
          <SignerList role="list">
            {signers.map((s, i) => (
              <SignerRow key={s.id} role="listitem">
                <Avatar $color={s.color} aria-hidden>
                  {initialsOf(s.name, s.email)}
                </Avatar>
                <SignerInfo>
                  <SignerName>{s.name}</SignerName>
                  <SignerEmail>{s.email}</SignerEmail>
                </SignerInfo>
                <OrdinalChip aria-label={`Position ${String(i + 1)}`}>#{i + 1}</OrdinalChip>
                <RemoveButton
                  type="button"
                  onClick={() => onRemoveSigner(s.id)}
                  aria-label={`Remove ${s.name}`}
                >
                  <Icon icon={X} size={16} />
                </RemoveButton>
              </SignerRow>
            ))}
          </SignerList>
        )}

        {!picking ? (
          <AddSignerPill type="button" onClick={() => setPicking(true)}>
            <Icon icon={Plus} size={16} />
            Add signer
          </AddSignerPill>
        ) : (
          <InlinePickerWrap>
            <InlinePickerHeader>
              <Icon icon={Search} size={14} aria-hidden />
              <InlinePickerSearchInput
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search contacts or type an email…"
                aria-label="Search contacts or type an email"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isEmail) {
                    e.preventDefault();
                    handleAddCustom();
                  }
                  if (e.key === 'Escape') {
                    setPicking(false);
                    setQuery('');
                  }
                }}
              />
              <InlinePickerCloseBtn
                type="button"
                onClick={() => {
                  setPicking(false);
                  setQuery('');
                }}
                aria-label="Close picker"
              >
                <Icon icon={X} size={14} />
              </InlinePickerCloseBtn>
            </InlinePickerHeader>

            <InlinePickerList role="listbox" aria-label="Contacts">
              {filtered.length === 0 && !isEmail ? (
                <InlinePickerEmpty>No matches</InlinePickerEmpty>
              ) : null}

              {filtered.map((c) => {
                const checked = isContactPicked(c.email);
                return (
                  <InlinePickerRow
                    key={c.id}
                    role="option"
                    aria-selected={checked}
                    tabIndex={0}
                    onClick={() => onPickContact(c)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onPickContact(c);
                      }
                    }}
                  >
                    <InlinePickerCheck $checked={checked} aria-hidden>
                      {checked ? <Icon icon={Check} size={13} /> : null}
                    </InlinePickerCheck>
                    <InlinePickerAvatar $color={c.color} aria-hidden>
                      {initialsOf(c.name, c.email)}
                    </InlinePickerAvatar>
                    <InlinePickerInfo>
                      <InlinePickerName>{c.name}</InlinePickerName>
                      <InlinePickerEmail>{c.email}</InlinePickerEmail>
                    </InlinePickerInfo>
                  </InlinePickerRow>
                );
              })}

              {showAddGuestRow ? (
                <InlinePickerAddGuestRow
                  role="button"
                  tabIndex={0}
                  onClick={handleAddCustom}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleAddCustom();
                    }
                  }}
                >
                  <InlinePickerAddGuestBadge aria-hidden>
                    <Icon icon={Plus} size={12} />
                  </InlinePickerAddGuestBadge>
                  <span>
                    Add <strong>{trimmed}</strong> as guest signer
                  </span>
                </InlinePickerAddGuestRow>
              ) : null}
            </InlinePickerList>

            <InlinePickerFooter>
              <span>{signers.length} selected</span>
              <InlinePickerDoneButton
                type="button"
                onClick={() => {
                  setPicking(false);
                  setQuery('');
                }}
              >
                Done
              </InlinePickerDoneButton>
            </InlinePickerFooter>
          </InlinePickerWrap>
        )}

        <Footer>
          <BackLink type="button" onClick={onBack}>
            Back
          </BackLink>
          <Button
            variant="primary"
            iconRight={ArrowRight}
            disabled={signers.length === 0}
            onClick={onContinue}
          >
            {continueLabel}
          </Button>
        </Footer>
      </Card>
    </Page>
  );
});

SignersStepCard.displayName = 'SignersStepCard';
