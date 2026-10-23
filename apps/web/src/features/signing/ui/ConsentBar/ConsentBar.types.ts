export interface ConsentBarProps {
  readonly senderName: string | null | undefined;
  /** Fields the signer fills by hand. Drives the "N fields · ~M min" line. */
  readonly fieldCount: number;
  readonly agreed: boolean;
  readonly onAgreedChange: (agreed: boolean) => void;
  readonly onStart: () => void;
  readonly busy?: boolean | undefined;
  /** Where the ESIGN Consumer Disclosure lives. */
  readonly disclosureHref: string;
  /** The device-access statement the signer confirms with the checkbox. */
  readonly attestation: string;
  readonly error?: string | null | undefined;
}
