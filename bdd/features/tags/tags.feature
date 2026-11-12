@tg-api
Feature: Manage Tags
  Any User, not only an Admin, adds, renames, recolours, merges and deletes Tags (spec 4.1 and 17, ADR 0010).
  Slot Rules and Variety Rules name a Tag by its key and follow a rename or merge in the same transaction.
  Tags are listed by name and a Tag colour repeats after ten.

  Background:
    Given a running Feeder
    And I am signed in as the User

  Scenario: The list is an array by name with the old fields and the new ones
    Given the Tag "Pasta" exists in the colour "sage"
    And the Tag "fish" exists in the colour "tomato"
    And the Tag "Apple" exists in the colour "plum"
    And the Recipe "Carbonara" carries the Tags "Pasta"
    And the Recipe "Salmon" carries the Tags "fish", "Pasta"
    And a Slot Rule names the Tag "fish" for the Meal Slot "Dinner" on Friday in the Course "Main"
    And a Variety Rule names the Tag "fish" with at most 1 a week
    When I list the Tags
    Then the response status is 200
    And the Tag answer JSON "0.name" is "Apple"
    And the Tag answer JSON "1.name" is "fish"
    And the Tag answer JSON "1.key" is "fish"
    And the Tag answer JSON "1.colour" is "tomato"
    And the Tag answer JSON "1.recipes" is "1"
    And the Tag answer JSON "1.slotRules" is "1"
    And the Tag answer JSON "1.varietyRule" is true
    And the Tag answer JSON "2.name" is "Pasta"
    And the Tag answer JSON "2.recipes" is "2"
    And the Tag answer JSON "2.varietyRule" is false
    And the Tag answer JSON "0.id" is "1"

  Scenario: A Tag added without a colour takes the colour fewest Tags have
    When I add the Tag "Fish"
    Then the response status is 201
    And the Tag answer JSON "name" is "Fish"
    And the Tag answer JSON "colour" is "tomato"
    When I add the Tag "Pasta"
    Then the Tag answer JSON "colour" is "apricot"

  Scenario: A Tag added with a colour keeps it
    When I add the Tag "Soup" in the colour "rose"
    Then the response status is 201
    And the Tag answer JSON "colour" is "rose"

  Scenario: Colours repeat after ten
    Given the Tag "T1" exists in the colour "tomato"
    And the Tag "T2" exists in the colour "apricot"
    And the Tag "T3" exists in the colour "mustard"
    And the Tag "T4" exists in the colour "olive"
    And the Tag "T5" exists in the colour "sage"
    And the Tag "T6" exists in the colour "teal"
    And the Tag "T7" exists in the colour "sky"
    And the Tag "T8" exists in the colour "blue"
    And the Tag "T9" exists in the colour "plum"
    And the Tag "T10" exists in the colour "rose"
    When I add the Tag "T11"
    Then the Tag answer JSON "colour" is "tomato"
    When I add the Tag "T12"
    Then the Tag answer JSON "colour" is "apricot"

  Scenario: A name another Tag already has is refused and names that Tag
    Given the Tag "fish" exists in the colour "teal"
    When I add the Tag " FISH "
    Then the response status is 409
    And the error code is "tag_name_taken"
    And the Tag answer names the other Tag "fish" in the colour "teal"
    And the Tags are "fish"

  Scenario Outline: A bad name or colour is refused
    When I POST "/api/tags" with JSON:
      """
      <body>
      """
    Then the response status is 422
    And the Tag answer has a refusal on the field "<field>" with the reason "<reason>"
    And there are no Tags

    Examples:
      | body                                     | field  | reason         |
      | {"name": "   "}                          | name   | tag_invalid    |
      | {"name": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"} | name | tag_invalid |
      | {"name": "Soup", "colour": "chartreuse"} | colour | colour_unknown |

  Scenario: Renaming a Tag changes its name everywhere and the rules follow the key
    Given the Tag "fish" exists in the colour "plum"
    And the Recipe "Salmon" carries the Tags "fish"
    And a Slot Rule names the Tag "fish" for the Meal Slot "Dinner" on Friday in the Course "Main"
    And a Variety Rule names the Tag "fish" with at most 1 a week
    When I rename the Tag "fish" to "Seafood"
    Then the response status is 200
    And the Tag answer JSON "name" is "Seafood"
    And the Tag answer JSON "key" is "seafood"
    And the Tag answer JSON "colour" is "plum"
    And the Tag answer JSON "recipes" is "1"
    And the Tag answer JSON "slotRules" is "1"
    And the Tag answer JSON "varietyRule" is true
    And the Slot Rules name only the Tag "seafood"
    And the Variety Rules name only the Tag "seafood"
    And the Variety Rule for the Tag "seafood" allows at most 1 a week

  Scenario: A new spelling of the same key is an ordinary rename
    Given the Tag "fish" exists
    And a Variety Rule names the Tag "fish" with at most 1 a week
    When I rename the Tag "fish" to "Fish"
    Then the response status is 200
    And the Tag answer JSON "name" is "Fish"
    And the Tag answer JSON "key" is "fish"
    And the Variety Rules name only the Tag "fish"

  Scenario: Renaming onto another Tag asks for a merge and changes nothing
    Given the Tag "fish" exists in the colour "tomato"
    And the Tag "Seafood" exists in the colour "apricot"
    And a Variety Rule names the Tag "fish" with at most 1 a week
    When I update the Tag "fish" with JSON {"name": "seafood", "colour": "rose"}
    Then the response status is 409
    And the error code is "tag_name_taken"
    And the Tag answer names the other Tag "Seafood" in the colour "apricot"
    And the Tag "fish" has the colour "tomato"
    And the Variety Rules name only the Tag "fish"

  Scenario: Recolouring changes only the colour
    Given the Tag "fish" exists in the colour "tomato"
    And a Variety Rule names the Tag "fish" with at most 1 a week
    When I recolour the Tag "fish" to "sky"
    Then the response status is 200
    And the Tag answer JSON "colour" is "sky"
    And the Tag answer JSON "name" is "fish"
    And the Variety Rules name only the Tag "fish"

  Scenario Outline: A bad update is refused
    Given the Tag "fish" exists
    When I update the Tag "fish" with JSON <body>
    Then the response status is 422
    And the Tag answer has a refusal on the field "<field>" with the reason "<reason>"

    Examples:
      | body                    | field  | reason          |
      | {}                      | name   | nothing_to_change |
      | {"name": ""}            | name   | tag_invalid     |
      | {"colour": "chartreuse"} | colour | colour_unknown  |

  Scenario: The impact lists what a delete or a merge touches
    Given the Tag "fish" exists
    And the Tag "Seafood" exists
    And the Recipe "Salmon" carries the Tags "fish", "Seafood"
    And the Recipe "Cod" carries the Tags "fish"
    And a Slot Rule names the Tag "fish" for the Meal Slot "Dinner" on Friday in the Course "Main"
    And a Variety Rule names the Tag "fish" with at most 2 a week
    When I read the impact of the Tag "fish"
    Then the response status is 200
    And the Tag answer JSON "recipes" is "2"
    And the Tag answer JSON "slotRules" lists 1 item
    And the Tag answer JSON "slotRules.0.mealSlotName" is "Dinner"
    And the Tag answer JSON "slotRules.0.courseName" is "Main"
    And the Tag answer JSON "varietyRule.maxPerWeek" is "2"

  Scenario: The impact of a merge counts the Recipes that already have both Tags
    Given the Tag "fish" exists
    And the Tag "Seafood" exists
    And the Recipe "Salmon" carries the Tags "fish", "Seafood"
    And the Recipe "Cod" carries the Tags "fish"
    When I read the impact of the Tag "fish" for a merge into "Seafood"
    Then the response status is 200
    And the Tag answer JSON "recipes" is "2"
    And the Tag answer JSON "bothRecipes" is "1"

  Scenario: A Tag nothing uses has an empty impact
    Given the Tag "Roast" exists
    When I read the impact of the Tag "Roast"
    Then the Tag answer JSON "recipes" is "0"
    And the Tag answer JSON "slotRules" lists 0 items
    And the Tag answer JSON "varietyRule" is null

  Scenario: Merging moves Recipes and rules, drops duplicates and keeps the target's Variety Rule
    Given the Tag "fish" exists in the colour "tomato"
    And the Tag "Seafood" exists in the colour "apricot"
    And the Recipe "Salmon" carries the Tags "fish", "Seafood"
    And the Recipe "Cod" carries the Tags "fish"
    And the Recipe "Prawns" carries the Tags "Seafood"
    And a Slot Rule names the Tag "fish" for the Meal Slot "Dinner" on Friday in the Course "Main"
    And a Slot Rule names the Tag "Seafood" for the Meal Slot "Dinner" on Friday in the Course "Main"
    And a Slot Rule names the Tag "fish" for the Meal Slot "Lunch" on Monday in the Course "Main"
    And a Variety Rule names the Tag "fish" with at most 1 a week
    And a Variety Rule names the Tag "Seafood" with at most 3 a week
    When I merge the Tag "fish" into "Seafood"
    Then the response status is 200
    And the Tag answer JSON "name" is "Seafood"
    And the Tag answer JSON "colour" is "apricot"
    And the Tag answer JSON "recipes" is "3"
    And the Tag answer JSON "slotRules" is "2"
    And the Tags are "Seafood"
    And the Recipe "Cod" carries exactly the Tags "Seafood"
    And the Recipe "Salmon" carries exactly the Tags "Seafood"
    And the Slot Rules name only the Tag "seafood"
    And the Variety Rules name only the Tag "seafood"
    And the Variety Rule for the Tag "seafood" allows at most 3 a week

  Scenario: Merging moves the Variety Rule when the target has none
    Given the Tag "fish" exists
    And the Tag "Seafood" exists
    And a Variety Rule names the Tag "fish" with at most 2 a week
    When I merge the Tag "fish" into "Seafood"
    Then the response status is 200
    And the Variety Rule for the Tag "seafood" allows at most 2 a week

  Scenario Outline: A bad merge is refused
    Given the Tag "fish" exists
    When I merge the Tag "fish" into <into>
    Then the response status is 422
    And the Tag answer has a refusal on the field "into"
    And the Tags are "fish"

    Examples:
      | into             |
      | itself           |
      | a Tag nobody has |

  Scenario: The impact of a merge into itself is refused
    Given the Tag "fish" exists
    When I read the impact of the Tag "fish" for a merge into itself
    Then the response status is 422
    And the Tag answer has a refusal on the field "into"

  Scenario: Deleting a Tag takes it off its Recipes and removes its rules, and is never refused
    Given the Tag "fish" exists
    And the Tag "Pasta" exists
    And the Recipe "Salmon" carries the Tags "fish", "Pasta"
    And a Slot Rule names the Tag "fish" for the Meal Slot "Dinner" on Friday in the Course "Main"
    And a Variety Rule names the Tag "fish" with at most 1 a week
    And a Variety Rule names the Tag "Pasta" with at most 3 a week
    When I delete the Tag "fish"
    Then the response status is 204
    And the Tags are "Pasta"
    And the Recipe "Salmon" carries exactly the Tags "Pasta"
    And no Slot Rule names a Tag
    And the Variety Rules name only the Tag "pasta"
    When I delete the Tag "fish"
    Then the response status is 404

  Scenario Outline: A Tag nobody has is not found
    When I <action> a Tag nobody has
    Then the response status is 404
    And the error code is "not_found"

    Examples:
      | action             |
      | update             |
      | read the impact of |
      | merge              |
      | delete             |

  Scenario: Only a signed-in User may manage Tags
    Given I am not signed in
    When I add the Tag "Soup"
    Then the response status is 401
