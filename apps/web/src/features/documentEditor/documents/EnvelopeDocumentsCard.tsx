import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, Download, Package, X } from 'lucide-react';
import styled from 'styled-components';
import type { EnvelopeDocument } from 'shared';
import { Button } from '@/components/Button';

export interface EnvelopeDocumentsCardProps extends HTMLAttributes<HTMLElement> {
  readonly documents: ReadonlyArray<EnvelopeDocument>;
  /** True once the envelope is sealed: the per-document file is then the sealed PDF. */
  readonly sealed: boolean;
  /** Document id (or `'zip'`) whose download is being prepared. */
  readonly busyId?: string | null | undefined;
  readonly onDownload: (doc: EnvelopeDocument) => void;
  /** "Download all (zip)". Only offered once sealed. */
  readonly onDownloadAll?: (() => void) | undefined;
  /** Draft envelopes only: reorder / remove through the documents API. */
  readonly onMove?: ((id: string, direction: 'up' | 'down') => void) | undefined;
  readonly onRemove?: ((id: string) => void) | undefined;
}

const Root = styled.section`
  padding: ${({ theme }) => theme.space[5]};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[2]};
  margin-bottom: ${({ theme }) => theme.space[3]};
`;

const Heading = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const List = styled.ol`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
  margin: 0;
  padding: 0;
  list-style: none;
`;

const Item = styled.li`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  padding-top: ${({ theme }) => theme.space[3]};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  &:first-child {
    padding-top: 0;
    border-top: none;
  }
`;

const ItemHead = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

const Title = styled.span`
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const Pages = styled.span`
  flex: none;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

const Hashes = styled.dl`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px ${({ theme }) => theme.space[2]};
  margin: 0;
`;

const HashKey = styled.dt`
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

const HashVal = styled.dd`
  margin: 0;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[2]};
  word-break: break-all;
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
`;

const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: ${({ theme }) => theme.radius.xs};
  background: transparent;
  color: ${({ theme }) => theme.color.fg[3]};
  cursor: pointer;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.bg.subtle};
    color: ${({ theme }) => theme.color.fg[1]};
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

/**
 * Documents of an envelope on the sender's detail page (WP-04): one row per
 * PDF with its page count, SHA-256 hashes and a download, plus "Download
 * all (zip)" once the envelope is sealed. Drafts can also reorder / remove
 * through the optional handlers. Rows are keyed by document id.
 */
export const EnvelopeDocumentsCard = forwardRef<HTMLElement, EnvelopeDocumentsCardProps>(
  (props, ref) => {
    const { documents, sealed, busyId, onDownload, onDownloadAll, onMove, onRemove, ...rest } =
      props;
    const total = documents.length;
    const editable = onMove !== undefined || onRemove !== undefined;
    return (
      <Root {...rest} ref={ref} aria-label="Documents in this envelope">
        <Head>
          <Heading>Documents ({total})</Heading>
          {sealed && onDownloadAll ? (
            <Button
              variant="secondary"
              size="sm"
              iconLeft={Package}
              loading={busyId === 'zip'}
              onClick={onDownloadAll}
            >
              Download all (zip)
            </Button>
          ) : null}
        </Head>
        <List>
          {documents.map((doc, index) => (
            <Item key={doc.id}>
              <ItemHead>
                <Title title={doc.title}>{doc.title}</Title>
                <Pages>
                  {doc.original_pages === null
                    ? '—'
                    : `${String(doc.original_pages)} ${doc.original_pages === 1 ? 'page' : 'pages'}`}
                </Pages>
              </ItemHead>
              <Hashes>
                {doc.original_sha256 ? (
                  <>
                    <HashKey>Original</HashKey>
                    <HashVal aria-label={`Original SHA-256 of ${doc.title}`}>
                      {doc.original_sha256}
                    </HashVal>
                  </>
                ) : null}
                {doc.sealed_sha256 ? (
                  <>
                    <HashKey>Sealed</HashKey>
                    <HashVal aria-label={`Sealed SHA-256 of ${doc.title}`}>
                      {doc.sealed_sha256}
                    </HashVal>
                  </>
                ) : null}
              </Hashes>
              <Actions>
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={Download}
                  loading={busyId === doc.id}
                  disabled={doc.original_pages === null && !sealed}
                  aria-label={`Download ${sealed ? 'sealed' : 'original'} ${doc.title}`}
                  onClick={() => onDownload(doc)}
                >
                  {sealed ? 'Sealed PDF' : 'Original PDF'}
                </Button>
                {editable ? (
                  <>
                    {onMove ? (
                      <>
                        <IconButton
                          type="button"
                          aria-label={`Move ${doc.title} up`}
                          disabled={index === 0}
                          onClick={() => onMove(doc.id, 'up')}
                        >
                          <ArrowUp size={14} aria-hidden />
                        </IconButton>
                        <IconButton
                          type="button"
                          aria-label={`Move ${doc.title} down`}
                          disabled={index === total - 1}
                          onClick={() => onMove(doc.id, 'down')}
                        >
                          <ArrowDown size={14} aria-hidden />
                        </IconButton>
                      </>
                    ) : null}
                    {onRemove && total > 1 ? (
                      <IconButton
                        type="button"
                        aria-label={`Remove ${doc.title}`}
                        onClick={() => onRemove(doc.id)}
                      >
                        <X size={14} aria-hidden />
                      </IconButton>
                    ) : null}
                  </>
                ) : null}
              </Actions>
            </Item>
          ))}
        </List>
      </Root>
    );
  },
);

EnvelopeDocumentsCard.displayName = 'EnvelopeDocumentsCard';
