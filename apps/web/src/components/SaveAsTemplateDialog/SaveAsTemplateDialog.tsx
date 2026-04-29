import { forwardRef, useEffect, useId, useState } from 'react';
import { Button } from '../Button';
import { TextField } from '../TextField';
import type { SaveAsTemplateDialogProps } from './SaveAsTemplateDialog.types';
import {
  Backdrop,
  Card,
  Description,
  FieldGroup,
  Footer,
  Textarea,
  Title,
} from './SaveAsTemplateDialog.styles';

/**
 * L3 widget — modal that prompts for a title + description when the signer
 * (or sender, depending on the call site) wants to convert the document
 * they just finished into a reusable template. The dialog only collects
 * input; the parent handles persistence so the same surface can later be
 * wired to either the local templates store or a server-side templates API.
 *
 * Esc cancels. Submitting the form fires `onSave` only when the title is
 * non-empty (the Save button stays disabled otherwise).
 */
export const SaveAsTemplateDialog = forwardRef<HTMLFormElement, SaveAsTemplateDialogProps>(
  (props, ref) => {
    const { open, defaultTitle = '', defaultDescription = '', onSave, onCancel, ...rest } = props;
    const [title, setTitle] = useState(defaultTitle);
    const [description, setDescription] = useState(defaultDescription);
    const titleId = useId();
    const descId = useId();
    const descFieldId = useId();

    useEffect(() => {
      if (!open) return;
      setTitle(defaultTitle);
      setDescription(defaultDescription);
    }, [open, defaultTitle, defaultDescription]);

    useEffect(() => {
      if (!open) return undefined;
      const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      };
      window.addEventListener('keydown', onKey);
      return () => {
        window.removeEventListener('keydown', onKey);
      };
    }, [open, onCancel]);

    if (!open) return null;

    const trimmedTitle = title.trim();
    const canSave = trimmedTitle.length > 0;

    function handleSubmit(e: React.FormEvent): void {
      e.preventDefault();
      if (!canSave) return;
      onSave({ title: trimmedTitle, description: description.trim() });
    }

    return (
      <Backdrop role="presentation" onClick={onCancel}>
        <Card
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          onClick={(e) => e.stopPropagation()}
          onSubmit={handleSubmit}
          {...rest}
        >
          <Title id={titleId}>Save as template</Title>
          <Description id={descId}>
            Templates remember the field layout so you can reuse it on a new PDF without redoing the
            placements.
          </Description>

          <TextField
            label="Template name"
            placeholder="e.g. Mutual NDA — short form"
            value={title}
            onChange={(v) => setTitle(v)}
            autoFocus
            required
          />

          <FieldGroup htmlFor={descFieldId}>
            Description (optional)
            <Textarea
              id={descFieldId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this template used for?"
            />
          </FieldGroup>

          <Footer>
            <Button variant="ghost" type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={!canSave}>
              Save template
            </Button>
          </Footer>
        </Card>
      </Backdrop>
    );
  },
);

SaveAsTemplateDialog.displayName = 'SaveAsTemplateDialog';
