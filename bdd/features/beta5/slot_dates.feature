@b5-sd
Feature: A Meal Slot on one date: Not served, Time today, Guests (beta.5, plan 2.1 and 2.2, ADR 0014)
  Any User may mark a Meal Slot Not served on a date, give it its own time, and say how many Guests eat. The planner
  follows: a Not served slot is left empty with no Couldn't plan warning, the date's time reaches the plan and the
  reminders, and each Guest is one standard portion of every Course. Monday 2026-11-09 12:00 UTC is today; the Dinner
  at 19:00 serves Main and Side for Anna and Sam, and the Planning Horizon is the default 7 days (today only).

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the C2 household has a Dinner on Monday at 19:00 serving "Main" and "Side" attended by Anna and Sam
    And the C2 Recipe "Roast chicken" for the Course "Main" uses 400 g of "chicken" and has no Steps
    And the C2 Recipe "Green beans" for the Course "Side" uses 200 g of "beans" and has no Steps
    And the C2 plan is empty

  # ---- Not served ----

  Scenario: Marking Monday dinner Not served empties it without a Couldn't plan warning
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as planned
    When I mark the Dinner of 2026-11-09 Not served
    And the planner has finished
    And I view the C2 plan for 2026-11-09
    Then the plan slot shows the Dinner Not served
    And the C2 Course "Main" is unserved because "not_served"
    And the C2 Course "Side" is unserved because "not_served"
    And the Dinner of 2026-11-09 has no Planned Meal
    When I list the C2 slots the planner could not plan
    Then the C2 answer lists no Courses

  Scenario: Not served lists Pinned Planned Meals before removing them
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as planned and pinned
    And the C2 plan has "Green beans" in the Course "Side" on 2026-11-09 as planned
    When I ask what Not served would remove from the Dinner of 2026-11-09
    Then Not served would remove "Roast chicken" from the Course "Main" as Pinned
    And Not served would remove "Green beans" from the Course "Side"
    And the Dinner of 2026-11-09 is served
    When I mark the Dinner of 2026-11-09 Not served
    And the planner has finished
    Then the Dinner of 2026-11-09 has no Planned Meal

  Scenario: Undo after Not served plans the slot again
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as planned and pinned
    When I mark the Dinner of 2026-11-09 Not served
    And the planner has finished
    And I mark the Dinner of 2026-11-09 served again
    And the planner has finished
    And I view the C2 plan for 2026-11-09
    Then the Dinner of 2026-11-09 is served
    And the C2 Course "Main" holds "Roast chicken"
    And the C2 Course "Side" holds "Green beans"

  Scenario: Saving Who's eating with nobody marks the date Not served
    When I save Who's eating for the Dinner of 2026-11-09 with nobody and no Guests
    And the planner has finished
    Then the Dinner of 2026-11-09 is Not served
    And the Dinner of 2026-11-09 has no Planned Meal
    When I list the C2 slots the planner could not plan
    Then the C2 answer lists no Courses

  Scenario: Plan Dinner again brings back the usual Attendance of an emptied date
    Given I save Who's eating for the Dinner of 2026-11-09 with nobody and no Guests
    When I mark the Dinner of 2026-11-09 served again
    And the planner has finished
    And I view the C2 plan for 2026-11-09
    Then the Dinner of 2026-11-09 is served
    And the Dinner of 2026-11-09 plans for 2 portions in the Course "Main"

  Scenario: A slot with no usual attendees is still Couldn't plan
    Given nobody usually attends the Dinner
    When the planner replans because Who's eating changed
    And I list the C2 slots the planner could not plan
    Then the C2 answer lists the Courses "Main" and "Side" in that order
    And the Dinner of 2026-11-09 is served

  Scenario: Not served is not offered once a Course is Cooked
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as cooked
    And the C2 plan has "Green beans" in the Course "Side" on 2026-11-09 as planned
    When I try to mark the Dinner of 2026-11-09 Not served
    Then the Dinner answers 422 slot_started
    And the Dinner of 2026-11-09 is served

  Scenario: Not served is not offered for a past date
    When I try to mark the Dinner of 2026-11-02 Not served
    Then the Dinner answers 422 date_past

  Scenario: Saving who is eating on a Not served date serves it again
    Given I mark the Dinner of 2026-11-09 Not served
    When I save Who's eating for the Dinner of 2026-11-09 with Anna
    And the planner has finished
    Then the Dinner of 2026-11-09 is served

  Scenario: Setting a Recipe on a Not served date is refused
    Given I mark the Dinner of 2026-11-09 Not served
    When I put "Roast chicken" in the Course "Main" on 2026-11-09
    Then the Dinner answers 422 with the code "not_served"

  # ---- Time today ----

  Scenario: Time today moves the Advance Step reminder
    Given the sd Recipe "Marinated chicken" for the Course "Main" has a 120 minute Advance Step
    And the C2 plan has "Marinated chicken" in the Course "Main" on 2026-11-09 as planned
    When I set the Dinner time on 2026-11-09 to 20:15
    And the planner has finished
    Then the Dinner of 2026-11-09 is at 20:15, usually at 19:00
    And today's Advance Step "Marinate" is due at 18:15

  Scenario: Time today moves the start time of the cooking timeline
    Given the C2 Recipe "Lasagne" for the Course "Main" uses 300 g of "pasta" and has a 30 minute active Step
    And the C2 plan has "Lasagne" in the Course "Main" on 2026-11-09 as planned
    When I set the Dinner time on 2026-11-09 to 20:15
    And the planner has finished
    And I view the C2 plan for 2026-11-09
    Then the C2 slot takes 30 minutes to cook
    And the C2 slot should be started by 19:45

  Scenario: Back to the usual time removes the date's time
    Given I set the Dinner time on 2026-11-09 to 20:15
    When I put the Dinner time on 2026-11-09 back to the usual one
    Then the Dinner of 2026-11-09 has no time of its own
    And the Dinner of 2026-11-09 is at 19:00, usually at 19:00

  Scenario: A time that is not a time is refused
    When I try to set the Dinner time on 2026-11-09 to 25:00
    Then the Dinner answers 422 time_invalid
    And the Dinner of 2026-11-09 has no time of its own

  Scenario: A User who is not an Admin can use every choice of the slot menu
    Given I am signed in as the User
    When I set the Dinner time on 2026-11-09 to 20:00
    And I set 2 Guests at the Dinner of 2026-11-09
    And I mark the Dinner of 2026-11-09 Not served
    Then the Dinner of 2026-11-09 is at 20:00, usually at 19:00
    And the Dinner of 2026-11-09 has 2 Guests
    And the Dinner of 2026-11-09 is Not served

  # ---- Guests ----

  Scenario: Two Guests add two portions to every Course of Monday dinner
    When I set 2 Guests at the Dinner of 2026-11-09
    And the planner has finished
    And I view the C2 plan for 2026-11-09
    Then the Dinner of 2026-11-09 plans for 4 portions in the Course "Main"
    And the Dinner of 2026-11-09 plans for 4 portions in the Course "Side"
    And the plan slot shows 2 Guests

  Scenario: Guests raise the Batches of a Pinned Planned Meal and the Shopping List
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as planned and pinned
    When I set 2 Guests at the Dinner of 2026-11-09
    And the planner has finished
    And I view the C2 plan for 2026-11-09
    Then the C2 Course "Main" holds "Roast chicken"
    And the Course "Main" on 2026-11-09 is pinned with 2 Batches
    When I view the Shopping List
    Then the Shopping List needs 800 g of "chicken"

  Scenario: Guests raise the Batches of a Planned Meal instead of replacing its Recipe
    Given the C2 plan has "Roast chicken" in the Course "Main" on 2026-11-09 as planned
    When I set 2 Guests at the Dinner of 2026-11-09
    And the planner has finished
    And I view the C2 plan for 2026-11-09
    Then the C2 Course "Main" holds "Roast chicken"
    And the Course "Main" on 2026-11-09 is not pinned with 2 Batches

  Scenario: A Course every Member opts out of is planned for Guests
    Given Anna and Sam both skip the Course "Side" at that Dinner
    When I set 2 Guests at the Dinner of 2026-11-09
    And the planner has finished
    And I view the C2 plan for 2026-11-09
    Then the C2 Course "Side" holds "Green beans"
    And the Dinner of 2026-11-09 plans for 2 portions in the Course "Side"

  Scenario: A Course every Member opts out of stays empty without Guests
    Given Anna and Sam both skip the Course "Side" at that Dinner
    When the planner replans because Who's eating changed
    And I view the C2 plan for 2026-11-09
    Then the C2 Course "Side" is unserved because "no_course_attendance"

  Scenario: A date of Guests and no Member is planned
    When I save Who's eating for the Dinner of 2026-11-09 with nobody and 3 Guests
    And the planner has finished
    And I view the C2 plan for 2026-11-09
    Then the Dinner of 2026-11-09 is served
    And the C2 Course "Main" holds "Roast chicken"
    And the Dinner of 2026-11-09 plans for 3 portions in the Course "Main"

  Scenario: Reset to usual clears the Guests
    Given I set 4 Guests at the Dinner of 2026-11-09
    When I reset Who's eating for the Dinner of 2026-11-09
    Then the Dinner of 2026-11-09 has 0 Guests

  Scenario: More Guests than the sheet allows are refused
    When I try to set 21 Guests at the Dinner of 2026-11-09
    Then the Dinner answers 422 guests_invalid
    And the Dinner of 2026-11-09 has 0 Guests
