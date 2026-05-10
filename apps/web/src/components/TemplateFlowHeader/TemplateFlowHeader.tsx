import { forwardRef, useEffect, useState } from 'react';
import { ArrowLeft, Check, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import type { TemplateFlowHeaderProps, TemplateFlowStep } from './TemplateFlowHeader.types';
import {
  Bar,
  CancelButton,
  ModeBadge,
  NameBlock,
  NameButton,
  NameInput,
  StepConnector,
  StepDot,
  StepPill,
  Steps,
} from './TemplateFlowHeader.styles';

interface StepDef {
  readonly n: TemplateFlowStep;
  readonly label: string;
}
/**
 * Step order: Document → Signers → Fields. The user picks the source
 * document first (saved example or fresh upload), THEN the signers,
 * then opens the place-fields editor. Operator-confirmed ordering — a
 * prior iteration tried Signers→Document but the document choice is
 * the more consequential decision and belongs first.
 */
const STEPS: ReadonlyArray<StepDef> = [
  { n: 1, label: 'Document' },
  { n: 2, label: 'Signers' },
  { n: 3, label: 'Fields' },
];

/**
 * Sticky chrome for the template flow. Mirrors the FlowHeader from
 * `Design-Guide/project/templates-flow/UseTemplate.jsx`:
 *
 *   - Back button on the far left.
 *   - Mode badge ("New template" green / "Using template" indigo /
 *     "Editing template" indigo).
 *   - Inline-editable template name (click → input; Enter / blur saves;
 *     Esc reverts) when `onRenameTemplate` is provided.
 *   - 3-step progress on the right (current pill is dark, completed steps
 *     show a green check).
 *   - Cancel ✕ on the far right.
 *
 * The header doesn't render on step 3 because step 3 is the existing
 * place-fields editor (`/document/new?template=<id>`) which has its own
 * NavBar + chrome.
 */
export const TemplateFlowHeader = forwardRef<HTMLElement, TemplateFlowHeaderProps>((props, ref) => {
  const { step, mode, templateName, onRenameTemplate, onBack, onCancel, ...rest } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(templateName);

  // Re-sync draft when the canonical name changes (e.g. parent persisted
  // a rename and re-rendered) — but NOT while the user is mid-edit, so
  // an in-flight server canonicalization can't clobber what they're
  // typing.
  useEffect(() => {
    if (!editing) setDraft(templateName);
  }, [templateName, editing]);

  const editable = Boolean(onRenameTemplate);

  function commit(): void {
    const next = draft.trim();
    if (next && next !== templateName && onRenameTemplate) {
      onRenameTemplate(next);
    } else {
      setDraft(templateName);
    }
    setEditing(false);
  }

  // Pill copy reads as the active intent rather than a static label —
  // "Creating template" while authoring, "Updating template" while
  // editing or using-with-modifications. The 'using' mode rolls under
  // 'updating' because the user can save edits back to the template
  // on send (see SendConfirmDialog).
  const badgeTone: 'new' | 'using' = mode === 'new' ? 'new' : 'using';
  const badgeLabel = mode === 'new' ? 'Creating template' : 'Updating template';
  const badgeIcon = mode === 'new' ? Plus : Pencil;

  return (
    <Bar ref={ref} {...rest}>
      {onBack ? (
        <Button variant="ghost" size="sm" iconLeft={ArrowLeft} onClick={onBack}>
          Back
        </Button>
      ) : null}

      <NameBlock>
        <ModeBadge $tone={badgeTone}>
          <Icon icon={badgeIcon} size={11} />
          {badgeLabel}
        </ModeBadge>

        {editing ? (
          <NameInput
            autoFocus
            value={draft}
            onChange={(e) => {
              const next = e.target.value;
              setDraft(next);
              // Forward every keystroke to the parent so it can run a
              // debounced server save (UseTemplatePage / TemplateEditor
              // own the actual update). The parent skips empty/whitespace
              // titles and coalesces bursts. Blur/Enter still call
              // `commit()` below as the explicit "I'm done editing" UI
              // gesture; the debouncer makes the redundant save a
              // no-op when the value didn't change.
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
            aria-label="Template name"
          />
        ) : (
          <NameButton
            type="button"
            $editable={editable}
            onClick={editable ? () => setEditing(true) : undefined}
            title={editable ? 'Rename template' : undefined}
            aria-label={editable ? `Rename template ${templateName}` : undefined}
          >
            <span>{templateName}</span>
            {editable ? <Icon icon={Pencil} size={12} /> : null}
          </NameButton>
        )}
      </NameBlock>

      <Steps role="list" aria-label="Template flow steps">
        {STEPS.map((s, i) => {
          const done = s.n < step;
          const active = s.n === step;
          return (
            <span key={s.n} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <StepPill
                $active={active}
                $done={done}
                role="listitem"
                aria-current={active ? 'step' : undefined}
              >
                <StepDot $active={active} $done={done}>
                  {done ? <Icon icon={Check} size={10} /> : s.n}
                </StepDot>
                {s.label}
              </StepPill>
              {i < STEPS.length - 1 ? <StepConnector aria-hidden /> : null}
            </span>
          );
        })}
      </Steps>

      {onCancel ? (
        <CancelButton type="button" onClick={onCancel} aria-label="Cancel template flow">
          <Icon icon={X} size={18} />
        </CancelButton>
      ) : null}
    </Bar>
  );
});

TemplateFlowHeader.displayName = 'TemplateFlowHeader';
