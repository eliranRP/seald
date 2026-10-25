import type { HTMLAttributes, ReactNode } from 'react';

export type FlowStepState = 'done' | 'active' | 'todo';

export interface FlowStep {
  readonly label: string;
  readonly state: FlowStepState;
}

export interface FlowHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Steps of the flow, e.g. Upload, Prepare, Send. */
  readonly steps: ReadonlyArray<FlowStep>;
  /** Close (X) handler. Omit to hide the button. */
  readonly onClose?: (() => void) | undefined;
  readonly closeLabel?: string | undefined;
  /** Document title shown next to the close button. */
  readonly title?: string | undefined;
  /** Small line under the title, e.g. "8 pages". */
  readonly meta?: string | undefined;
  /**
   * Phone-only title for a flow with no document yet (Upload: "New
   * document"). Desktop shows the Seald logo in its place.
   */
  readonly mobileTitle?: string | undefined;
  /** Right-hand actions. */
  readonly children?: ReactNode;
}
