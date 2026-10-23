import { Button } from '@/components/Button';
import { CardItem, CardLine, CardTitle, Cards, Section, SectionTitle } from './automations.styles';
import type { RecipeCard } from './model';

export interface RecipeGalleryProps {
  readonly cards: readonly RecipeCard[];
  readonly heading: string;
  /** The card whose create is in flight. Its button shows a spinner and the rest wait. */
  readonly busyId?: string | null | undefined;
  readonly onUse: (card: RecipeCard) => void;
}

/** One short line per recipe and "Use this". With no automations yet this is the empty state. */
export function RecipeGallery({ cards, heading, busyId = null, onUse }: RecipeGalleryProps) {
  return (
    <Section aria-labelledby="automation-gallery-title">
      <SectionTitle id="automation-gallery-title">{heading}</SectionTitle>
      <Cards>
        {cards.map((card) => (
          <CardItem key={card.id}>
            <div>
              <CardTitle>{card.title}</CardTitle>
              <CardLine>{card.line}</CardLine>
            </div>
            <Button
              variant="secondary"
              aria-label={`Use this: ${card.title}`}
              loading={busyId === card.id}
              disabled={busyId !== null && busyId !== card.id}
              onClick={() => {
                onUse(card);
              }}
            >
              Use this
            </Button>
          </CardItem>
        ))}
      </Cards>
    </Section>
  );
}
