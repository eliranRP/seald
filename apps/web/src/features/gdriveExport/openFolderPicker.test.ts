import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openFolderPicker, __resetFolderPickerLoaderForTests } from './openFolderPicker';

type PickerAction =
  | { readonly action: 'picked'; readonly id: string; readonly name: string }
  | { readonly action: 'cancel' };

function installFakeGoogle(next: PickerAction): { builderCalls: string[] } {
  const builderCalls: string[] = [];
  // The fake builder fires the registered callback on the next microtask
  // after `build()` — close enough to Google's async picker for our test.
  let cb:
    | ((data: {
        action: string;
        docs?: Array<{ id: string; name: string; mimeType: string }>;
      }) => void)
    | undefined;
  const builder = {
    setOAuthToken() {
      builderCalls.push('setOAuthToken');
      return builder;
    },
    setDeveloperKey() {
      builderCalls.push('setDeveloperKey');
      return builder;
    },
    setAppId() {
      builderCalls.push('setAppId');
      return builder;
    },
    setOrigin() {
      builderCalls.push('setOrigin');
      return builder;
    },
    enableFeature() {
      builderCalls.push('enableFeature');
      return builder;
    },
    setParent() {
      builderCalls.push('setParent');
      return builder;
    },
    setTitle() {
      builderCalls.push('setTitle');
      return builder;
    },
    addView() {
      builderCalls.push('addView');
      return builder;
    },
    setCallback(fn: typeof cb) {
      cb = fn;
      builderCalls.push('setCallback');
      return builder;
    },
    build() {
      return {
        setVisible() {
          builderCalls.push('setVisible');
          queueMicrotask(() => {
            if (next.action === 'picked') {
              cb?.({
                action: 'picked',
                docs: [
                  { id: next.id, name: next.name, mimeType: 'application/vnd.google-apps.folder' },
                ],
              });
            } else {
              cb?.({ action: 'cancel' });
            }
          });
        },
      };
    },
  };
  const docsView = {
    setSelectFolderEnabled() {
      return docsView;
    },
    setIncludeFolders() {
      return docsView;
    },
  };
  (window as unknown as { google: unknown }).google = {
    picker: {
      PickerBuilder: function PickerBuilder() {
        return builder;
      },
      DocsView: function DocsView() {
        return docsView;
      },
      ViewId: { DOCS: 'docs', FOLDERS: 'folders' },
      DocsViewMode: { GRID: 'grid', LIST: 'list' },
      Action: { PICKED: 'picked', CANCEL: 'cancel', LOADED: 'loaded' },
      Feature: { SUPPORT_DRIVES: 'sdr' },
    },
  };
  (window as unknown as { gapi: unknown }).gapi = {
    load: (_name: string, cfg: { callback: () => void }) => cfg.callback(),
  };
  return { builderCalls };
}

beforeEach(() => {
  __resetFolderPickerLoaderForTests();
  // Pretend the gapi script is already in the DOM so loadGooglePicker resolves
  // via the readGapi() short-circuit (no real network).
  const script = document.createElement('script');
  script.id = 'gapi-loader';
  document.head.appendChild(script);
});

afterEach(() => {
  __resetFolderPickerLoaderForTests();
  delete (window as unknown as { google?: unknown }).google;
  delete (window as unknown as { gapi?: unknown }).gapi;
});

describe('openFolderPicker', () => {
  it('resolves with the picked folder and seeds the parent when given one', async () => {
    const { builderCalls } = installFakeGoogle({
      action: 'picked',
      id: 'folder-X',
      name: 'My Folder',
    });
    const picked = await openFolderPicker(
      { accessToken: 't', developerKey: 'd', appId: 'a' },
      { parentFolderId: 'parent-1' },
    );
    expect(picked).toEqual({ id: 'folder-X', name: 'My Folder' });
    expect(builderCalls).toContain('setParent');
    expect(builderCalls).toContain('addView');
    expect(builderCalls).toContain('setVisible');
  });

  it('resolves null when the user cancels', async () => {
    installFakeGoogle({ action: 'cancel' });
    await expect(
      openFolderPicker({ accessToken: 't', developerKey: 'd', appId: 'a' }),
    ).resolves.toBeNull();
  });

  it('does not call setParent when no parentFolderId is given', async () => {
    const { builderCalls } = installFakeGoogle({
      action: 'picked',
      id: 'folder-Y',
      name: 'Another',
    });
    await openFolderPicker({ accessToken: 't', developerKey: 'd', appId: 'a' });
    expect(builderCalls).not.toContain('setParent');
  });
});
