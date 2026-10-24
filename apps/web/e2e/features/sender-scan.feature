Feature: Scan with phone
  # The sender shows a QR on the computer; the phone opens /scan/<code>,
  # captures pages (or picks photos when the camera is blocked), builds one
  # PDF in the browser and posts it once. The computer then continues to the
  # editor with the scanned document.

  @sender @smoke
  Scenario: The computer shows a QR and continues once the phone has sent the scan
    Given a signed-in sender with a scan session that the phone has completed
    When the sender opens the scan page on a computer
    Then the scan dialog shows a QR code and a waiting message
    And the scan dialog reports "2 pages received"
    When the sender continues with the scan
    Then the editor opens for the scanned document

  @sender @smoke @mobile
  Scenario: The phone sends photos as one PDF when the camera is blocked
    Given a scan link that is still open
    When the phone opens the scan link
    Then the camera is reported as blocked
    When the phone picks one photo
    And the phone uses the scanned pages
    Then the phone is told the scan was sent to the computer
    And one scan PDF was posted

  @sender @smoke @mobile
  Scenario: An expired scan link says so
    Given a scan link that has expired
    When the phone opens the scan link
    Then the phone is told the link expired
