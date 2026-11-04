Feature: Public verifier surfaces seal + audit-chain trust signals

  A regulator, recipient, or auditor lands on /verify/:shortCode after
  clicking the QR code on a sealed PDF. They must be able to (1) read
  the sealed verdict, (2) download the sealed PDF and the audit PDF
  with friendly filenames, and (3) see at a glance whether the
  tamper-evident audit chain has been broken since the seal.

  @verify @smoke
  Scenario: Sealed envelope shows the Authentic verdict and downloads in the technical details
    Given a sealed envelope is published at short code "PuBLicSm0kE1"
    When the user opens "/verify/PuBLicSm0kE1"
    Then the verify verdict heading announces the document is sealed
    And the verify checks show "Audit chain intact"
    When the user opens the technical details
    Then the sealed-PDF download link saves with a ".pdf" filename
    And the audit-PDF download link saves with a ".pdf" filename

  @verify @smoke
  Scenario: Verify verdict and title use the type scale at 390, 640, 641, and 1440
    Given a sealed envelope is published at short code "TyPeSc4leH1"
    And the viewport is set to a 390x844 phone
    When the user opens "/verify/TyPeSc4leH1"
    Then the verify verdict heading font size is the "x4l" token
    And the verify document title font size is the "body" token
    And the verify page does not overflow horizontally
    When the viewport is set to a 640x900 window
    Then the verify verdict heading font size is the "x4l" token
    And the verify document title font size is the "body" token
    And the verify page does not overflow horizontally
    When the viewport is set to a 641x900 window
    Then the verify verdict heading font size is the "x5l" token
    And the verify document title font size is the "body" token
    And the verify page does not overflow horizontally
    When the viewport is set to a 1440x900 desktop
    Then the verify verdict heading font size is the "x5l" token
    And the verify document title font size is the "body" token
    And the verify page does not overflow horizontally

  @verify @smoke
  Scenario: Tampered audit chain shows the Tampered verdict with the details open
    Given a sealed envelope with a broken audit chain is published at short code "BrOkenCh4inX"
    When the user opens "/verify/BrOkenCh4inX"
    Then the verify verdict word reads "Tampered"
    And the verify checks show "Audit chain broken"

  @verify @smoke
  Scenario: The entry page takes a 13-character code
    When the user opens "/verify"
    Then the verify entry page asks for a document code
    And the Verify button asks for all 13 characters before it looks up a code
