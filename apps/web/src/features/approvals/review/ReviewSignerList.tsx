import styled from 'styled-components';
import { colorOf, initialsOf, pagesLabel, type SignerSummary } from './reviewModel';

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
`;

const Item = styled.li`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-width: 0;
`;

/** The initials badge PlacedField draws, at legend size. */
const Badge = styled.span<{ readonly $color: string }>`
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $color }) => $color};
  color: ${({ theme }) => theme.color.ink[900]};
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.bold};
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const Text = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const Name = styled.span`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  overflow-wrap: anywhere;
`;

const Detail = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export interface ReviewSignerListProps {
  readonly signers: ReadonlyArray<SignerSummary>;
  readonly label: string;
  /** Adds the pages each signer's fields are on (the summary step). */
  readonly showPages?: boolean | undefined;
}

/** Colour badge, name and field count per signer: the legend and the summary rows. */
export function ReviewSignerList({ signers, label, showPages = false }: ReviewSignerListProps) {
  return (
    <List aria-label={label}>
      {signers.map((signer) => {
        const count = `${signer.fieldCount} ${signer.fieldCount === 1 ? 'field' : 'fields'}`;
        return (
          <Item key={signer.id}>
            <Badge $color={colorOf(signer)} aria-hidden>
              {initialsOf(signer.name)}
            </Badge>
            <Text>
              <Name>{signer.name}</Name>
              <Detail>{showPages ? `${count} on ${pagesLabel(signer.pages)}` : count}</Detail>
            </Text>
          </Item>
        );
      })}
    </List>
  );
}
