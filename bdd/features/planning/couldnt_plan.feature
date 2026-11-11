Feature: Couldn't plan, and attendance that defaults to everyone
  Meal Slots created without naming who attends are planned for everyone. When a slot still
  cannot be planned the planner's reasons are unchanged: no_attendance and no_candidates (with
  the counts the Today, Plan and board screens group by cause).

  Background: Monday 2026-11-09 12:00 UTC, a three-day Planning Horizon (Mon 9 to Wed 11)
    Given a running Feeder
    And the Household has the Member "Anna" with Portion Factor 1
    And the Household has the Member "Ben" with Portion Factor 1
    And the Admin adds a Dinner at 19:00 every day without naming who attends
    And the planning household plans 3 days ahead
    And the planning Recipes:
      | name  | yield | tags | needs        |
      | pasta | 2     |      | 100 g flour  |
      | soup  | 2     |      | 120 g carrot |
      | curry | 2     |      | 150 g rice   |
    And I am signed in as the User
    And the planner has finished

  Scenario: Meal Slots that do not name who attends are planned for everyone
    When I view the plan
    Then the plan has 3 slots
    And every plan slot has a Planned Meal that is not pinned
    And the plan slot on 2026-11-09 has 2 portions
    When I list the slots the planner could not plan
    Then the plan JSON "slots" has 0 items

  Scenario: A Member who joins later is counted in the portions of every Meal Slot
    Given the Household has the Member "Cleo" with Portion Factor 0.5
    And the planner has finished
    When I view the plan
    Then the plan slot on 2026-11-09 has 2.5 portions

  Scenario: Everyone opted out of a date: Couldn't plan keeps the unchanged reason
    When nobody attends the Dinner on 2026-11-10
    And the planner has finished
    And I list the slots the planner could not plan
    Then the plan JSON "slots" has 1 items
    And the plan JSON "slots.0.unfilled.reason" is "no_attendance"

  Scenario: Meal Slots made for nobody are all listed with the same reason
    Given the Admin adds the Meal Slot "Supper" on Monday at 21:00 for nobody
    And the Admin adds the Meal Slot "Supper" on Tuesday at 21:00 for nobody
    And the planner has finished
    When I list the slots the planner could not plan
    Then the plan JSON "slots" has 2 items
    And the plan JSON "slots.0.unfilled.reason" is "no_attendance"
    And the plan JSON "slots.1.unfilled.reason" is "no_attendance"
