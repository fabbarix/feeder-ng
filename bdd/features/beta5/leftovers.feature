@b5-lo
Feature: Leftovers by hand: Had it, Threw it out, Freeze it, Take out, and asking before waste (beta.5, plan 2.3, ADR 0012)
  A User records what happened to a Leftover: Had it (portions had outside the plan, not waste), Threw it out (waste dated
  the day it happened), Freeze it (to a Freezer, with a Frozen Use-by) and Take out. Feeder no longer throws a Leftover
  away at 03:00: one past its Use-by is to be answered (Had it, Threw it out or Wasn't there), and until then it counts
  nothing. Frozen Leftovers are planned only when a User picks them. Monday 2026-11-09 12:00 UTC is today; the Household
  was created on 2026-10-01 (a streak of 39 days); the Dinner at 19:00 serves Main and Side for Anna and Sam (2 portions
  each); the Household's Frozen Use-by is the default 90 days and its Use-by 3 days.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the Household keeps food in the freezer "Garage Freezer"
    And the Household keeps food in the fridge "Kitchen Fridge"
    And the C2 household has a Dinner on Monday at 19:00 serving "Main" and "Side" attended by Anna and Sam
    And the C2 Recipe "Chilli" for the Course "Main" uses 400 g of "beans" and has no Steps with yield 4
    And the C2 plan is empty
    And the Household was created on "2026-10-01"

  # ---- Had it, Threw it out ----

  Scenario: Had it takes two portions off a Leftover without counting waste
    Given the Leftover "Chilli" has 4 portions to use by 2026-11-12
    When I had 2 portions of the Leftover "Chilli"
    Then the Leftover "Chilli" has 2 portions left
    And the Household has recorded no waste
    When I ask for the zero-waste streak
    Then the streak is 39 days

  Scenario: Threw it out counts waste today and starts the streak again
    Given the Leftover "Chilli" has 4 portions to use by 2026-11-12
    When I threw out 3 portions of the Leftover "Chilli"
    Then the Household has recorded waste of 3 portions dated 2026-11-09
    And the Leftover "Chilli" has 1 portion left
    When I ask for the zero-waste streak
    Then the streak is 0 days

  Scenario: Had it more than is left is refused
    Given the Leftover "Chilli" has 2 portions to use by 2026-11-12
    When I try to have 3 portions of the Leftover "Chilli"
    Then the Leftover answer is 422 with the code "portions_invalid"
    And the Leftover "Chilli" has 2 portions left

  Scenario: A meal that loses its portions is planned again
    Given the Leftover "Chilli" has 4 portions to use by 2026-11-12
    And the C2 plan has the Course "Main" on 2026-11-09 served from the Leftover "Chilli" and pinned
    When I had 3 portions of the Leftover "Chilli"
    Then the Course "Main" on 2026-11-09 is not served from the Leftover "Chilli"
    And the Course "Main" on 2026-11-09 is not pinned

  # ---- Freeze it, Take out ----

  Scenario: Freeze it moves a Leftover to the Garage Freezer with a 90-day Use-by
    Given the Leftover "Chilli" has 3 portions to use by 2026-11-12
    When I freeze the Leftover "Chilli" in the "Garage Freezer"
    Then the Leftover "Chilli" is frozen in the "Garage Freezer"
    And the Leftover "Chilli" is to be used by 2027-02-07
    And the Household has recorded no waste

  Scenario: Freezing part of a Leftover keeps the portions Monday's dinner needs
    Given the Leftover "Chilli" has 4 portions to use by 2026-11-12
    And the C2 plan has the Course "Main" on 2026-11-09 served from the Leftover "Chilli" and pinned
    When I freeze 2 portions of the Leftover "Chilli" in the "Garage Freezer"
    Then the Leftover "Chilli" has 2 portions left
    And the Leftover "Chilli" is not frozen
    And 2 portions of "Chilli" are frozen in the "Garage Freezer"
    And the Course "Main" on 2026-11-09 is served from the Leftover "Chilli"
    And the Course "Main" on 2026-11-09 is pinned

  Scenario: A frozen Leftover shows with its Freezer, its date and the portions planned from it
    Given the Leftover "Chilli" has 4 portions to use by 2027-02-07 and has been frozen on 2026-11-02 in the "Garage Freezer"
    And the C2 plan has the Course "Main" on 2026-11-09 served from the Leftover "Chilli" and pinned
    Then the Leftover "Chilli" is frozen in the "Garage Freezer"
    And the Leftover "Chilli" has 2 portions planned

  Scenario: A frozen Leftover is not planned automatically
    Given the Leftover "Chilli" has 4 portions to use by 2027-02-07 and has been frozen on 2026-11-02 in the "Garage Freezer"
    When the planner plans again
    Then the Course "Main" on 2026-11-09 has a fresh Planned Meal of "Chilli"
    And the Leftover "Chilli" has 4 portions left

  Scenario: Choosing a frozen Leftover for a Course pins it
    Given the Leftover "Chilli" has 4 portions to use by 2027-02-07 and has been frozen on 2026-11-02 in the "Garage Freezer"
    When I choose the frozen Leftover "Chilli" for the Course "Main" on 2026-11-09
    Then the Course "Main" on 2026-11-09 is served from the Leftover "Chilli"
    And the Course "Main" on 2026-11-09 is pinned
    And the Leftover "Chilli" is frozen in the "Garage Freezer"

  Scenario: Cooking a meal served from a frozen Leftover takes only the portions it uses
    Given the Leftover "Chilli" has 4 portions to use by 2027-02-07 and has been frozen on 2026-11-02 in the "Garage Freezer"
    And the C2 plan has the Course "Main" on 2026-11-09 served from the Leftover "Chilli"
    When I mark as Cooked the Course "Main" on 2026-11-09
    Then the Leftover "Chilli" has 2 portions left
    And the Leftover "Chilli" is frozen in the "Garage Freezer"

  Scenario: Take out gives the Leftover the Recipe's Use-by from today
    Given the Leftover "Chilli" has 3 portions to use by 2027-02-07 and has been frozen on 2026-11-02 in the "Garage Freezer"
    When I take the Leftover "Chilli" out of the freezer
    Then the Leftover "Chilli" is not frozen
    And the Leftover "Chilli" is to be used by 2026-11-12

  Scenario: Deleting the Freezer leaves the Leftover frozen under Not sorted
    Given the Leftover "Chilli" has 3 portions to use by 2027-02-07 and has been frozen on 2026-11-02 in the "Garage Freezer"
    When I delete the Storage Place "Garage Freezer"
    Then the Leftover "Chilli" is frozen and Not sorted

  Scenario: Freeze it is not offered without a Freezer
    Given the Leftover "Chilli" has 3 portions to use by 2026-11-12
    When I try to freeze the Leftover "Chilli" in the "Kitchen Fridge"
    Then the Leftover answer is 422 with the code "storage_place_not_freezer"
    And the Leftover "Chilli" is not frozen

  Scenario: A Leftover past its Use-by cannot be frozen
    Given the Leftover "Chilli" has 3 portions to use by 2026-11-08
    When I try to freeze the Leftover "Chilli" in the "Garage Freezer"
    Then the Leftover answer is 409 with the code "leftover_past_use_by"

  # ---- Asking before waste ----

  Scenario: A Leftover past its Use-by asks before it counts as waste
    Given the Leftover "Chilli" has 3 portions to use by 2026-11-08
    And the household clock is 2026-11-10 03:00 UTC
    When the scheduler runs its due jobs
    Then the Leftover "Chilli" is to be answered
    And the Leftover "Chilli" has 3 portions left
    And the Household has recorded no waste
    When I ask for the zero-waste streak
    Then the streak is 40 days

  Scenario: Answering Threw it out dates the waste the day after the Use-by
    Given the Leftover "Chilli" has 3 portions to use by 2026-11-04
    When I answer that I threw it out for the Leftover "Chilli"
    Then the Household has recorded waste of 3 portions dated 2026-11-05
    When I ask for the zero-waste streak
    Then the streak is 4 days

  Scenario: Answering Had it is not waste
    Given the Leftover "Chilli" has 3 portions to use by 2026-11-04
    When I answer that I had it for the Leftover "Chilli"
    Then the Household has recorded no waste
    And the Leftover "Chilli" has 0 portions left
    When I ask for the zero-waste streak
    Then the streak is 39 days

  Scenario: Answering Wasn't there removes the Leftover without waste
    Given the Leftover "Chilli" has 3 portions to use by 2026-11-04
    When I answer that I wasn't there for the Leftover "Chilli"
    Then the Leftover "Chilli" is gone
    And the Household has recorded no waste
    When I ask for the zero-waste streak
    Then the streak is 39 days

  Scenario: A Leftover still good cannot be answered
    Given the Leftover "Chilli" has 3 portions to use by 2026-11-09
    When I try to answer that I had it for the Leftover "Chilli"
    Then the Leftover answer is 409 with the code "leftover_not_to_answer"
