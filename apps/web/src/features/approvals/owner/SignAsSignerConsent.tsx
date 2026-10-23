import { useState } from 'react';
import {
  ESIGN_DISCLOSURE_VERSION,
  INTENT_TO_SIGN_MCP_NOTE,
  RECORD_ACCESS_ATTESTATION,
  type ApprovalApproveBody,
  type ApprovalSignatureImage,
} from 'shared';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { SignatureCapture, type SignatureCaptureResult } from '@/components/SignatureCapture';
import {
  ConsentCard,
  ConsentTitle,
  Fine,
  InlineLink,
  Row,
  Stack,
  Warning,
} from './OwnerAction.styles';
import { OWNER_ACTION_WARNINGS, blobToBase64, type SignerFacts } from './ownerActionModel';

/** Same words as the signer's prep screen (SigningPrepPage). Legal copy: not translated. */
const DISCLOSURE_LABEL =
  "I have read Seald's ESIGN Consumer Disclosure and consent to use electronic signatures and electronic records for this document.";
const INTENT_LABEL = 'I intend to sign this document electronically.';

export interface SignAsSignerConsentProps {
  readonly signer: SignerFacts;
  readonly busy: 'approve' | 'deny' | null;
  readonly onApprove: (body: ApprovalApproveBody) => void;
  readonly onDeny: () => void;
}

async function toImage(result: SignatureCaptureResult): Promise<ApprovalSignatureImage> {
  return {
    image_base64: await blobToBase64(result.blob),
    format: result.format,
    ...(result.font ? { font: result.font } : {}),
    ...(result.stroke_count !== undefined ? { stroke_count: result.stroke_count } : {}),
  };
}

/**
 * `envelope_sign_as_signer` (WP-45). This page is the signer's own
 * consent: the ESIGN disclosure, the record-access attestation, the
 * intent-to-sign sentence (today's approved copy, decision D4), the field
 * list on the card above, and the signature the owner adopts here.
 * Nothing is applied until Approve; Deny never signs.
 */
export function SignAsSignerConsent({ signer, busy, onApprove, onDeny }: SignAsSignerConsentProps) {
  const [disclosure, setDisclosure] = useState(false);
  const [canAccess, setCanAccess] = useState(false);
  const [intent, setIntent] = useState(false);
  const [capturing, setCapturing] = useState<'signature' | 'initials' | null>(null);
  const [signature, setSignature] = useState<ApprovalSignatureImage | null>(null);
  const [initials, setInitials] = useState<ApprovalSignatureImage | null>(null);
  const [imageError, setImageError] = useState(false);

  const imagesReady =
    (!signer.needsSignature || signature !== null) && (!signer.needsInitials || initials !== null);
  const ready = disclosure && canAccess && intent && imagesReady;

  const approve = (): void => {
    onApprove({
      esign_disclosure_version: ESIGN_DISCLOSURE_VERSION,
      record_access: true,
      intent_to_sign: true,
      ...(signer.needsSignature && signature ? { signature } : {}),
      ...(signer.needsInitials && initials ? { initials } : {}),
    });
  };

  return (
    <Stack>
      <Warning role="note">{OWNER_ACTION_WARNINGS.envelope_sign_as_signer}</Warning>
      <ConsentCard aria-label="Your consent">
        <ConsentTitle>Before you sign</ConsentTitle>
        <InlineLink href="/legal/esign-disclosure" target="_blank" rel="noopener noreferrer">
          ESIGN Consumer Disclosure
        </InlineLink>
        <Checkbox checked={disclosure} onChange={setDisclosure} label={DISCLOSURE_LABEL} />
        <Checkbox checked={canAccess} onChange={setCanAccess} label={RECORD_ACCESS_ATTESTATION} />
        <Fine>{INTENT_TO_SIGN_MCP_NOTE}</Fine>
        <Checkbox checked={intent} onChange={setIntent} label={INTENT_LABEL} />
      </ConsentCard>
      <Row>
        {signer.needsSignature ? (
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              setCapturing('signature');
            }}
          >
            {signature ? 'Signature adopted · change' : 'Adopt your signature'}
          </Button>
        ) : null}
        {signer.needsInitials ? (
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              setCapturing('initials');
            }}
          >
            {initials ? 'Initials adopted · change' : 'Adopt your initials'}
          </Button>
        ) : null}
      </Row>
      {imageError ? (
        <Warning $danger role="alert">
          That signature could not be read. Adopt it again.
        </Warning>
      ) : null}
      <Row>
        <Button
          size="lg"
          variant="primary"
          loading={busy === 'approve'}
          disabled={!ready || busy === 'deny'}
          onClick={approve}
        >
          Approve and sign
        </Button>
        <Button
          size="lg"
          variant="secondary"
          loading={busy === 'deny'}
          disabled={busy === 'approve'}
          onClick={onDeny}
        >
          Deny
        </Button>
      </Row>
      <SignatureCapture
        open={capturing !== null}
        kind={capturing ?? 'signature'}
        defaultName={signer.name}
        email={signer.email}
        onCancel={() => {
          setCapturing(null);
        }}
        onApply={(result) => {
          const kind = capturing;
          setCapturing(null);
          setImageError(false);
          toImage(result)
            .then((image) => {
              if (kind === 'initials') setInitials(image);
              else setSignature(image);
            })
            .catch(() => {
              setImageError(true);
            });
        }}
      />
    </Stack>
  );
}
