import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import styled from 'styled-components';

export interface DocumentSwitcherItem {
  readonly id: string;
  readonly title: string;
  /** Short status shown next to the title, e.g. "2 fields". */
  readonly meta?: string | undefined;
}

export interface DocumentSwitcherProps extends Omit<HTMLAttributes<HTMLElement>, 'onSelect'> {
  readonly documents: ReadonlyArray<DocumentSwitcherItem>;
  readonly activeId: string;
  readonly onSelect: (id: string) => void;
  /** Accessible name of the landmark. Defaults to "Switch document". */
  readonly label?: string | undefined;
}

const Nav = styled.nav`
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
  overflow-x: auto;
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[8]} 0`};
  background: ${({ theme }) => theme.color.bg.app};
`;

const Item = styled.button<{ readonly $active: boolean }>`
  display: inline-flex;
  flex: none;
  align-items: baseline;
  gap: ${({ theme }) => theme.space[2]};
  max-width: 260px;
  padding: 6px 12px;
  border-radius: ${({ theme }) => theme.radius.pill};
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.color.accent.base : theme.color.border[1])};
  background: ${({ theme, $active }) =>
    $active ? theme.color.accent.subtle : theme.color.bg.surface};
  color: ${({ theme }) => theme.color.fg[1]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ $active, theme }) =>
    $active ? theme.font.weight.semibold : theme.font.weight.medium};
  cursor: pointer;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

const Title = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Meta = styled.span`
  flex: none;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

/**
 * Strip above the editor canvas that switches which document of a
 * multi-document draft the canvas shows (WP-04). Native buttons keep Tab /
 * Enter / Space working; the current one carries `aria-current`.
 */
export const DocumentSwitcher = forwardRef<HTMLElement, DocumentSwitcherProps>((props, ref) => {
  const { documents, activeId, onSelect, label = 'Switch document', ...rest } = props;
  return (
    <Nav {...rest} ref={ref} aria-label={label}>
      {documents.map((doc, index) => {
        const active = doc.id === activeId;
        return (
          <Item
            key={doc.id}
            type="button"
            $active={active}
            aria-current={active ? 'true' : undefined}
            title={doc.title}
            onClick={() => onSelect(doc.id)}
          >
            <Title>
              {index + 1}. {doc.title}
            </Title>
            {doc.meta !== undefined ? <Meta>{doc.meta}</Meta> : null}
          </Item>
        );
      })}
    </Nav>
  );
});

DocumentSwitcher.displayName = 'DocumentSwitcher';
