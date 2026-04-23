import { forwardRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Avatar } from '../Avatar';
import { StatusBadge, STATUS_BADGE_MAP } from '../StatusBadge';
import { Icon } from '../Icon';
import type { SignerRowProps } from './SignerRow.types';
import { Row, Body, Name, Email, MenuButton } from './SignerRow.styles';

export const SignerRow = forwardRef<HTMLDivElement, SignerRowProps>((props, ref) => {
  const { signer, showMenu = true, onMenuClick, ...rest } = props;
  const statusLabel = STATUS_BADGE_MAP[signer.status].label;

  let menu: ReactNode = null;
  if (showMenu) {
    menu = (
      <MenuButton
        type="button"
        aria-label={`Actions for ${signer.name}`}
        aria-haspopup="menu"
        onClick={(e: MouseEvent<HTMLButtonElement>) => onMenuClick?.(signer.id, e)}
      >
        <Icon icon={MoreHorizontal} size={20} />
      </MenuButton>
    );
  }

  return (
    <Row ref={ref} {...rest} role="group" aria-label={`${signer.name} — ${statusLabel}`}>
      <Avatar name={signer.name} imageUrl={signer.avatarUrl} />
      <Body>
        <Name>{signer.name}</Name>
        <Email>{signer.email}</Email>
      </Body>
      <StatusBadge status={signer.status} />
      {menu}
    </Row>
  );
});

SignerRow.displayName = 'SignerRow';
