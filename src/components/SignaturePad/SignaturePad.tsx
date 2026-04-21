import { useCallback, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SignatureValue } from '../../types/sealdTypes';
import { DrawMode } from './modes/DrawMode/DrawMode';
import { TypeMode } from './modes/TypeMode/TypeMode';
import { UploadMode } from './modes/UploadMode/UploadMode';
import { Panel, Root, Tab, TabList } from './SignaturePad.styles';
import type { SignaturePadMode, SignaturePadProps } from './SignaturePad.types';
import { useSignaturePadValue } from './useSignaturePadValue';

const DEFAULT_MODES: ReadonlyArray<SignaturePadMode> = ['type', 'draw', 'upload'];

const MODE_LABELS: Record<SignaturePadMode, string> = {
  type: 'Type',
  draw: 'Draw',
  upload: 'Upload',
};

function resolveInitialMode(
  requested: SignaturePadMode | undefined,
  available: ReadonlyArray<SignaturePadMode>,
): SignaturePadMode {
  if (requested && available.includes(requested)) return requested;
  const fallback = available[0];
  return fallback ?? 'type';
}

export function SignaturePad(props: SignaturePadProps): ReactNode {
  const { initialMode, initialValue, onCommit, onCancel, availableModes } = props;

  const modes = useMemo<ReadonlyArray<SignaturePadMode>>(() => {
    if (!availableModes || availableModes.length === 0) return DEFAULT_MODES;
    return DEFAULT_MODES.filter((m) => availableModes.includes(m));
  }, [availableModes]);

  const [mode, setMode] = useState<SignaturePadMode>(() => resolveInitialMode(initialMode, modes));
  const reactId = useId();
  const tabId = (m: SignaturePadMode): string => `${reactId}-tab-${m}`;
  const panelId = (m: SignaturePadMode): string => `${reactId}-panel-${m}`;

  const hook = useSignaturePadValue(initialValue === undefined ? {} : { initialValue });
  const { begin, commit, cancel, reset } = hook;

  const handleCommit = useCallback(
    (value: SignatureValue): void => {
      reset();
      begin();
      commit(value);
      onCommit(value);
    },
    [reset, begin, commit, onCommit],
  );

  const handleCancel = useCallback((): void => {
    reset();
    begin();
    cancel();
    if (onCancel) onCancel();
  }, [reset, begin, cancel, onCancel]);

  const selectMode = useCallback((next: SignaturePadMode): void => {
    setMode(next);
  }, []);

  let panel: ReactNode = null;
  if (mode === 'type') {
    panel = <TypeMode onCommit={handleCommit} onCancel={handleCancel} />;
  } else if (mode === 'draw') {
    panel = <DrawMode onCommit={handleCommit} onCancel={handleCancel} />;
  } else {
    panel = <UploadMode onCommit={handleCommit} onCancel={handleCancel} />;
  }

  return (
    <Root>
      <TabList role="tablist" aria-label="Signature mode">
        {modes.map((m) => {
          const selected = m === mode;
          return (
            <Tab
              key={m}
              id={tabId(m)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(m)}
              tabIndex={selected ? 0 : -1}
              $selected={selected}
              onClick={() => selectMode(m)}
            >
              {MODE_LABELS[m]}
            </Tab>
          );
        })}
      </TabList>
      <Panel role="tabpanel" id={panelId(mode)} aria-labelledby={tabId(mode)}>
        {panel}
      </Panel>
    </Root>
  );
}
