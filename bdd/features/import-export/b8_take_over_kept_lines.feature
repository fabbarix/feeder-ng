# language: en
@b8-base
Feature: The take-over ask counts the lines that will use the Base recipe too (beta.8, docs/dev/design/b8-base.md section 1)
  When Import Review asks whether a new Base recipe takes over a plain Ingredient of its name, the ask carries `keptLines`: how
  many other lines of the file stay Ingredient lines (a line kept as an Ingredient, or a line no tile asks about) and so use
  the Base recipe too after a Yes, or keep the plain Ingredient after a No. The Recipes already stored are named by the ask's
  own `recipes`, so they are not counted. The web shows the note only when the count is above 0.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the household already has the Ingredient "béchamel" with Base Unit "ml"

  Scenario: Another Recipe of the file with a béchamel line is counted
    When I review this Recipe File:
      """
      {"format":"feeder-recipe-file","version":1,
       "ingredients":[{"name":"lasagne sheets","baseUnit":"g"},{"name":"lamb","baseUnit":"g"},{"name":"béchamel","baseUnit":"ml"}],
       "recipes":[
         {"name":"Lasagne","yield":4,"ingredients":[
           {"ingredient":"lasagne sheets","quantity":250,"unit":"g"},
           {"ingredient":"béchamel","quantity":500,"unit":"ml","recipe":{"name":"Béchamel"}}]},
         {"name":"Moussaka","yield":4,"ingredients":[
           {"ingredient":"lamb","quantity":500,"unit":"g"},
           {"ingredient":"béchamel","quantity":300,"unit":"ml"}]}]}
      """
    And I answer the review with these decisions:
      """
      {"decisions":{"baseRecipeLines":{"$.recipes[0].ingredients[1]":{"action":"create"}}}}
      """
    Then the review's take-over ask at "$.recipes[0].ingredients[1]" counts 1 kept line

  Scenario: Nothing else of the file calls for béchamel
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
      {"decisions":{"baseRecipeLines":{"$.recipes[0].ingredients[1]":{"action":"create"}}}}
      """
    Then the review's take-over ask at "$.recipes[0].ingredients[1]" counts 0 kept lines
