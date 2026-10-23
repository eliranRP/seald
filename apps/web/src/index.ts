// ————— L0 Tokens —————
export { GlobalStyles } from './styles/globalStyles';
export { seald } from './styles/theme';
export * from './styles/motion';
export type { SealdTheme } from './styles/theme';

// ————— L1 Primitives —————
export * from './components/Avatar';
export * from './components/Badge';
export * from './components/Banner';
export * from './components/Button';
export * from './components/Card';
export * from './components/CheckChip';
export * from './components/DocThumb';
export * from './components/EmptyState';
export * from './components/Icon';
export * from './components/InfoChip';
export * from './components/Menu';
export * from './components/MiniTrack';
export * from './components/SegmentedControl';
export * from './components/SignatureMark';
export * from './components/Skeleton';
export * from './components/Spinner';
export * from './components/TextField';

// ————— L2 Domain —————
export * from './components/AddSignerDropdown';
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
export * from './components/CreateSignatureRequestDialog';
export * from './components/DocumentCanvas';
export * from './components/FieldPalette';
export * from './components/FieldsBar';
export * from './components/NavBar';
export * from './components/PdfPageView';
export * from './components/PlaceOnPagesPopover';
export * from './components/SelectSignersPopover';
export * from './components/SideBar';
export * from './components/SignaturePad';
export * from './components/SignersPanel';

// ————— L4 Pages —————
export * from './pages/UploadPage';
export * from './pages/DocumentPage';

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
