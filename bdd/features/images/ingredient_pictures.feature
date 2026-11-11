Feature: Ingredient pictures
  An Ingredient may have one picture, so a person standing in the pantry or the shop can tell "plain flour"
  from "strong flour" at a glance. The picture is added with the shared image picker: the editor uploads it
  first and then saves the Ingredient with the image id. Pictures travel in a Recipe File like Recipe
  photos do, and the nightly clean-up never removes a picture an Ingredient uses.

  Background:
    Given a running Feeder
    And I am signed in as the User

  Scenario: Adding an Ingredient with a picture
    When I add a 40x30 PNG image named "flour-bag"
    And I create the Ingredient "Flour" with the image "flour-bag"
    Then the response status is 201
    And the Ingredient "Flour" shows the picture "flour-bag"

  Scenario: An Ingredient does not need a picture
    When I create the Ingredient "Salt" with no picture
    Then the response status is 201
    And the Ingredient "Salt" has no picture

  Scenario: Adding, replacing and removing the picture of an existing Ingredient
    Given the Ingredient "Flour" exists with Base Unit "g"
    When I add a 40x30 PNG image named "first"
    And I set the picture of the Ingredient "Flour" to the image "first"
    Then the Ingredient "Flour" shows the picture "first"
    When I add a 40x30 PNG image named "second"
    And I set the picture of the Ingredient "Flour" to the image "second"
    Then the Ingredient "Flour" shows the picture "second"
    And the image "first" is gone
    When I remove the picture of the Ingredient "Flour"
    Then the Ingredient "Flour" has no picture
    And the image "second" is gone

  Scenario: Renaming an Ingredient keeps its picture
    When I add a 40x30 PNG image named "flour-bag"
    And I create the Ingredient "Flour" with the image "flour-bag"
    And I rename the Ingredient "Flour" to "Plain flour"
    Then the Ingredient "Plain flour" shows the picture "flour-bag"

  Scenario: A picture that was never uploaded is refused
    When I create the Ingredient "Flour" with the image id "cccccccccccccccccccccccccccccccc"
    Then the response status is 400
    And the error code is "invalid_ingredient"
    And the household has no Ingredient "Flour"

  Scenario: The picture picker will not discard a picture an Ingredient uses
    When I add a 40x30 PNG image named "flour-bag"
    And I create the Ingredient "Flour" with the image "flour-bag"
    And I discard the image "flour-bag"
    Then the response status is 409
    And the error code is "image_in_use"
    And the image "flour-bag" is still there

  Scenario: The nightly clean-up keeps Ingredient pictures and removes pictures nobody saved
    When I add a 40x30 PNG image named "forgotten"
    And I add a 40x30 PNG image named "flour-bag"
    And I create the Ingredient "Flour" with the image "flour-bag"
    And 49 hours pass
    And the scheduler runs its due jobs
    Then the image "forgotten" is gone
    And the image "flour-bag" is still there

  Scenario: Merging keeps one picture
    When I add a 40x30 PNG image named "scallion"
    And I add a 40x30 PNG image named "spring-onion"
    And I create the Ingredient "scallion" with the image "scallion"
    And I create the Ingredient "spring onion" with the image "spring-onion"
    And I merge the Ingredient "spring onion" into "scallion"
    Then the Ingredient "scallion" shows the picture "scallion"
    And the image "spring-onion" is gone

  Scenario: An Ingredient picture travels in a Recipe File
    When I add a 40x30 PNG image named "flour-bag"
    And I create the Ingredient "flour" with the image "flour-bag"
    And the household has the Recipe File Recipe "Bread", using the Ingredient "flour" in g
    And I export the Recipe "Bread"
    Then the downloaded Recipe File gives the Ingredient "flour" an embedded picture

  Scenario: Importing a Recipe File creates the Ingredient with its picture
    When I review a Recipe File whose new Ingredient "saffron" has a picture
    Then the review lists the Ingredient "saffron" as "new"
    When I confirm the review with no answers
    Then the Ingredient "saffron" shows an imported picture
