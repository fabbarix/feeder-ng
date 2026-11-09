Feature: Favourites, Dislikes and Exclusions
  Each Member has at most one state per Recipe (Favourite, Dislike or
  Exclusion) and can exclude Ingredients. A User edits their linked Member's
  preferences by default; any signed-in User can name another Member.

  Background:
    Given a running Feeder
    And the Ingredient "flour" exists with Base Unit "g"
    And the Ingredient "peanut" exists with Base Unit "g"
    And the household has the Member "Sam" linked to "user@example.test"
    And the household has the Member "Kim" without a sign-in
    And I am signed in as the User
    And I have created the Recipe "Pad thai" tagged "noodles"

  Scenario: Marking a Favourite goes to my linked Member
    When I set the Recipe "Pad thai" to "favourite" for my Member
    Then the response status is 200
    And the preferences of the Member "Sam" show the Recipe "Pad thai" as "favourite"
    And the preferences of the Member "Kim" show the Recipe "Pad thai" as "none"

  Scenario: A Member has one state per Recipe
    Given I set the Recipe "Pad thai" to "favourite" for my Member
    When I set the Recipe "Pad thai" to "dislike" for my Member
    Then the preferences of the Member "Sam" show the Recipe "Pad thai" as "dislike"
    When I set the Recipe "Pad thai" to "none" for my Member
    Then the preferences of the Member "Sam" show the Recipe "Pad thai" as "none"

  Scenario: Setting an Exclusion for a Member without a sign-in
    When I set the Recipe "Pad thai" to "exclusion" for the Member "Kim"
    Then the response status is 200
    And the preferences of the Member "Kim" show the Recipe "Pad thai" as "exclusion"

  Scenario: Excluding an Ingredient
    When I exclude the Ingredient "peanut" for the Member "Kim"
    Then the preferences of the Member "Kim" exclude the Ingredient "peanut"
    When I allow the Ingredient "peanut" again for the Member "Kim"
    Then the preferences of the Member "Kim" do not exclude the Ingredient "peanut"

  Scenario: Unknown states are refused
    When I set the Recipe "Pad thai" to "star" for my Member
    Then the response status is 422
    And the error code is "validation_failed"

  Scenario: A User with no linked Member must name one
    Given "guest@example.test" is on the allowlist
    And I am signed in as "guest@example.test"
    When I set the Recipe "Pad thai" to "favourite" for my Member
    Then the response status is 422
    And the error code is "no_member"

  Scenario: Naming a Member that does not exist
    When I set the Recipe "Pad thai" to "favourite" for the Member with id 999
    Then the response status is 422
    And the error code is "unknown_member"

  Scenario: Archiving a Recipe keeps the preferences
    Given I set the Recipe "Pad thai" to "favourite" for my Member
    When I archive the Recipe "Pad thai"
    Then the preferences of the Member "Sam" show the Recipe "Pad thai" as "favourite"
