@crs-c2
Feature: Cooked and Not cooked per Course, and for the whole slot
  Each Course is marked Cooked or Not cooked on its own, deducts its own Stock and records its own Leftover (spec 8).
  Mark all Cooked and Not cooked: whole slot are new paths under .../all/; the old per-slot paths keep their old meaning
  (the main Course only) so an old cached SPA can never mark a whole slot by accident (spec 16).

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the C2 household has a Dinner on Monday at 19:00 serving "Main" and "Side" attended by Anna and Sam
    And the C2 Recipe "Roast chicken" for the Course "Main" uses 300 g of "chicken" and has a 20 minute active Step
    And the C2 Recipe "Green beans" for the Course "Side" uses 100 g of "beans" and has a 10 minute active Step with yield 4
    And the C2 Stock holds 1000 g of "chicken"
    And the C2 Stock holds 500 g of "beans"
    And the C2 plan is empty
    And the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as planned and pinned
    And the C2 plan has "Green beans" in the Course "Side" on 2026-11-09 as planned and pinned

  Scenario: Cooked on the Side deducts only the Side's Stock and leaves the Main planned
    When I mark as Cooked the Course "Side" on 2026-11-09
    Then the response status is 200
    And the answer JSON at "meal.courseName" is "Side"
    And the answer JSON at "leftover.portions" is "2"
    And the C2 meal of the Course "Side" on 2026-11-09 is cooked
    And the C2 meal of the Course "Main" on 2026-11-09 is planned
    And the C2 Stock of "beans" is 400 g
    And the C2 Stock of "chicken" is 1000 g

  Scenario: The old per-slot Cooked path marks the main Course only
    When I use the old per-slot path to mark 2026-11-09 as Cooked
    Then the response status is 200
    And the answer JSON at "meal.courseName" is "Main"
    And the C2 meal of the Course "Main" on 2026-11-09 is cooked
    And the C2 meal of the Course "Side" on 2026-11-09 is planned

  Scenario: The old per-slot Not cooked path skips the main Course only
    When I use the old per-slot path to mark 2026-11-09 as Not cooked
    Then the response status is 200
    And the C2 meal of the Course "Main" on 2026-11-09 is skipped
    And the C2 meal of the Course "Side" on 2026-11-09 is planned

  Scenario: Not cooked on one Course leaves the other
    When I mark as Not cooked the Course "Side" on 2026-11-09
    Then the response status is 200
    And the C2 meal of the Course "Side" on 2026-11-09 is skipped
    And the C2 meal of the Course "Main" on 2026-11-09 is planned
    And the C2 Stock of "beans" is 500 g

  Scenario: Mark all Cooked cooks every Course together and keeps what the cook chose
    When I mark all Courses on 2026-11-09 as Cooked keeping 1 portions of the Course "Side"
    Then the response status is 200
    And the C2 meal of the Course "Main" on 2026-11-09 is cooked
    And the C2 meal of the Course "Side" on 2026-11-09 is cooked
    And the C2 Stock of "chicken" is 700 g
    And the C2 Stock of "beans" is 400 g
    And the answer JSON at "leftovers.0.portions" is "1"

  Scenario: Mark all Cooked is all or nothing
    When I mark all Courses on 2026-11-09 as Cooked keeping 99 portions of the Course "Side"
    Then the response status is 422
    And the answer JSON at "error.field" is "courses[0].leftoverPortions"
    And the C2 meal of the Course "Main" on 2026-11-09 is planned
    And the C2 meal of the Course "Side" on 2026-11-09 is planned
    And the C2 Stock of "chicken" is 1000 g
    And the C2 Stock of "beans" is 500 g

  Scenario: Not cooked: whole slot skips every unresolved Course
    When I mark the whole slot on 2026-11-09 as Not cooked
    Then the response status is 200
    And the C2 meal of the Course "Main" on 2026-11-09 is skipped
    And the C2 meal of the Course "Side" on 2026-11-09 is skipped
    And the C2 Stock of "chicken" is 1000 g

  Scenario: There is nothing to mark once the slot is resolved
    Given I mark the whole slot on 2026-11-09 as Not cooked
    When I mark the whole slot on 2026-11-09 as Not cooked
    Then the response status is 409
    And the answer JSON at "error.code" is "already_resolved"

  Scenario: Unconfirmed Courses are listed one by one
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-02 as planned
    And the C2 plan has "Green beans" in the Course "Side" on 2026-11-02 as planned
    When I list the C2 meals to confirm
    Then the C2 answer lists the Courses "Main", "Side" in that order

  Scenario: Couldn't plan is listed per Course
    Given the C2 plan is empty
    And the C2 plan could not fill the Course "Main" on 2026-11-09 because "no_candidates"
    And the C2 plan could not fill the Course "Side" on 2026-11-09 because "no_course_recipes"
    When I list the C2 slots the planner could not plan
    Then the C2 answer lists the Courses "Main", "Side" in that order
