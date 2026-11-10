Feature: Attendance defaults to everyone
  A new Meal Slot includes every current Member as attending and a new Member is added to every
  existing Meal Slot, so a Household never has to tick everybody in; people opt out. An explicit
  empty Attendance still means nobody.

  Background:
    Given a running Feeder
    And the Household has the Member "Anna" with Portion Factor 1
    And the Household has the Member "Sam" with Portion Factor 0.5

  Scenario: A new Meal Slot that does not name who attends includes every Member
    When the Admin adds the Meal Slot "Dinner" on Tuesday at 19:30 without naming who attends
    Then the response status is 201
    And the Meal Slot "Dinner" on Tuesday needs 1.5 portions
    And the Meal Slot "Dinner" on Tuesday is attended by "Anna" and "Sam"

  Scenario: A new Meal Slot can still be created for nobody
    When the Admin adds the Meal Slot "Lunch" on Saturday at 12:30 for nobody
    Then the response status is 201
    And the Meal Slot "Lunch" on Saturday needs 0 portions

  Scenario: A new Member attends every existing Meal Slot
    Given the Household has the Meal Slot "Dinner" on Tuesday at 19:30 attended by "Anna"
    And the Admin adds the Meal Slot "Lunch" on Saturday at 12:30 for nobody
    When the Household has the Member "Marco" with Portion Factor 1
    Then the Meal Slot "Dinner" on Tuesday is attended by "Anna" and "Marco"
    And the Meal Slot "Lunch" on Saturday is attended by "Marco"
    And the Meal Slot "Dinner" on Tuesday needs 2 portions

  Scenario: A new Member keeps their own Portion Factor in every Meal Slot
    Given the Admin adds the Meal Slot "Dinner" on Tuesday at 19:30 without naming who attends
    When the Household has the Member "Pia" with Portion Factor 0.25
    Then the Meal Slot "Dinner" on Tuesday needs 1.75 portions
    And the Meal Slot "Dinner" on Tuesday has no Portion Factor override for "Pia"

  Scenario: A date the Household already edited keeps its list when a Member joins
    Given the Admin adds the Meal Slot "Dinner" on Thursday at 19:00 without naming who attends
    And "Sam" is away from the Meal Slot "Dinner" on Thursday on 2026-11-12
    When the Household has the Member "Marco" with Portion Factor 1
    Then on 2026-11-12 the Meal Slot "Dinner" on Thursday needs 1 portions
    And on 2026-11-19 the Meal Slot "Dinner" on Thursday needs 2.5 portions

  Scenario: Opting out for one date is still one tap
    Given the Admin adds the Meal Slot "Dinner" on Thursday at 19:00 without naming who attends
    When "Sam" is away from the Meal Slot "Dinner" on Thursday on 2026-11-12
    Then on 2026-11-12 the Meal Slot "Dinner" on Thursday needs 1 portions
