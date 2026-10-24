import { Download, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/Button';
import { MenuAnchor, MenuButton } from '@/components/Menu';
import { useT } from '@/lib/i18n';
import {
  Actions,
  Divider,
  DocTitle,
  From,
  Logo,
  LogoMark,
  Spacer,
  Top,
  Wordmark,
} from './SignHeader.styles';
import type { SignHeaderProps } from './SignHeader.types';

/**
 * Header of the public signing pages: logo, document title, sender, a
 * download button and a More menu. With no `title` it is the logo only, the
 * way every status page shows it.
 */
export function SignHeader(props: SignHeaderProps) {
  const { title, senderName, onDownload, downloadBusy = false, menu } = props;
  const t = useT();

  return (
    <Top $doc={Boolean(title)}>
      <Logo $doc={Boolean(title)}>
        <LogoMark aria-hidden="true">S</LogoMark>
        <Wordmark>Seald</Wordmark>
      </Logo>
      {title ? (
        <>
          <Divider aria-hidden="true" />
          <DocTitle>{title}</DocTitle>
          {senderName ? <From>{t('signing.sign.header.from', { sender: senderName })}</From> : null}
          <Spacer />
          <Actions>
            {onDownload ? (
              <Button
                variant="ghost"
                iconOnly
                iconLeft={Download}
                aria-label={t('signing.sign.header.download')}
                loading={downloadBusy}
                onClick={onDownload}
              />
            ) : null}
            {menu && menu.length > 0 ? (
              <MenuAnchor>
                <MenuButton
                  aria-label={t('signing.sign.header.moreMenu')}
                  items={menu}
                  trigger={(triggerProps) => (
                    <Button
                      {...triggerProps}
                      variant="ghost"
                      iconOnly
                      iconLeft={MoreHorizontal}
                      aria-label={t('signing.sign.header.more')}
                    />
                  )}
                />
              </MenuAnchor>
            ) : null}
          </Actions>
        </>
      ) : null}
    </Top>
  );
}
