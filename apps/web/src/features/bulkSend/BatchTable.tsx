import { Link } from 'react-router-dom';
import type { BulkBatchRow } from 'shared';
import { Badge } from '@/components/Badge';
import { failureCopy, ROW_STATUS_LABEL, rowErrorText, rowTone } from './model';
import { Muted, ProblemList, Recipient, Table, TableScroll } from './BulkSend.styles';

export interface BatchTableProps {
  readonly rows: ReadonlyArray<BulkBatchRow>;
  /** Names the table for screen readers and heads it for everyone. */
  readonly caption: string;
  /** `preview` lists each row's validation problems; `progress` its send result. */
  readonly mode: 'preview' | 'progress';
}

function Cell({
  row,
  mode,
}: {
  readonly row: BulkBatchRow;
  readonly mode: BatchTableProps['mode'];
}) {
  return (
    <>
      <Badge tone={rowTone(row.status)}>{ROW_STATUS_LABEL[row.status]}</Badge>
      {mode === 'preview' && row.errors.length > 0 ? (
        <ProblemList aria-label={`Problems in row ${String(row.row)}`}>
          {row.errors.map((e) => (
            <li key={`${e.code}-${e.column ?? ''}`}>{rowErrorText(e)}</li>
          ))}
        </ProblemList>
      ) : null}
      {mode === 'progress' && row.status === 'failed' ? (
        <div>{failureCopy(row.error_code)}</div>
      ) : null}
      {mode === 'progress' && row.status === 'sent' && row.envelope_id !== null ? (
        <div>
          <Link
            to={`/document/${row.envelope_id}`}
            aria-label={`Open the envelope for row ${String(row.row)}`}
          >
            Open
          </Link>
        </div>
      ) : null}
    </>
  );
}

/**
 * One row per CSV row. Recipients are listed in template order; the status
 * column says it in words (a colored badge is never the only signal) and, in
 * the preview, lists each validation problem under it. The wrapper scrolls
 * sideways on a phone and is reachable by keyboard.
 */
export function BatchTable({ rows, caption, mode }: BatchTableProps) {
  return (
    <TableScroll role="region" aria-label={caption} tabIndex={0}>
      <Table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Row</th>
            <th scope="col">Recipients</th>
            <th scope="col">Title</th>
            <th scope="col">{mode === 'preview' ? 'Check' : 'Result'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.row}>
              <th scope="row">{row.row}</th>
              <td>
                {row.recipients.map((r, i) => (
                  // A row's recipients are fixed and in template order.
                  <Recipient key={`${String(i)}-${r.email}`}>
                    <span>{r.name.length > 0 ? r.name : <Muted>(no name)</Muted>}</span>
                    <Muted>{r.email.length > 0 ? r.email : '(no email)'}</Muted>
                  </Recipient>
                ))}
              </td>
              <td>{row.title ?? <Muted>Default</Muted>}</td>
              <td>
                <Cell row={row} mode={mode} />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableScroll>
  );
}
