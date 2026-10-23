import { forwardRef, useEffect, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import type { TemplateFlowHeaderProps } from './TemplateFlowHeader.types';
import {
  Actions,
  Bar,
  Meta,
  ModePill,
  NameBlock,
  NameButton,
  NameInput,
} from './TemplateFlowHeader.styles';

/**
 * Top bar of the template editor (canvas `.flowbar`): a close button, the
 * template name (click to rename; Enter or blur saves, Escape reverts) with a
 * quiet page count, a "Template" pill, and Cancel plus the primary
 * "Save template" on the right.
 */
export const TemplateFlowHeader = forwardRef<HTMLElement, TemplateFlowHeaderProps>((props, ref) => {
  const {
    mode,
    templateName,
    meta,
    onRenameTemplate,
    onCancel,
    onSave,
    saveLabel = 'Save template',
    saving = false,
    ...rest
  } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(templateName);

  // Follow the canonical name unless the person is typing.
  useEffect(() => {
    if (!editing) setDraft(templateName);
  }, [templateName, editing]);

  const editable = Boolean(onRenameTemplate);

  function commit(): void {
    const next = draft.trim();
    if (next && next !== templateName && onRenameTemplate) onRenameTemplate(next);
    else setDraft(templateName);
    setEditing(false);
  }

  return (
    <Bar ref={ref} {...rest}>
      {onCancel ? (
        <Button
          variant="ghost"
          iconOnly
          iconLeft={X}
          aria-label="Close and go back to templates"
          onClick={onCancel}
        />
      ) : null}

      <NameBlock>
        {editing ? (
          <NameInput
            autoFocus
            value={draft}
            aria-label="Template name"
            onChange={(e) => {
              const next = e.target.value;
              setDraft(next);
              // Forward each keystroke so the host can autosave (it debounces
              // and skips empty names); blur or Enter then commits for real.
              if (onRenameTemplate) onRenameTemplate(next);
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(templateName);
                setEditing(false);
              }
            }}
          />
        ) : (
          <NameButton
            type="button"
            $editable={editable}
            onClick={editable ? () => setEditing(true) : undefined}
            title={editable ? 'Rename template' : undefined}
            aria-label={editable ? `Rename template ${templateName}` : templateName}
          >
            <span>{templateName}</span>
            {editable ? <Icon icon={Pencil} size={12} /> : null}
          </NameButton>
        )}
        {meta ? <Meta>{meta}</Meta> : null}
      </NameBlock>

      <ModePill>{mode === 'using' ? 'From template' : 'Template'}</ModePill>

      <Actions>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        {onSave ? (
          <Button variant="primary" iconLeft={Check} loading={saving} onClick={onSave}>
            {saveLabel}
          </Button>
        ) : null}
      </Actions>
    </Bar>
  );
});

TemplateFlowHeader.displayName = 'TemplateFlowHeader';
