import { forwardRef, useCallback, useEffect, useId } from 'react';
import { ArrowRight, Bookmark, Save, Send } from 'lucide-react';
import { Button } from '../Button';
import { Icon } from '../Icon';
import type { SendConfirmDialogProps } from './SendConfirmDialog.types';
import {
  Backdrop,
  Card,
  ChoiceButton,
  ChoiceHelp,
  ChoiceIconLeading,
  ChoiceIconTrailing,
  ChoiceLabel,
  ChoiceList,
  ChoiceText,
  FooterRow,
  Header,
  HeaderIcon,
  Subtitle,
  Title,
} from './SendConfirmDialog.styles';

/**
 * L3 modal — fired when the sender clicks Send while operating on a
 * saved template ("using" mode) and they may have moved fields around.
 * Two choice tiles stacked vertically: "Send and update template"
 * (recommended, indigo wash) vs "Just send this one" (neutral).
 *
 * Mirrors the `SendConfirmDialog` in the design guide
 * (`Design-Guide/project/templates-flow/UseTemplate.jsx`). The two
 * choices map to distinct API outcomes — the parent owns persistence:
 *
 *   onSendAndUpdate → POST /envelopes + PATCH /templates/:id
 *   onJustSend      → POST /envelopes only
 *
 * Esc / backdrop click cancels.
 */
export const SendConfirmDialog = forwardRef<HTMLDivElement, SendConfirmDialogProps>(
  (props, ref) => {
    const { open, onJustSend, onSendAndUpdate, onCancel, ...rest } = props;
    const titleId = useId();
    const descId = useId();

    useEffect(() => {
      if (!open) return undefined;
      const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    const handleBackdrop = useCallback(() => onCancel(), [onCancel]);

    if (!open) return null;

    return (
      <Backdrop role="presentation" onClick={handleBackdrop}>
        <Card
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          onClick={(e) => e.stopPropagation()}
          {...rest}
        >
          <Header>
            <HeaderIcon aria-hidden>
              <Icon icon={Bookmark} size={20} />
            </HeaderIcon>
            <div>
              <Title id={titleId}>Update the template too?</Title>
              <Subtitle id={descId}>
                Save your field changes back to the template so next time starts here.
              </Subtitle>
            </div>
          </Header>

          <ChoiceList role="group" aria-label="Send options">
            <ChoiceButton type="button" $tone="primary" onClick={onSendAndUpdate}>
              <ChoiceIconLeading $tone="primary" aria-hidden>
                <Icon icon={Save} size={18} />
              </ChoiceIconLeading>
              <ChoiceText>
                <ChoiceLabel>Send and update template</ChoiceLabel>
                <ChoiceHelp>Saves new field positions for everyone using it.</ChoiceHelp>
              </ChoiceText>
              <ChoiceIconTrailing aria-hidden>
                <Icon icon={ArrowRight} size={16} />
              </ChoiceIconTrailing>
            </ChoiceButton>

            <ChoiceButton type="button" $tone="neutral" onClick={onJustSend}>
              <ChoiceIconLeading $tone="neutral" aria-hidden>
                <Icon icon={Send} size={18} />
              </ChoiceIconLeading>
              <ChoiceText>
                <ChoiceLabel>Just send this one</ChoiceLabel>
                <ChoiceHelp>Keeps the original template untouched.</ChoiceHelp>
              </ChoiceText>
              <ChoiceIconTrailing aria-hidden>
                <Icon icon={ArrowRight} size={16} />
              </ChoiceIconTrailing>
            </ChoiceButton>
          </ChoiceList>

          <FooterRow>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </FooterRow>
        </Card>
      </Backdrop>
    );
  },
);

SendConfirmDialog.displayName = 'SendConfirmDialog';
