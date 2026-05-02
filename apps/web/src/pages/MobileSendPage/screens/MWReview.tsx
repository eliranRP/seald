import { FileText } from 'lucide-react';
import styled from 'styled-components';
import type { MobilePlacedField, MobileSigner } from '../types';

const Wrap = styled.div`
  padding: 4px 16px 24px;
`;

const Card = styled.div`
  background: #fff;
  border: 1px solid var(--border-1);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 10px;
`;

const Eyebrow = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: var(--fg-3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
`;

const TitleInput = styled.input`
  width: 100%;
  border: none;
  outline: none;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 18px;
  font-weight: 500;
  color: var(--fg-1);
  letter-spacing: -0.01em;
  background: transparent;
  font: inherit;

  &:focus {
    outline: none;
  }
`;

const DocRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const Thumb = styled.span`
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--ink-100);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--fg-3);
  flex-shrink: 0;
`;

const DocTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-1);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const DocMeta = styled.div`
  font-size: 12px;
  color: var(--fg-3);
  font-family: ${({ theme }) => theme.font.mono};
  margin-top: 2px;
`;

const SignerRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
`;

const Avatar = styled.span<{ $color: string }>`
  width: 32px;
  height: 32px;
  border-radius: 16px;
  background: ${({ $color }) => $color};
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const Info = styled.div`
  flex: 1;
  min-width: 0;
`;

const Name = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-1);
`;

const Email = styled.div`
  font-size: 12px;
  color: var(--fg-3);
`;

const Pill = styled.span`
  background: var(--indigo-50);
  color: var(--indigo-700);
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 8px;
`;

export interface MWReviewProps {
  readonly title: string;
  readonly onTitle: (s: string) => void;
  readonly signers: ReadonlyArray<MobileSigner>;
  readonly fields: ReadonlyArray<MobilePlacedField>;
  readonly fileName: string;
  readonly totalPages: number;
}

export function MWReview(props: MWReviewProps) {
  const { title, onTitle, signers, fields, fileName, totalPages } = props;
  const counts = new Map<string, number>();
  signers.forEach((s) => counts.set(s.id, 0));
  fields.forEach((f) => {
    const pageCount = Math.max(1, f.linkedPages.length);
    f.signerIds.forEach((sid) => {
      counts.set(sid, (counts.get(sid) ?? 0) + pageCount);
    });
  });
  return (
    <Wrap>
      <Card>
        <Eyebrow>Title</Eyebrow>
        <TitleInput
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          aria-label="Document title"
        />
      </Card>
      <Card>
        <DocRow>
          <Thumb aria-hidden>
            <FileText size={18} />
          </Thumb>
          <Info>
            <DocTitle>{fileName}</DocTitle>
            <DocMeta>
              {totalPages} {totalPages === 1 ? 'page' : 'pages'} · {fields.length} fields ·{' '}
              {signers.length} {signers.length === 1 ? 'signer' : 'signers'}
            </DocMeta>
          </Info>
        </DocRow>
        {signers.map((s) => (
          <SignerRow key={s.id}>
            <Avatar $color={s.color} aria-hidden>
              {s.initials}
            </Avatar>
            <Info>
              <Name>{s.name}</Name>
              <Email>{s.email}</Email>
            </Info>
            <Pill aria-label={`${counts.get(s.id) ?? 0} fields for ${s.name}`}>
              {counts.get(s.id) ?? 0} fields
            </Pill>
          </SignerRow>
        ))}
      </Card>
    </Wrap>
  );
}
