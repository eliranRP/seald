/**
 * ExitConfirmDialog previously defined its own Backdrop, Card, Title,
 * Description, and Footer styled components. Those are now provided by
 * the shared DialogPrimitives module. This file is kept as a re-export
 * so existing tests / stories that import from here continue to resolve.
 */
export {
  DialogBackdrop as Backdrop,
  DialogCard as Card,
  DialogTitle as Title,
  DialogDescription as Description,
  DialogFooter as Footer,
} from '../DialogPrimitives';
