@b5-r
Feature: Recipes sorted by last cooked
  The Recipe list and detail say when a Recipe was last Cooked: the latest date of a Cooked, fresh Planned Meal of that
  Recipe, in any Course. A meal served from a Leftover does not count (nothing was cooked), and the Planned Meal's
  date counts, not the day it was marked. GET /api/recipes?sort=last_cooked_asc|last_cooked_desc orders the list; the
  plan's tables stay behind the plan store (beta.5 F7, reconcile 7.3).

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the last-cooked Recipes "Apple pie", "Borscht", "Chilli", "Dal" exist

  Scenario: Recipes sorted by last cooked, longest ago first, start with Recipes not cooked yet
    Given the Recipe "Chilli" was Cooked fresh on 2026-11-08
    And the Recipe "Dal" was Cooked fresh on 2026-09-28
    And the Recipe "Apple pie" was Cooked fresh on 2026-10-01
    When I list the Recipes sorted by "last_cooked_asc"
    Then the response status is 200
    And the listed Recipes are "Borscht, Dal, Apple pie, Chilli" in that order
    When I list the Recipes sorted by "last_cooked_desc"
    Then the listed Recipes are "Chilli, Apple pie, Dal, Borscht" in that order

  Scenario: The list is by name unless a sort is asked for
    Given the Recipe "Chilli" was Cooked fresh on 2026-11-08
    When I list the Recipes sorted by "name"
    Then the listed Recipes are "Apple pie, Borscht, Chilli, Dal" in that order
    When I list the Recipes sorted by ""
    Then the listed Recipes are "Apple pie, Borscht, Chilli, Dal" in that order

  Scenario: A sort the list does not know is refused
    When I list the Recipes sorted by "newest"
    Then the response status is 422
    And the error code is "validation_failed"

  Scenario: A Leftover served on Wednesday does not change the last cooked date
    Given the Recipe "Chilli" was Cooked fresh on 2026-11-02
    And the Recipe "Chilli" was served from a Leftover and Cooked on 2026-11-04
    When I read the Recipe "Chilli"
    Then the Recipe shows last cooked "2026-11-02"

  Scenario: A Planned Meal that was not Cooked does not count
    Given the Recipe "Chilli" was Cooked fresh on 2026-10-05
    And the Recipe "Chilli" was planned but not Cooked on 2026-11-02
    And the Recipe "Dal" was marked Not cooked on 2026-11-03
    When I read the Recipe "Chilli"
    Then the Recipe shows last cooked "2026-10-05"
    When I read the Recipe "Dal"
    Then the Recipe shows no last cooked date

  Scenario: A Cooked meal in any Course counts and the Planned Meal's date wins over the day it was marked
    Given the Recipe "Apple pie" was Cooked fresh as the Dessert on 2026-11-03 and marked on 2026-11-09
    When I read the Recipe "Apple pie"
    Then the Recipe shows last cooked "2026-11-03"

  Scenario: The Recipe list and the Recipe detail say when it was last cooked
    Given the Recipe "Chilli" was Cooked fresh on 2026-11-08
    When I list the Recipes sorted by "name"
    Then the Recipe "Chilli" in the list shows last cooked "2026-11-08"
    And the Recipe "Borscht" in the list shows no last cooked date
    When I read the Recipe "Chilli"
    Then the response status is 200
    And the Recipe shows last cooked "2026-11-08"
    When I read the Recipe "Borscht"
    Then the Recipe shows no last cooked date
