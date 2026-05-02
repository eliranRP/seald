import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import styled from 'styled-components';
import { PrimaryBtn, SecondaryBtn } from '../MobileSendPage.styles';
import { MWBottomSheet } from './MWBottomSheet';

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const FieldGroup = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FieldLabel = styled.span`
  font-size: 12px;
  color: var(--fg-3);
  font-weight: 600;
`;

const Input = styled.input`
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-1);
  border-radius: 12px;
  padding: 12px 14px;
  font: inherit;
  font-size: 15px;
  color: var(--fg-1);
  outline: none;
  background: #fff;

  &:focus {
    border-color: var(--indigo-500);
    box-shadow: var(--shadow-focus);
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 6px;
`;

const Error = styled.div`
  color: var(--danger-700);
  font-size: 12px;
`;

export interface MWAddSignerSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onAdd: (input: { name: string; email: string }) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function MWAddSignerSheet(props: MWAddSignerSheetProps) {
  const { open, onClose, onAdd } = props;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setEmail('');
      setTouched(false);
    }
  }, [open]);

  const trimmed = { name: name.trim(), email: email.trim() };
  const validEmail = EMAIL_RE.test(trimmed.email);
  const valid = trimmed.name.length > 0 && validEmail;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onAdd({ name: trimmed.name, email: trimmed.email });
  };

  return (
    <MWBottomSheet open={open} onClose={onClose} title="Add a signer">
      <Form onSubmit={submit} noValidate>
        <FieldGroup>
          <FieldLabel>Name</FieldLabel>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            autoComplete="name"
            aria-required
          />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel>Email</FieldLabel>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            type="email"
            autoComplete="email"
            aria-required
            aria-invalid={touched && !validEmail ? true : undefined}
          />
          {touched && !validEmail && <Error>Enter a valid email address.</Error>}
        </FieldGroup>
        <Actions>
          <SecondaryBtn type="button" onClick={onClose}>
            Cancel
          </SecondaryBtn>
          <PrimaryBtn type="submit" disabled={!valid}>
            Add
          </PrimaryBtn>
        </Actions>
      </Form>
    </MWBottomSheet>
  );
}
