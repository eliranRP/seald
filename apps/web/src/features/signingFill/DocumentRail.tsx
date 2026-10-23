import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { Check } from 'lucide-react';
import styled from 'styled-components';
import type { SignMeDocument, SignMeField } from '@/features/signing';
import { useT } from '@/lib/i18n';

export interface DocumentRailItem {
  readonly id: string;
  readonly title: string;
  /** Required fields on this document that are still empty. */
  readonly remaining: number;
  /** Fields the signer has on this document. */
  readonly total: number;
}

export interface DocumentRailProps extends Omit<HTMLAttributes<HTMLElement>, 'onSelect'> {
  readonly documents: ReadonlyArray<DocumentRailItem>;
  readonly activeId: string;
  readonly onSelect: (id: string) => void;
}

const Nav = styled.nav`
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
  overflow-x: auto;
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[4]}`};
  background: ${({ theme }) => theme.color.bg.surface};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
`;

const Item = styled.button<{ readonly $active: boolean }>`
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  max-width: 280px;
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

const Status = styled.span<{ readonly $done: boolean }>`
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: ${({ theme, $done }) => ($done ? theme.color.success[700] : theme.color.fg[3])};
`;

/**
 * Per-document status for the signer's rail: for each document, how many
 * required fields are still empty. Documents the signer has no fields on
 * stay in the list (they can still be read) with a zero count.
 */
export function summarizeDocuments(
  documents: ReadonlyArray<SignMeDocument>,
  fields: ReadonlyArray<SignMeField>,
  isFilled: (field: SignMeField) => boolean,
): DocumentRailItem[] {
  const remaining = new Map<string, number>();
  const total = new Map<string, number>();
  for (const f of fields) {
    if (f.document_id === undefined) continue;
    total.set(f.document_id, (total.get(f.document_id) ?? 0) + 1);
    if (f.required && !isFilled(f)) {
      remaining.set(f.document_id, (remaining.get(f.document_id) ?? 0) + 1);
    }
  }
  return documents.map((d) => ({
    id: d.id,
    title: d.title,
    remaining: remaining.get(d.id) ?? 0,
    total: total.get(d.id) ?? 0,
  }));
}

/**
 * Rail above the signer's canvas on a multi-document envelope (WP-04): one
 * button per document with how much is left on it. Native buttons keep Tab
 * / Enter working; the current document carries `aria-current`. The page
 * pairs it with a "Next field" that crosses documents.
 */
export const DocumentRail = forwardRef<HTMLElement, DocumentRailProps>((props, ref) => {
  const { documents, activeId, onSelect, ...rest } = props;
  const t = useT();
  return (
    <Nav {...rest} ref={ref} aria-label={t('signing.rail.documentsToSign')}>
      {documents.map((doc, index) => {
        const active = doc.id === activeId;
        const done = doc.total > 0 && doc.remaining === 0;
        let status = '';
        if (doc.total === 0) status = t('signing.rail.nothingToFill');
        else if (done) status = t('signing.rail.done');
        else status = t('signing.rail.left', { count: doc.remaining });
        return (
          <Item
            key={doc.id}
            type="button"
            $active={active}
            aria-current={active ? 'true' : undefined}
            aria-label={t('signing.rail.itemAria', {
              title: doc.title,
              index: index + 1,
              total: documents.length,
              status,
            })}
            onClick={() => onSelect(doc.id)}
          >
            <Title>
              {index + 1}. {doc.title}
            </Title>
            <Status $done={done}>
              {done ? <Check size={12} aria-hidden /> : null}
              {status}
            </Status>
          </Item>
        );
      })}
    </Nav>
  );
});

DocumentRail.displayName = 'DocumentRail';
