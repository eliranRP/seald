import { Fragment, useState } from 'react';
import type { ApprovalSummary } from 'shared';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { expiresInLabel, fieldsUpdatedLabel, keyLine, splitRecipients } from './model';
import {
  BadgeRow,
  DocTitle,
  FactList,
  Heading,
  Meta,
  MoreButton,
  RecipientEmail,
  RecipientList,
  RecipientName,
  RecipientRow,
  RecipientText,
  Root,
  SectionLabel,
} from './ApprovalCard.styles';

export interface ApprovalCardProps {
  readonly summary: ApprovalSummary;
  /** Owner-edit timestamp. Shows the "Fields updated" badge. */
  readonly fieldsUpdatedAt?: string | null | undefined;
  /** Shows "Expires in 23h". */
  readonly expiresAt?: string | undefined;
  /** Starts with the full recipient list open. */
  readonly defaultExpanded?: boolean | undefined;
}

function pagesLabel(count: number | null): string | null {
  if (count === null) return null;
  return count === 1 ? '1 page' : `${count} pages`;
}

/**
 * The facts of one approval, and nothing else: the action, the document
 * title, who it goes to (new addresses first, three, then "+N more"), the
 * key name and any external destination. It never shows document contents
 * or an agent name. Actions are the caller's, so the same card serves the
 * email page, the signed-in card and the review.
 */
export function ApprovalCard({
  summary,
  fieldsUpdatedAt,
  expiresAt,
  defaultExpanded = false,
}: ApprovalCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { shown, hidden } = splitRecipients(summary.recipients);
  const visible = expanded ? [...shown, ...hidden] : shown;
  const pages = pagesLabel(summary.page_count);
  const showBadges = Boolean(fieldsUpdatedAt) || expiresAt !== undefined;

  return (
    <Root aria-label="Approval request">
      {showBadges ? (
        <BadgeRow>
          {fieldsUpdatedAt ? (
            <Badge tone="indigo">{fieldsUpdatedLabel(fieldsUpdatedAt)}</Badge>
          ) : null}
          {expiresAt !== undefined ? (
            <Badge tone="neutral">{expiresInLabel(expiresAt)}</Badge>
          ) : null}
        </BadgeRow>
      ) : null}
      <Heading>{summary.action_label}</Heading>
      {summary.title !== null ? <DocTitle>{summary.title}</DocTitle> : null}
      {pages !== null ? <Meta>{pages}</Meta> : null}

      {summary.recipients.length > 0 ? (
        <>
          <SectionLabel>Recipients</SectionLabel>
          <RecipientList aria-label="Recipients">
            {visible.map((r) => (
              <RecipientRow key={r.email}>
                <Avatar name={r.name || r.email} size={32} />
                <RecipientText>
                  <RecipientName>{r.name || r.email}</RecipientName>
                  <RecipientEmail>{r.email}</RecipientEmail>
                </RecipientText>
                {r.is_new ? <Badge tone="amber">New</Badge> : null}
              </RecipientRow>
            ))}
          </RecipientList>
          {hidden.length > 0 ? (
            <MoreButton
              type="button"
              aria-expanded={expanded}
              onClick={() => {
                setExpanded((v) => !v);
              }}
            >
              {expanded ? 'Show fewer' : `+${hidden.length} more`}
            </MoreButton>
          ) : null}
        </>
      ) : null}

      {summary.facts && summary.facts.length > 0 ? (
        <FactList aria-label="Request details">
          {summary.facts.map((f) => (
            <Fragment key={`${f.label}:${f.value}`}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </Fragment>
          ))}
        </FactList>
      ) : null}

      {summary.destination !== null ? <Meta>Destination: {summary.destination.label}</Meta> : null}
      <Meta>{keyLine(summary.key_name)}</Meta>
      <Meta>Approving as {summary.approver_email}</Meta>
    </Root>
  );
}
