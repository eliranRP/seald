import { Check, Copy } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { Button } from '../Button';
import { Header, Label, Pre, Root } from './CodeSnippet.styles';
import type { CodeSnippetProps } from './CodeSnippet.types';

/** Read-only monospace block with a Copy button. */
export function CodeSnippet({ code, label, onCopy }: CodeSnippetProps) {
  const { copied, copy } = useCopyToClipboard();
  const handleCopy = async (): Promise<void> => {
    if (await copy(code)) onCopy?.();
  };
  return (
    <Root role="group" aria-label={label}>
      <Header>
        <Label>{label}</Label>
        <Button
          variant="secondary"
          size="sm"
          iconLeft={copied ? Check : Copy}
          aria-label={`Copy ${label}`}
          onClick={() => {
            void handleCopy();
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </Header>
      <Pre tabIndex={0} aria-label={`${label} text`}>
        <code>{code}</code>
      </Pre>
    </Root>
  );
}
