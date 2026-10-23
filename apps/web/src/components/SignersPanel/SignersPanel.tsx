import { forwardRef } from 'react';
import { Plus, X } from 'lucide-react';
import type { SignersPanelProps } from './SignersPanel.types';
import {
  AddButton,
  Count,
  Header,
  Info,
  Initials,
  List,
  Meta,
  Name,
  OrderNum,
  RemoveButton,
  Root,
  Row,
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

/**
 * The signer list of the Prepare screen: one row per person with a colour
 * avatar (initials), name, email and a remove button. The sender's own row
 * reads "You". Rows can show their signing order.
 */
export const SignersPanel = forwardRef<HTMLElement, SignersPanelProps>((props, ref) => {
  const {
    signers,
    onRequestAdd,
    onSelectSigner,
    onRemoveSigner,
    title = 'Signers',
    addLabel = 'Add signer',
    removeLabelPrefix = 'Remove signer',
    youId,
    showOrder = false,
    ...rest
  } = props;

  const interactive = onSelectSigner !== undefined;

  return (
    <Root {...rest} ref={ref} aria-label={title}>
      <Header>
        <Title>{title}</Title>
        <Count aria-live="polite">{signers.length}</Count>
      </Header>
      <List role="list">
        {signers.map((signer, i) => {
          const isYou = signer.id === youId;
          const displayName = isYou ? 'You' : signer.name;
          const text = (
            <>
              <Name>{displayName}</Name>
              <Meta>{signer.email}</Meta>
            </>
          );
          return (
            <Row key={signer.id} $index={i}>
              {showOrder ? (
                <OrderNum aria-label={`Signs number ${String(i + 1)}`}>{i + 1}</OrderNum>
              ) : null}
              <Initials $color={signer.color} aria-hidden>
                {initials(signer.name)}
              </Initials>
              {interactive ? (
                <Info
                  as="button"
                  type="button"
                  $clickable
                  title={`${signer.name} · ${signer.email}`}
                  aria-label={`${signer.name}, ${signer.email}`}
                  onClick={() => onSelectSigner(signer.id)}
                >
                  {text}
                </Info>
              ) : (
                <Info $clickable={false} title={`${signer.name} · ${signer.email}`}>
                  {text}
                </Info>
              )}
              {onRemoveSigner !== undefined ? (
                <RemoveButton
                  type="button"
                  aria-label={`${removeLabelPrefix} ${signer.name}`}
                  onClick={() => onRemoveSigner(signer.id)}
                >
                  <X size={16} aria-hidden />
                </RemoveButton>
              ) : null}
            </Row>
          );
        })}
      </List>
      {onRequestAdd !== undefined ? (
        <AddButton type="button" aria-label={addLabel} onClick={onRequestAdd}>
          <Plus size={14} aria-hidden />
          {addLabel}
        </AddButton>
      ) : null}
    </Root>
  );
});

SignersPanel.displayName = 'SignersPanel';
