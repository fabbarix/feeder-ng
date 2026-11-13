# language: en
Feature: Import Review decisions for Base recipes (beta.6, BR-C, docs/dev/design/base-recipes.md section 11.3)
  A line that calls for another recipe gets a tile in Import Review, and nothing is linked silently: each tile is
  answered, and Confirm saves every answer in one transaction. These scenarios drive the API only. A tile is
  answered with use, file, create (Fill in later, or Read it next), convert or keep.

  Background:
    Given a running Feeder
    And I am signed in as the User

  Scenario: Use an existing Base recipe
    Given the household has the Base recipe "Béchamel" yielding 1 l with the lines "1000 ml milk"
    When I review this Recipe File:
      """
      {"format":"feeder-recipe-file","version":1,
       "ingredients":[{"name":"lasagne sheets","baseUnit":"g"},{"name":"béchamel","baseUnit":"ml"}],
       "recipes":[{"name":"Lasagne","yield":4,"ingredients":[
         {"ingredient":"lasagne sheets","quantity":250,"unit":"g"},
         {"ingredient":"béchamel","quantity":500,"unit":"ml","recipe":{"name":"Béchamel"}}]}]}
      """
    When I answer the review with these decisions:
      """
      {"decisions":{"baseRecipeLines":{"$.recipes[0].ingredients[1]":{"action":"use","recipeId":<recipe:Béchamel>}}}}
      """
    Then the review is ready
    When I confirm the review with the same answers
    Then the response status is 200
    And the answer lists the Recipe "Lasagne" as "created" and not a Base recipe
    And the answer lists no Recipe "Béchamel"
    And the Recipe "Lasagne" has a line calling for the Base recipe "Béchamel"
    And the household has 2 Recipes in all, Base recipes included

  Scenario: Use a Base recipe from this file
    When I review this Recipe File:
      """
      {"format":"feeder-recipe-file","version":1,
       "ingredients":[{"name":"lasagne sheets","baseUnit":"g"},{"name":"béchamel","baseUnit":"ml"},{"name":"milk","baseUnit":"ml"}],
       "recipes":[
        {"name":"Lasagne","yield":4,"ingredients":[
         {"ingredient":"lasagne sheets","quantity":250,"unit":"g"},
         {"ingredient":"béchamel","quantity":500,"unit":"ml","recipe":{"name":"Béchamel"}}]},
        {"name":"Béchamel","baseRecipe":true,"yield":1,"yieldUnit":"l","ingredients":[{"ingredient":"milk","quantity":1000,"unit":"ml"}]}]}
      """
    When I answer the review with these decisions:
      """
      {"decisions":{"baseRecipeLines":{"$.recipes[0].ingredients[1]":{"action":"file","recipeIndex":1}}}}
      """
    Then the review is ready
    When I confirm the review with the same answers
    Then the response status is 200
    And the answer lists the Base recipe "Béchamel" as "created"
    And the answer lists the Recipe "Lasagne" as "created" and not a Base recipe
    And the Recipe "Béchamel" is a Base recipe yielding 1 l
    And the Base recipe "Béchamel" has 1 line
    And the Recipe "Lasagne" has a line calling for the Base recipe "Béchamel"

  Scenario: Add it as a new Base recipe and fill it in later
    When I review this Recipe File:
      """
      {"format":"feeder-recipe-file","version":1,
       "ingredients":[{"name":"lasagne sheets","baseUnit":"g"},{"name":"béchamel","baseUnit":"ml"}],
       "recipes":[{"name":"Lasagne","yield":4,"ingredients":[
         {"ingredient":"lasagne sheets","quantity":250,"unit":"g"},
         {"ingredient":"béchamel","quantity":500,"unit":"ml","recipe":{"name":"Béchamel"}}]}]}
      """
    When I answer the review with these decisions:
      """
      {"decisions":{"baseRecipeLines":{"$.recipes[0].ingredients[1]":{"action":"create"}}}}
      """
    Then the review is ready
    When I confirm the review with the same answers
    Then the response status is 200
    And the answer lists the Base recipe "Béchamel" as "created"
    And the answer ties "Béchamel" to the line "$.recipes[0].ingredients[1]"
    And the answer does not offer to read "Béchamel" next
    And the Recipe "Béchamel" is a Base recipe yielding 500 ml
    And the Base recipe "Béchamel" has no lines
    And the Recipe "Lasagne" has a line calling for the Base recipe "Béchamel"

  Scenario: Add it as a new Base recipe and read it next
    When I review this Recipe File:
      """
      {"format":"feeder-recipe-file","version":1,
       "ingredients":[{"name":"lasagne sheets","baseUnit":"g"},{"name":"béchamel","baseUnit":"ml"}],
       "recipes":[{"name":"Lasagne","yield":4,"ingredients":[
         {"ingredient":"lasagne sheets","quantity":250,"unit":"g"},
         {"ingredient":"béchamel","quantity":500,"unit":"ml","recipe":{"name":"Béchamel"}}]}]}
      """
    When I answer the review with these decisions:
      """
      {"decisions":{"baseRecipeLines":{"$.recipes[0].ingredients[1]":{"action":"create","readNext":true}}}}
      """
    And I confirm the review with the same answers
    Then the response status is 200
    And the answer lists the Base recipe "Béchamel" as "created"
    And the answer ties "Béchamel" to the line "$.recipes[0].ingredients[1]"
    And the answer offers to read "Béchamel" next

  Scenario: Turn a Recipe you plan into a Base recipe
    Given the household has the plannable Recipe "Pesto" with the lines "100 g basil"
    When I review this Recipe File:
      """
      {"format":"feeder-recipe-file","version":1,
       "ingredients":[{"name":"lasagne sheets","baseUnit":"g"},{"name":"pesto","baseUnit":"g"}],
       "recipes":[{"name":"Lasagne","yield":4,"ingredients":[
         {"ingredient":"lasagne sheets","quantity":250,"unit":"g"},
         {"ingredient":"pesto","quantity":100,"unit":"g","recipe":{"name":"Pesto"}}]}]}
      """
    When I answer the review with these decisions:
      """
      {"decisions":{"baseRecipeLines":{"$.recipes[0].ingredients[1]":{"action":"convert","recipeId":<recipe:Pesto>,"yield":200,"yieldUnit":"g"}}}}
      """
    Then the review is ready
    When I confirm the review with the same answers
    Then the response status is 200
    And the answer lists the Base recipe "Pesto" as "converted"
    And the answer ties "Pesto" to the line "$.recipes[0].ingredients[1]"
    And the Recipe "Pesto" is a Base recipe yielding 200 g
    And the Recipe "Lasagne" has a line calling for the Base recipe "Pesto"

  Scenario: Keep it as an Ingredient
    Given the household already has the Ingredient "béchamel" with Base Unit "ml"
    When I review this Recipe File:
      """
      {"format":"feeder-recipe-file","version":1,
       "ingredients":[{"name":"lasagne sheets","baseUnit":"g"},{"name":"béchamel","baseUnit":"ml"}],
       "recipes":[{"name":"Lasagne","yield":4,"ingredients":[
         {"ingredient":"lasagne sheets","quantity":250,"unit":"g"},
         {"ingredient":"béchamel","quantity":500,"unit":"ml","recipe":{"name":"Béchamel"}}]}]}
      """
    When I answer the review with these decisions:
      """
      {"decisions":{"baseRecipeLines":{"$.recipes[0].ingredients[1]":{"action":"keep"}}}}
      """
    Then the review is ready
    When I confirm the review with the same answers
    Then the response status is 200
    And the answer lists the Recipe "Lasagne" as "created" and not a Base recipe
    And the answer lists no Recipe "Béchamel"
    And the Recipe "Lasagne" has a plain line for "béchamel"
    And the household has 1 Recipes in all, Base recipes included

  Scenario: Confirm waits while a line has no answer
    When I review this Recipe File:
      """
      {"format":"feeder-recipe-file","version":1,
       "ingredients":[{"name":"lasagne sheets","baseUnit":"g"},{"name":"béchamel","baseUnit":"ml"}],
       "recipes":[{"name":"Lasagne","yield":4,"ingredients":[
         {"ingredient":"lasagne sheets","quantity":250,"unit":"g"},
         {"ingredient":"béchamel","quantity":500,"unit":"ml","recipe":{"name":"Béchamel"}}]}]}
      """
    Then the review is not ready
    When I confirm the review with no answers
    Then the response status is 422
    And the error code is "import_not_ready"
    And the household has 0 Recipes in all, Base recipes included

  Scenario: A cycle found at Confirm is refused and nothing is written
    Given the household has the Base recipe "Roux" yielding 160 g with the lines "80 g butter"
    And the household has the Base recipe "Béchamel" yielding 1 l with the lines "160 g Roux"
    When I review this Recipe File:
      """
      {"format":"feeder-recipe-file","version":1,
       "ingredients":[{"name":"butter","baseUnit":"g"},{"name":"béchamel","baseUnit":"ml"}],
       "recipes":[
        {"name":"Roux","baseRecipe":true,"yield":160,"yieldUnit":"g","ingredients":[
         {"ingredient":"butter","quantity":80,"unit":"g"},
         {"ingredient":"béchamel","quantity":100,"unit":"ml","recipe":{"name":"Béchamel"}}]},
        {"name":"Aioli","yield":2,"ingredients":[{"ingredient":"butter","quantity":10,"unit":"g"}]}]}
      """
    And I answer the review with these decisions:
      """
      {"decisions":{"recipes":[{"index":0,"action":"replace"}],
        "baseRecipeLines":{"$.recipes[0].ingredients[1]":{"action":"use","recipeId":<recipe:Béchamel>}}}}
      """
    Then the review is ready
    When I confirm the review with the same answers
    Then the response status is 422
    And the error code is "base_recipe_cycle"
    And the error path names "Roux, Béchamel"
    And the household has 2 Recipes in all, Base recipes included
    And the Base recipe "Roux" has 1 line

  Scenario: Replacing an empty Base recipe keeps its id and what calls for it
    Given the household has the Base recipe "Béchamel" yielding 500 ml
    And the household has the plannable Recipe "Lasagne" with the lines "500 ml Béchamel"
    And I note the id of the Recipe "Béchamel"
    When I review this Recipe File:
      """
      {"format":"feeder-recipe-file","version":1,
       "ingredients":[{"name":"milk","baseUnit":"ml"},{"name":"butter","baseUnit":"g"}],
       "recipes":[{"name":"Béchamel","baseRecipe":true,"yield":1,"yieldUnit":"l","ingredients":[
         {"ingredient":"milk","quantity":1000,"unit":"ml"},{"ingredient":"butter","quantity":80,"unit":"g"}]}]}
      """
    And I answer the review with these decisions:
      """
      {"decisions":{"recipes":[{"index":0,"action":"replace"}]}}
      """
    Then the review is ready
    When I confirm the review with the same answers
    Then the response status is 200
    And the answer lists the Base recipe "Béchamel" as "replaced"
    And the Recipe "Béchamel" still has the id I noted
    And the Recipe "Béchamel" is a Base recipe yielding 1 l
    And the Base recipe "Béchamel" has 2 lines
    And the Recipe "Lasagne" has a line calling for the Base recipe "Béchamel"

  Scenario: After an import creates Béchamel, the remaining plain béchamel lines are offered with nothing linked
    Given the household already has the Ingredient "béchamel" with Base Unit "ml"
    And the household has the plannable Recipe "Moussaka" with the lines "300 ml béchamel"
    When I review this Recipe File:
      """
      {"format":"feeder-recipe-file","version":1,
       "ingredients":[{"name":"lasagne sheets","baseUnit":"g"},{"name":"béchamel","baseUnit":"ml"}],
       "recipes":[{"name":"Lasagne","yield":4,"ingredients":[
         {"ingredient":"lasagne sheets","quantity":250,"unit":"g"},
         {"ingredient":"béchamel","quantity":500,"unit":"ml","recipe":{"name":"Béchamel"}}]}]}
      """
    And I answer the review with these decisions:
      """
      {"decisions":{"baseRecipeLines":{"$.recipes[0].ingredients[1]":{"action":"create"}},
        "takeOvers":{"$.recipes[0].ingredients[1]":false}}}
      """
    Then the review is ready
    When I confirm the review with the same answers
    Then the response status is 200
    And the answer lists the Base recipe "Béchamel" as "created"
    When I ask for the link candidates of the Base recipe "Béchamel"
    Then the response status is 200
    And the link candidates list the line of "Moussaka" as linkable
    And the link candidates list no line of "Lasagne"
    And the Recipe "Moussaka" has a plain line for "béchamel"
