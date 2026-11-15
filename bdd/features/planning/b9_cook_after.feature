@b9-cook-after @area-planning
Feature: Freeze keeps no stranded portion (beta.9, PC-13)
  The Freeze sheet offers every spare portion in steps of a quarter, so a Leftover of 1.25 portions freezes as 1.25 and never leaves
  0.25 behind. The server takes any amount up to what is left. (The Cooked confirmation, Get ready and the merged Leftover rows are
  screens: their scenarios are the vitest tests of B9-45. Monday 2026-11-09 12:00 UTC is today.)

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the Household keeps food in the freezer "Garage Freezer"
    And the C2 household has a Dinner on Monday at 19:00 serving "Main" and "Side" attended by Anna and Sam
    And the C2 Recipe "Chilli" for the Course "Main" uses 400 g of "beans" and has no Steps with yield 4
    And the C2 plan is empty
    And the Household was created on "2026-10-01"

  Scenario: Freezing every portion of a 1.25-portion Leftover leaves nothing behind
    Given the Leftover "Chilli" has 1.25 portions to use by 2026-11-12
    When I freeze 1.25 portions of the Leftover "Chilli" in the "Garage Freezer"
    Then the Leftover "Chilli" is frozen in the "Garage Freezer"
    And the Leftover "Chilli" has 1.25 portions left

  Scenario: Freezing a quarter of a portion keeps the rest as it was
    Given the Leftover "Chilli" has 1.25 portions to use by 2026-11-12
    When I freeze 0.25 portions of the Leftover "Chilli" in the "Garage Freezer"
    Then the Leftover "Chilli" has 1 portion left
    And the Leftover "Chilli" is not frozen
