import { forwardRef } from 'react';
import { Plus, X } from 'lucide-react';
import type { SignersPanelProps, SignersPanelSigner } from './SignersPanel.types';
import {
  AddButton,
  Chip,
  ChipItem,
  ChipList,
  ChipWrap,
  Count,
  FirstName,
  Header,
  Initials,
  RemoveButton,
  Root,
  Title,
} from './SignersPanel.styles';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => (part[0] ?? '').toUpperCase())
    .slice(0, 2)
    .join('');
}

function firstName(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  return parts[0] ?? name;
}

export const SignersPanel = forwardRef<HTMLElement, SignersPanelProps>((props, ref) => {
  const {
    signers,
    onRequestAdd,
    onSelectSigner,
    onRemoveSigner,
    title = 'Signers',
    addLabel = 'Add signer',
    removeLabelPrefix = 'Remove signer',
    ...rest
  } = props;

  const handleChipClick = (id: string) => (): void => {
    onSelectSigner?.(id);
  };

  const handleRemoveClick = (id: string) => (): void => {
    onRemoveSigner?.(id);
  };

  const chipInteractive = onSelectSigner !== undefined;

  const renderChipContent = (signer: SignersPanelSigner): JSX.Element => (
    <>
      <Initials $color={signer.color} aria-hidden>
        {initials(signer.name)}
      </Initials>
      <FirstName>{firstName(signer.name)}</FirstName>
    </>
  );

  return (
    <Root {...rest} ref={ref} aria-label={title}>
      <Header>
        <Title>{title}</Title>
        <Count aria-live="polite">{signers.length}</Count>
      </Header>
      <ChipList role="list">
        {signers.map((signer) => {
          const hoverTitle = `${signer.name} · ${signer.email}`;
          const chip = chipInteractive ? (
            <Chip
              as="button"
              type="button"
              $clickable
              title={hoverTitle}
              aria-label={`${signer.name}, ${signer.email}`}
              onClick={handleChipClick(signer.id)}
            >
              {renderChipContent(signer)}
            </Chip>
          ) : (
            <Chip $clickable={false} title={hoverTitle}>
              {renderChipContent(signer)}
            </Chip>
          );
          return (
            <ChipItem key={signer.id}>
              {onRemoveSigner !== undefined ? (
                <ChipWrap>
                  {chip}
                  <RemoveButton
                    type="button"
                    aria-label={`${removeLabelPrefix} ${signer.name}`}
                    onClick={handleRemoveClick(signer.id)}
                  >
                    <X size={12} aria-hidden />
                  </RemoveButton>
                </ChipWrap>
              ) : (
                chip
              )}
            </ChipItem>
          );
        })}
        {onRequestAdd !== undefined ? (
          <ChipItem>
            <AddButton type="button" aria-label={addLabel} onClick={onRequestAdd}>
              <Plus size={14} aria-hidden />
            </AddButton>
          </ChipItem>
        ) : null}
      </ChipList>
    </Root>
  );
});

SignersPanel.displayName = 'SignersPanel';
