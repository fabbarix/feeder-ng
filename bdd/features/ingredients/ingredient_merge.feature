Feature: Merging Ingredients
  Two Ingredients that turn out to be the same can be merged. Everything that pointed
  at the first now points at the second, their Unit Conversions combine, and anything
  they disagree on must be settled by hand.

  Background:
    Given a running Feeder
    And I am signed in as the User

  Scenario: Merge combines conversions and moves references
    Given the Household has these Ingredients:
      | name         | baseUnit | shelfLifeDays | conversions       |
      | spring onion | g        |               | bunch=80;stalk=15 |
      | scallion     | g        | 7             | stalk=15;cup=100  |
    And the Ingredient "spring onion" is referenced 2 times by other features
    And the Ingredient "scallion" is referenced 1 times by other features
    When I merge the Ingredient "spring onion" into "scallion"
    Then the response status is 200
    And the response JSON field "name" is "scallion"
    And the response JSON field "shelfLifeDays" is "7"
    And the Ingredient response conversions are:
      | unit  | toBase |
      | bunch | 80     |
      | cup   | 100    |
      | stalk | 15     |
    And the Ingredient "scallion" has 3 references from other features
    And the Ingredient "spring onion" no longer exists

  Scenario: The preview lists the conflicts and changes nothing
    Given the Household has these Ingredients:
      | name           | baseUnit | shelfLifeDays | conversions       |
      | passata        | ml       | 5             | jar=700;can=400   |
      | tomato puree   | ml       | 9             | jar=680;can=400   |
    And the Ingredient "passata" is referenced 4 times by other features
    When I preview merging the Ingredient "passata" into "tomato puree"
    Then the response status is 200
    And the response JSON field "blocked" is ""
    And the merge conflicts are:
      | kind       | unit | source | target |
      | conversion | jar  | 700    | 680    |
      | shelfLife  |      | 5      | 9      |
    And the response JSON field "sourceReferences.bdd test references" is "4"
    And the Ingredient "passata" still exists

  Scenario: Unresolved conflicts stop the merge
    Given the Household has these Ingredients:
      | name         | baseUnit | shelfLifeDays | conversions |
      | passata      | ml       | 5             | jar=700     |
      | tomato puree | ml       | 9             | jar=680     |
    And the Ingredient "passata" is referenced 1 times by other features
    When I merge the Ingredient "passata" into "tomato puree"
    Then the response status is 409
    And the error code is "merge_conflicts"
    And the Ingredient "passata" still exists
    And the Ingredient "passata" has 1 reference from other features

  Scenario: Resolving every conflict explicitly completes the merge
    Given the Household has these Ingredients:
      | name         | baseUnit | shelfLifeDays | conversions |
      | passata      | ml       | 5             | jar=700     |
      | tomato puree | ml       | 9             | jar=680     |
    When I merge the Ingredient "passata" into "tomato puree" with resolutions:
      """
      {"conversions": {"jar": 690}, "shelfLifeDays": 5}
      """
    Then the response status is 200
    And the Ingredient response conversions are:
      | unit | toBase |
      | jar  | 690    |
    And the response JSON field "shelfLifeDays" is "5"

  Scenario: A Shelf Life conflict can be resolved to "none"
    Given the Household has these Ingredients:
      | name | baseUnit | shelfLifeDays | conversions |
      | a    | g        | 5             |             |
      | b    | g        | 9             |             |
    When I merge the Ingredient "a" into "b" with resolutions:
      """
      {"shelfLifeDays": null}
      """
    Then the response status is 200
    And the Ingredient response has no Shelf Life

  Scenario: Different Base Units cannot be merged
    Given the Household has these Ingredients:
      | name  | baseUnit | shelfLifeDays | conversions |
      | flour | g        |               |             |
      | milk  | ml       |               |             |
    When I preview merging the Ingredient "flour" into "milk"
    Then the response JSON field "blocked" is "base_unit_mismatch"
    When I merge the Ingredient "flour" into "milk"
    Then the response status is 409
    And the error code is "base_unit_mismatch"
    And the Ingredient "flour" still exists

  Scenario: An Ingredient cannot be merged into itself
    Given the Household has the Ingredient "flour" with Base Unit g
    When I merge the Ingredient "flour" into "flour"
    Then the response status is 400
    And the error code is "merge_self"

  Scenario: Merging into a missing Ingredient is a 404
    Given the Household has the Ingredient "flour" with Base Unit g
    When I POST "/api/ingredients/1/merge" with JSON:
      """
      {"into": 9999}
      """
    Then the response status is 404
    And the error code is "not_found"
