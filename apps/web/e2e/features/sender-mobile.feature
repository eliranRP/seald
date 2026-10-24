Feature: Sender uses Seald from a phone-sized viewport
  # Redesign v2 retired the separate mobile send wizard (/m/send). Phones use
  # the same responsive screens as the desktop (Home, Upload, Prepare); the old
  # URL only forwards to the documents list so bookmarks keep working.

  Background:
    Given a signed-in sender on a 375x667 phone

  @sender @smoke @mobile
  Scenario: Mobile sender lands on the responsive documents page
    When the sender visits the root
    Then the URL is /documents

  @sender @smoke @mobile
  Scenario: The retired mobile send link forwards to the documents page
    When the sender opens the old mobile send link
    Then the URL is /documents
