import { act, renderHook } from '@testing-library/react';
import { useReminderToggle } from './useReminderToggle';

describe('useReminderToggle', () => {
  it('stays pending until the save settles, then rolls back on failure', async () => {
    let rejectSave: (reason: unknown) => void = () => undefined;
    const onChange = () =>
      new Promise<void>((_resolve, reject) => {
        rejectSave = reject;
      });
    const { result } = renderHook(() => useReminderToggle({ enabled: true, onChange }));

    act(() => {
      result.current.onChange(false);
    });
    expect(result.current.enabled).toBe(false);
    expect(result.current.pending).toBe(true);

    await act(async () => {
      rejectSave(new Error('envelope_terminal'));
    });
    expect(result.current.enabled).toBe(true);
    expect(result.current.pending).toBe(false);
  });
});
