import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { TextField } from '../../../TextField';
import { Preview, Wrap } from './TypeMode.styles';
import type { TypeModeProps } from './TypeMode.types';

export function TypeMode(props: TypeModeProps) {
  const { onCommit, onCancel, initialText = '' } = props;
  const [text, setText] = useState(initialText);

  const tryCommit = (): void => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      onCancel();
      return;
    }
    onCommit({ kind: 'typed', text: trimmed, font: 'caveat' });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      tryCommit();
    }
  };

  return (
    <Wrap>
      <TextField
        label="Type your name"
        value={text}
        onChange={(next) => setText(next)}
        onKeyDown={handleKeyDown}
      />
      <Preview data-testid="type-mode-preview" aria-hidden={text.length === 0}>
        {text || ' '}
      </Preview>
    </Wrap>
  );
}
