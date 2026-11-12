@crs-c2
Feature: The plan API per Course
  A Meal Slot serves ordered Courses and each is its own Planned Meal (ADR 0008, spec 7.5 and 16). GET /api/plan lists
  the Courses of every slot; Set, Pin, Swap, Cooked and Not cooked work on one Course. The course-less routes are gone
  (C3): they answer 404, and a slot carries its meal and reason on its Course rows only.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the C2 household has a Dinner on Monday at 19:00 serving "Main" and "Side" attended by Anna and Sam
    And the C2 Recipe "Roast chicken" for the Course "Main" uses 300 g of "chicken" and has a 20 minute active Step
    And the C2 Recipe "Beef stew" for the Course "Main" as a Whole meal uses 400 g of "beef" and has a 40 minute active Step
    And the C2 Recipe "Green beans" for the Course "Side" uses 100 g of "beans" and has a 10 minute active Step with yield 4
    And the C2 Recipe "Peas" for the Course "Side" uses 100 g of "peas" and has no Steps
    And the C2 Recipe "Leeks" for the Course "Side" uses 100 g of "leeks" and has no Steps
    And the C2 Recipe "Carrots" for the Course "Side" uses 100 g of "carrots" and has no Steps
    And the C2 plan is empty

  Scenario: The plan lists each Course of the slot in the slot's order
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as planned
    And the C2 plan has "Green beans" in the Course "Side" on 2026-11-09 as planned and pinned
    When I view the C2 plan for 2026-11-09
    Then the response status is 200
    And the C2 plan lists the Courses "Main", "Side" in that order
    And the C2 Course "Main" holds "Roast chicken"
    And the C2 Course "Side" holds "Green beans"

  Scenario: A Whole meal in the main Course covers the Side
    Given the C2 plan has "Beef stew" in the Course "Main" on 2026-11-09 as planned
    When I view the C2 plan for 2026-11-09
    Then the C2 Course "Side" is covered by "Beef stew"

  Scenario: A Course nobody eats is unserved, an optional Course left empty too
    Given the Course "Side" of that Dinner is optional
    And Anna and Sam both skip the Course "Side" at that Dinner
    And the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as planned
    When I view the C2 plan for 2026-11-09
    Then the C2 Course "Side" is unserved because "no_course_attendance"

  Scenario: Couldn't plan is kept per Course
    Given the C2 plan could not fill the Course "Side" on 2026-11-09 because "no_course_recipes"
    When I view the C2 plan for 2026-11-09
    Then the C2 Course "Side" has the reason "no_course_recipes"

  Scenario: The slot takes as long as its cooking timeline
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as planned
    And the C2 plan has "Green beans" in the Course "Side" on 2026-11-09 as planned
    When I view the C2 plan for 2026-11-09
    Then the C2 slot takes 30 minutes to cook

  Scenario: Nothing to cook once every Course is resolved
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as cooked
    And the C2 plan has "Green beans" in the Course "Side" on 2026-11-09 as skipped
    When I view the C2 plan for 2026-11-09
    Then the C2 slot has nothing left to cook

  Scenario: Setting the Side pins it and leaves the Main alone
    When I put "Green beans" in the Course "Side" on 2026-11-09
    Then the response status is 200
    And the answer JSON at "courseName" is "Side"
    And the answer JSON at "pinned" is "true"

  Scenario: A Recipe from another Course is refused
    When I put "Roast chicken" in the Course "Side" on 2026-11-09
    Then the response status is 422
    And the answer JSON at "error.code" is "recipe_not_in_course"

  Scenario: A Recipe cannot stand in two Courses of one slot
    Given the C2 Recipe "Salad" for the Course "Main" uses 50 g of "lettuce" and has no Steps
    And the C2 Recipe "Salad" is also marked for the Course "Side"
    And the C2 plan is empty
    And the C2 plan has "Salad" in the Course "Main" on 2026-11-09 as planned
    When I put "Salad" in the Course "Side" on 2026-11-09
    Then the response status is 409
    And the answer JSON at "error.code" is "recipe_in_slot"

  Scenario: A Whole meal in the main Course removes the unpinned Side and says so
    Given the C2 plan has "Green beans" in the Course "Side" on 2026-11-09 as planned
    When I put "Beef stew" in the Course "Main" on 2026-11-09
    Then the response status is 200
    And the answer covers the Course "Side"
    And the C2 Course "Side" on 2026-11-09 has no Planned Meal

  Scenario: The course-less path is gone and sets nothing
    When I put "Roast chicken" in the main Course on 2026-11-09 by the removed course-less path
    Then the response status is 404
    And the C2 Course "Main" on 2026-11-09 has no Planned Meal

  Scenario: A slot carries no meal or unfilled of its own
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as planned
    Then the C2 plan slot on 2026-11-09 carries no "meal" of its own
    And the C2 plan slot on 2026-11-09 carries no "unfilled" of its own

  Scenario: Side alternatives are strict first and relaxed last
    Given the C2 plan has "Green beans" in the Course "Side" on 2026-11-09 as planned
    And the C2 Recipe "Carrots" was cooked in the Course "Side" on 2026-11-08
    When I ask for the alternatives of the Course "Side" on 2026-11-09
    Then the response status is 200
    And the answer's alternative 3 is "Carrots" and relaxed
    And the answer's alternative 3 ends with the why chip "cooldown_relaxed"
    And the plan JSON "alternatives" has 3 items
