import { LayoutTemplate, ShieldCheck, Upload, Users } from 'lucide-react';
import { Button } from '@/components/Button';
import {
  ButtonRow,
  Dropzone,
  DropMeta,
  DropTitle,
  FirstRunBlock,
  FirstRunTitle,
  Step,
  StepLine,
  Steps,
} from './DashboardPage.styles';

export interface FirstRunProps {
  readonly onUpload: () => void;
  readonly onTemplate: () => void;
}

/** Brand-new account: the three steps and a drop zone, no table. */
export function FirstRun({ onUpload, onTemplate }: FirstRunProps) {
  return (
    <FirstRunBlock aria-label="Get started">
      <FirstRunTitle>Send your first document</FirstRunTitle>
      <Steps aria-hidden>
        <Step>
          <span>
            <Upload size={24} />
          </span>
          Upload
        </Step>
        <StepLine />
        <Step>
          <span>
            <Users size={24} />
          </span>
          Add signers
        </Step>
        <StepLine />
        <Step>
          <span>
            <ShieldCheck size={24} />
          </span>
          Sealed
        </Step>
      </Steps>
      <Dropzone
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onUpload();
        }}
      >
        <Upload size={32} aria-hidden />
        <DropTitle>Drop a PDF</DropTitle>
        <DropMeta>or</DropMeta>
        <ButtonRow>
          <Button variant="primary" onClick={onUpload}>
            Choose file
          </Button>
          <Button variant="secondary" iconLeft={LayoutTemplate} onClick={onTemplate}>
            Use a template
          </Button>
        </ButtonRow>
      </Dropzone>
    </FirstRunBlock>
  );
}
