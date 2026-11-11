Feature: Planning with Courses
  A Meal Slot serves one or more Courses and the planner plans one Planned Meal for each (ADR 0008). A Whole meal in
  the main Course covers the others, an optional Course is left empty when nothing fits, and a Member who does not eat
  a Course neither counts for its portions nor for its Exclusions.

  Background: Monday 2026-11-09 12:00 UTC, a three-day Planning Horizon
    Given a running Feeder
    And the planning household has the Members "Anna" and "Ben"
    And the planning household has a Dinner at 19:00 every day attended by "Anna" and "Ben"
    And the planning household plans 3 days ahead
    And the planning Recipes:
      | name   | yield | tags | needs         |
      | pasta  | 2     |      | 100 g flour   |
      | soup   | 2     |      | 120 g carrot  |
      | curry  | 2     |      | 150 g rice    |
      | rice   | 2     |      | 150 g basmati |
      | beans  | 2     |      | 90 g bean     |
      | slaw   | 2     |      | 80 g cabbage  |
    And the planning Recipe "rice" is served only as the Course "Side"
    And the planning Recipe "beans" is served only as the Course "Side"
    And the planning Recipe "slaw" is served only as the Course "Side"
    And I am signed in as the User

  Scenario: A Dinner with a Main and a Side plans a Planned Meal for each Course
    Given every planning Dinner also serves the Course "Side"
    When I regenerate the plan
    Then the Dinner on 2026-11-09 has 2 Planned Meals
    And the Dinner on 2026-11-09 plans one of "pasta, soup, curry" in the Course "Main"
    And the Dinner on 2026-11-09 plans one of "rice, beans, slaw" in the Course "Side"
    And the Dinner on 2026-11-10 has 2 Planned Meals

  Scenario: A Whole meal in the main Course leaves the Side unplanned
    Given every planning Dinner also serves the Course "Side"
    And the planning Recipe "soup" is a Whole meal
    And the planning Recipe "pasta" is served only as the Course "Side"
    And the planning Recipe "curry" is served only as the Course "Side"
    When I regenerate the plan
    Then the Dinner on 2026-11-09 has 1 Planned Meal
    And the Dinner on 2026-11-09 plans one of "soup" in the Course "Main"
    And the Dinner on 2026-11-09 plans nothing in the Course "Side"
    And the Course "Side" of the Dinner on 2026-11-09 has no 'couldn't plan' reason

  Scenario: A Member who does not eat the Side is left out of its portions
    Given every planning Dinner also serves the Course "Side"
    And "Ben" does not eat the Course "Side" at the planning Dinner
    When I regenerate the plan
    Then the Dinner on 2026-11-09 plans 2 portions in the Course "Main"
    And the Dinner on 2026-11-09 plans 1 portions in the Course "Side"

  Scenario: A required Course with no Recipe is couldn't plan with its own reason
    Given every planning Dinner also serves the Course "Starter"
    When I regenerate the plan
    Then the Dinner on 2026-11-09 has 1 Planned Meal
    And the Course "Starter" of the Dinner on 2026-11-09 could not be planned because "no_course_recipes"

  Scenario: An optional Course with no Recipe is left empty without a reason
    Given every planning Dinner also serves the Course "Dessert" as an optional Course
    When I regenerate the plan
    Then the Dinner on 2026-11-09 has 1 Planned Meal
    And the Course "Dessert" of the Dinner on 2026-11-09 has no 'couldn't plan' reason
