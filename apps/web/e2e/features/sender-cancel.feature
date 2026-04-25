Feature: Sender cancels an in-flight envelope

  Background:
    Given a signed-in sender viewing an in-flight envelope

  @sender @regression @fixme
  Scenario: Sender cancels before recipient signs
    When the sender cancels the envelope
    Then the envelope is marked cancelled
