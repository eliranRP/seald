Feature: Sender dashboard filtering and detail view

  Background:
    Given a signed-in sender with seeded envelopes

  @sender @regression
  Scenario: Sender filters by awaiting signature and opens an envelope
    When the sender filters the dashboard by "awaiting"
    Then the seeded envelope appears in the list
