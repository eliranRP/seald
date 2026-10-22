export interface CodeSnippetProps {
  /** Text shown and copied. Rendered as plain text, never as HTML. */
  readonly code: string;
  /** Accessible name of the snippet and the Copy button, e.g. "Claude Code command". */
  readonly label: string;
  readonly onCopy?: (() => void) | undefined;
}
