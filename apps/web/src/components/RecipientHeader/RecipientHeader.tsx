import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { X as XIcon } from 'lucide-react';
import { Icon } from '../Icon';
import type { RecipientHeaderProps } from './RecipientHeader.types';
import {
  Divider,
  ExitButton,
  Header,
  LogoSlot,
  Meta,
  MiddleStack,
  StepChip,
  Title,
} from './RecipientHeader.styles';

/**
 * The Sealed quill/seal mark. Inlined (rather than imported as an SVG asset) so
 * it inherits `color: currentColor` and travels with the component in any
 * Storybook/test environment without needing an asset pipeline.
 */
function SealedMark(): ReactNode {
  return (
    <svg viewBox="0 0 40 40" width="18" height="18" fill="none" aria-hidden="true">
      <g transform="translate(6, 6)">
        <path
          d="M2 22 C 6 20, 10 14, 14 12 L 22 4 L 26 8 L 18 16 C 16 20, 10 24, 4 26 Z"
          fill="currentColor"
        />
        <path
          d="M22 4 L 24 2 C 25 1, 26.5 1, 27.5 2 L 28 2.5 C 29 3.5, 29 5, 28 6 L 26 8 Z"
          fill="currentColor"
          opacity="0.7"
        />
        <path
          d="M0 28 C 8 26, 18 26, 28 28"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.85"
        />
      </g>
    </svg>
  );
}

export const RecipientHeader = forwardRef<HTMLElement, RecipientHeaderProps>((props, ref) => {
  const { docTitle, docId, senderName, stepLabel, onExit, logo, ...rest } = props;

  const logoNode: ReactNode = logo ?? <SealedMark />;

  return (
    <Header {...rest} ref={ref}>
      <LogoSlot>{logoNode}</LogoSlot>
      <Divider aria-hidden="true" />
      <MiddleStack>
        <Title>{docTitle}</Title>
        <Meta>
          {senderName !== undefined && senderName !== '' ? (
            <>
              From {senderName} · {docId}
            </>
          ) : (
            docId
          )}
        </Meta>
      </MiddleStack>
      {stepLabel !== undefined && stepLabel !== '' ? <StepChip>{stepLabel}</StepChip> : null}
      {onExit ? (
        <ExitButton type="button" aria-label="Exit" onClick={onExit}>
          <Icon icon={XIcon} size={16} />
        </ExitButton>
      ) : null}
    </Header>
  );
});

RecipientHeader.displayName = 'RecipientHeader';
