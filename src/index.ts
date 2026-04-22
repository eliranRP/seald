// ————— L0 Tokens —————
export { GlobalStyles } from './styles/globalStyles';
export { seald } from './styles/theme';
export type { SealdTheme } from './styles/theme';

// ————— L1 Primitives —————
export * from './components/Avatar';
export * from './components/Badge';
export * from './components/Button';
export * from './components/Card';
export * from './components/DocThumb';
export * from './components/Icon';
export * from './components/SignatureMark';
export * from './components/TextField';

// ————— L2 Domain —————
export * from './components/FieldsPlacedList';
export * from './components/PageThumbStrip';
export * from './components/PageToolbar';
export * from './components/PlacedField';
export * from './components/SendPanelFooter';
export * from './components/SignatureField';
export * from './components/SignerRow';
export * from './components/StatusBadge';

// ————— L3 Widgets —————
export * from './components/CollapsibleRail';
export * from './components/DocumentCanvas';
export * from './components/FieldPalette';
export * from './components/FieldsBar';
export * from './components/NavBar';
export * from './components/SideBar';
export * from './components/SignaturePad';

// ————— Providers —————
export { SealdThemeProvider } from './providers/SealdThemeProvider';
export type { SealdThemeProviderProps } from './providers/SealdThemeProvider';

// ————— Types —————
export { FIELD_KINDS, SIGNATURE_MODES, SIGNER_STATUSES } from './types/sealdTypes';
export type {
  FieldKind,
  SignatureMode,
  SignatureValue,
  Signer,
  SignerStatus,
} from './types/sealdTypes';
