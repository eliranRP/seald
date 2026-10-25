import { PenLine, ShieldCheck } from 'lucide-react';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { SheetDialog } from '@/components/SheetDialog';
import { useT } from '@/lib/i18n';
import { Heading, Meta, Pad, Stack } from './FinishSheet.styles';
import type { FinishSheetProps } from './FinishSheet.types';

/**
 * Last step: the intent-to-sign confirmation. Pressing Sign is the signer's
 * explicit act (recorded, then submitted by the caller); Back changes nothing.
 */
export function FinishSheet(props: FinishSheetProps) {
  const {
    open,
    onClose,
    docTitle,
    signerName,
    signerEmail,
    preview,
    busy,
    error,
    onSign,
    codeForm,
  } = props;
  const t = useT();

  return (
    <SheetDialog
      open={open}
      onClose={onClose}
      title={t('signing.sign.finish.aria')}
      showTitle={false}
      footer={
        codeForm ? null : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              {t('signing.sign.finish.back')}
            </Button>
            <Button iconLeft={PenLine} onClick={onSign} loading={busy} disabled={busy}>
              {t('signing.sign.finish.sign')}
            </Button>
          </>
        )
      }
    >
      <Stack>
        <Pad>{preview}</Pad>
        <Heading>{t('signing.sign.finish.title', { title: docTitle })}</Heading>
        <Meta>{t('signing.sign.finish.as', { name: signerName, email: signerEmail })}</Meta>
        <Meta>
          <Icon icon={ShieldCheck} size={14} />
          {t('signing.sign.finish.binding')}
        </Meta>
        <Meta>{t('signing.sign.finish.intent')}</Meta>
      </Stack>
      {codeForm ?? null}
      {error ? <Banner tone="error">{error}</Banner> : null}
    </SheetDialog>
  );
}
