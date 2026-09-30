import { useState } from 'react';
import { Button } from '../Button';
import type { CodeSnippetProps } from './CodeSnippet.types';
import { Header, Label, Pre, Root } from './CodeSnippet.styles';

/** L1 read-only snippet with Copy. */
export function CodeSnippet(props: CodeSnippetProps) {
  const { label, code } = props;
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Root aria-label={label}>
      <Header>
        <Label>{label}</Label>
        <Button type="button" variant="secondary" size="md" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </Header>
      <Pre>{code}</Pre>
    </Root>
  );
}
