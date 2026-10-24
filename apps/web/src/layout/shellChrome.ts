import { createContext, useContext, useEffect } from 'react';

/**
 * Lets a page tell `AppShell` it is a focused flow (Upload, Prepare, the
 * template editor). The design gives those screens their own flow header in
 * place of the app top bar, so the shell drops the NavBar, the legal footer
 * and the mobile bottom nav while one is mounted.
 */
const FocusedShellContext = createContext<(focused: boolean) => void>(() => {});

export const FocusedShellProvider = FocusedShellContext.Provider;

/** Marks the shell as focused for as long as the caller is mounted. */
export function useFocusedShell(): void {
  const setFocused = useContext(FocusedShellContext);
  useEffect(() => {
    setFocused(true);
    return () => setFocused(false);
  }, [setFocused]);
}

/**
 * Render-only form of `useFocusedShell` so a page can focus the shell
 * conditionally, e.g. `{isMobile ? <FocusedShell /> : null}` where the phone
 * board gives the page its own header.
 */
export function FocusedShell(): null {
  useFocusedShell();
  return null;
}
