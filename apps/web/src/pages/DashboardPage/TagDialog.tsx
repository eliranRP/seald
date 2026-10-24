import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/Button';
import {
  DialogBackdrop,
  DialogCard,
  DialogFooter,
  DialogTitle,
} from '@/components/DialogPrimitives';
import { TextField } from '@/components/TextField';
import { useEscapeKey } from '@/hooks/useEscapeKey';

export interface TagDialogProps {
  readonly count: number;
  readonly onCancel: () => void;
  readonly onSave: (tag: string) => void;
}

/** One text field: the tag to add to the chosen documents. */
export function TagDialog({ count, onCancel, onSave }: TagDialogProps) {
  const titleId = useId();
  const [tag, setTag] = useState('');
  useEscapeKey(onCancel, true);

  function submit(e: FormEvent): void {
    e.preventDefault();
    if (tag.trim() !== '') onSave(tag.trim());
  }

  return (
    <DialogBackdrop role="presentation" onClick={onCancel}>
      <DialogCard
        as="form"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <DialogTitle id={titleId}>
          {count === 1 ? 'Add tag' : `Add tag to ${count} documents`}
        </DialogTitle>
        <TextField label="Tag" value={tag} onChange={(v) => setTag(v)} maxLength={32} autoFocus />
        <DialogFooter>
          <Button variant="ghost" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={tag.trim() === ''}>
            Add
          </Button>
        </DialogFooter>
      </DialogCard>
    </DialogBackdrop>
  );
}
