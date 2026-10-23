import { automationFailureMessage } from 'shared';
import { Button } from '@/components/Button';
import { useSendTest } from './automationsApi';
import { Actions, Intro, Notice } from './automations.styles';
import { testProblem } from './model';

export interface TestEventProps {
  readonly automationId: string;
  /** An agent's automation that has not been turned on yet cannot be tested. */
  readonly awaitingApproval: boolean;
}

/**
 * "Send test event": one signed `automation.test` message to the saved
 * address, with the same address checks and 10 second limit as a real run.
 * It is not stored as a run.
 */
export function TestEvent({ automationId, awaitingApproval }: TestEventProps) {
  const send = useSendTest();
  const result = send.data;
  return (
    <div>
      <Intro>Sends one test message to your address. It does not appear in the run history.</Intro>
      <Actions>
        <Button
          variant="secondary"
          loading={send.isPending}
          disabled={awaitingApproval}
          onClick={() => {
            send.mutate(automationId);
          }}
        >
          Send test event
        </Button>
      </Actions>
      {awaitingApproval ? (
        <Notice role="status">Turn the automation on before you test it.</Notice>
      ) : null}
      {send.isError ? (
        <Notice $tone="error" role="alert">
          {testProblem(send.error)}
        </Notice>
      ) : null}
      {result?.ok ? (
        <Notice role="status">
          The address answered {result.response_status} in {result.duration_ms} ms.
        </Notice>
      ) : null}
      {result && !result.ok ? (
        <Notice $tone="error" role="alert">
          {automationFailureMessage(result.error) ?? 'The test did not reach your address.'}
        </Notice>
      ) : null}
    </div>
  );
}
