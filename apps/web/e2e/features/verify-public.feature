Feature: Public verifier surfaces seal + audit-chain trust signals

  A regulator, recipient, or auditor lands on /verify/:shortCode after
  clicking the QR code on a sealed PDF. They must be able to (1) read
  the sealed verdict, (2) download the sealed PDF and the audit PDF
  with friendly filenames, and (3) see at a glance whether the
  tamper-evident audit chain has been broken since the seal.

  @verify @smoke
  Scenario: Sealed envelope shows download buttons with download attribute and intact-chain badge
    Given a sealed envelope is published at short code "PuBLicSm0kE1"
    When the user opens "/verify/PuBLicSm0kE1"
    Then the verify verdict heading announces the document is sealed
    And the sealed-PDF download link saves with a ".pdf" filename
    And the audit-PDF download link saves with a ".pdf" filename
    And the audit chain status badge reads "intact"

  @verify @smoke
  Scenario: Tampered audit chain shows a broken-chain badge even when the seal is intact
    Given a sealed envelope with a broken audit chain is published at short code "BrOkenCh4inX"
    When the user opens "/verify/BrOkenCh4inX"
    Then the audit chain status badge reads "broken"
