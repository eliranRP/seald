import { useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Calendar,
  CheckSquare,
  FileText,
  PenTool,
  Send,
  Type,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { findTemplateById } from '@/features/templates';
import type { TemplateFieldType, TemplatePageRule } from '@/features/templates';
import {
  ActionsRow,
  Cover,
  CoverLine,
  Crumb,
  FieldGlyph,
  FieldKind,
  FieldRow,
  FieldRule,
  FieldText,
  FieldsCaption,
  FieldsCard,
  FieldsHeading,
  FieldsList,
  Inner,
  Main,
  NotFoundCard,
  SummaryBody,
  SummaryEyebrow,
  SummaryGrid,
  SummaryMeta,
  SummaryMetaItem,
  SummaryTitle,
  TopBadge,
  TopBar,
} from './UseTemplatePage.styles';

const FIELD_ICON: Record<TemplateFieldType, LucideIcon> = {
  signature: PenTool,
  initial: Type,
  date: Calendar,
  text: Type,
  checkbox: CheckSquare,
};

const FIELD_LABEL: Record<TemplateFieldType, string> = {
  signature: 'Signature',
  initial: 'Initial',
  date: 'Date',
  text: 'Text',
  checkbox: 'Checkbox',
};

function describeRule(rule: TemplatePageRule): string {
  switch (rule) {
    case 'all':
      return 'On every page';
    case 'allButLast':
      return 'On every page except the last';
    case 'first':
      return 'On the first page';
    case 'last':
      return 'On the last page';
    default:
      return `On page ${rule}`;
  }
}

const COVER_WIDTHS: ReadonlyArray<number> = [78, 66, 84, 72, 90, 64, 80, 70];

/**
 * L4 page — `/templates/:id/use`. Shows a preview of the chosen template
 * (cover, name, page count, captured field rules) and routes the sender into
 * the standard new-document flow with the template id propagated as a query
 * arg. Local-state only; no API integration yet.
 */
export function UseTemplatePage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const template = useMemo(() => findTemplateById(decodeURIComponent(id)), [id]);

  const goBack = useCallback((): void => {
    navigate('/templates');
  }, [navigate]);

  const startSend = useCallback((): void => {
    if (!template) return;
    navigate(`/document/new?template=${encodeURIComponent(template.id)}`);
  }, [navigate, template]);

  if (!template) {
    return (
      <Main>
        <Inner>
          <TopBar>
            <Crumb type="button" onClick={goBack} aria-label="Back to templates">
              <Icon icon={ArrowLeft} size={14} />
              Back to templates
            </Crumb>
          </TopBar>
          <NotFoundCard role="alert">
            <SummaryTitle>Template not found</SummaryTitle>
            <FieldsCaption>
              The template you opened may have been removed. Pick another from the list.
            </FieldsCaption>
            <ActionsRow style={{ justifyContent: 'center' }}>
              <Button variant="primary" onClick={goBack}>
                Back to templates
              </Button>
            </ActionsRow>
          </NotFoundCard>
        </Inner>
      </Main>
    );
  }

  return (
    <Main>
      <Inner>
        <TopBar>
          <Crumb type="button" onClick={goBack} aria-label="Back to templates">
            <Icon icon={ArrowLeft} size={14} />
            Back to templates
          </Crumb>
          <TopBadge>
            <Icon icon={Bookmark} size={11} />
            Using template
          </TopBadge>
        </TopBar>

        <SummaryGrid>
          <Cover $color={template.cover} aria-hidden>
            {COVER_WIDTHS.map((w, i) => (
              <CoverLine key={`cl-${i}`} $width={w} />
            ))}
          </Cover>
          <SummaryBody>
            <SummaryEyebrow>{template.id}</SummaryEyebrow>
            <SummaryTitle>{template.name}</SummaryTitle>
            <SummaryMeta>
              <SummaryMetaItem>
                <Icon icon={FileText} size={13} />
                {template.pages} pages
              </SummaryMetaItem>
              <SummaryMetaItem>
                <Icon icon={PenTool} size={13} />
                {template.fieldCount} fields
              </SummaryMetaItem>
              <SummaryMetaItem>
                <Icon icon={Users} size={13} />
                Used {template.uses} times · last {template.lastUsed}
              </SummaryMetaItem>
            </SummaryMeta>
            <FieldsCaption>
              Example: <strong>{template.exampleFile}</strong>. Field rules adapt automatically when
              you swap in a different document.
            </FieldsCaption>
            <ActionsRow>
              <Button variant="ghost" iconLeft={ArrowLeft} onClick={goBack}>
                Cancel
              </Button>
              <Button variant="primary" iconRight={ArrowRight} onClick={startSend}>
                Continue with this template
              </Button>
              <Button variant="secondary" iconLeft={Send} onClick={startSend}>
                Send to sign
              </Button>
            </ActionsRow>
          </SummaryBody>
        </SummaryGrid>

        <FieldsCard aria-labelledby="tpl-fields-heading">
          <FieldsHeading id="tpl-fields-heading">Fields captured in this template</FieldsHeading>
          <FieldsCaption>
            These rules are projected onto whichever document you choose next. Pages resolve at
            apply-time so a 9-page upload still gets a single signature on its last page.
          </FieldsCaption>
          <FieldsList>
            {template.fields.map((f, i) => (
              <FieldRow key={`f-${i}`}>
                <FieldGlyph aria-hidden>
                  <Icon icon={FIELD_ICON[f.type]} size={16} />
                </FieldGlyph>
                <FieldText>
                  <FieldKind>{f.label ?? FIELD_LABEL[f.type]}</FieldKind>
                  <FieldRule>{describeRule(f.pageRule)}</FieldRule>
                </FieldText>
              </FieldRow>
            ))}
          </FieldsList>
        </FieldsCard>
      </Inner>
    </Main>
  );
}
