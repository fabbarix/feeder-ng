@crs-c1
Feature: The Household's Courses
  A Course is one part of what a Meal Slot serves (ADR 0008, spec 3.1). Every User reads the list; the Admin adds,
  renames, reorders, makes one main, archives and deletes. A new install starts with Main, Side, Starter and Dessert.

  Background:
    Given a running Feeder

  Scenario: A new install lists the four seeded Courses in order, for every User
    Given I am signed in as the User
    When I list the Courses
    Then the response status is 200
    And the Courses are "Main", "Side", "Starter" and "Dessert"
    And the Course "Main" is the main Course

  Scenario: Only the Admin changes Courses
    Given I am signed in as the User
    When I add the Course "Cheese"
    Then the response status is 403
    When I make the Course "Side" the main Course
    Then the response status is 403
    When I delete the Course "Dessert"
    Then the response status is 403

  Scenario: Adding a Course puts it last
    Given I am signed in as the Admin
    When I add the Course "  Cheese   board "
    Then the response status is 201
    And the Course answer is "Cheese board", not main and not archived
    When I list the Courses
    Then the Courses are "Main", "Side", "Starter", "Dessert" and "Cheese board"

  Scenario: An empty name is refused
    Given I am signed in as the Admin
    When I add the Course "   "
    Then the response status is 422
    And the error code is "validation_failed"
    And the error names the field "name"

  Scenario: A name already used is refused whatever its case and spacing
    Given I am signed in as the Admin
    When I add the Course "  SIDE "
    Then the response status is 409
    And the error code is "course_name_taken"
    When I add the Course "Si de"
    Then the response status is 201

  Scenario: Accents count in a name
    Given I am signed in as the Admin
    When I add the Course "Entrée"
    And I add the Course "Entree"
    Then the response status is 201

  Scenario: At most twenty Courses are active
    Given I am signed in as the Admin
    When I add the Course "Course 5"
    And I add the Course "Course 6"
    And I add the Course "Course 7"
    And I add the Course "Course 8"
    And I add the Course "Course 9"
    And I add the Course "Course 10"
    And I add the Course "Course 11"
    And I add the Course "Course 12"
    And I add the Course "Course 13"
    And I add the Course "Course 14"
    And I add the Course "Course 15"
    And I add the Course "Course 16"
    And I add the Course "Course 17"
    And I add the Course "Course 18"
    And I add the Course "Course 19"
    And I add the Course "Course 20"
    Then the response status is 201
    When I add the Course "Course 21"
    Then the response status is 422
    And the error code is "too_many_courses"

  Scenario: Renaming keeps the Course and its main flag
    Given I am signed in as the Admin
    When I rename the Course "Main" to "Mains"
    Then the response status is 200
    And the Course answer is "Mains", main and not archived
    When I rename the Course "Side" to "mains"
    Then the response status is 409
    And the error code is "course_name_taken"

  Scenario: Make main moves the flag in one step
    Given I am signed in as the Admin
    When I make the Course "Side" the main Course
    Then the response status is 200
    When I list the Courses
    Then the Course "Side" is the main Course
    And the Courses are "Main", "Side", "Starter" and "Dessert"

  Scenario: Reordering the Courses
    Given I am signed in as the Admin
    When I reorder the Courses to "Dessert", "Main", "Starter" and "Side"
    Then the response status is 200
    And the Courses are "Dessert", "Main", "Starter" and "Side"
    When I reorder the Courses to "Main" and "Side"
    Then the response status is 422
    And the error code is "validation_failed"
    And the error names the field "ids"

  Scenario: The impact of removing a Course
    Given I am signed in as the Admin
    And the Household has the Recipe "Greens" for the Courses "Side"
    And the Household has the Recipe "Gratin" for the Courses "Main" and "Side"
    And the Household has the Meal Slot "Dinner" on Thursday at 19:00 attended by nobody
    And the Admin saves the Meal Slot "Dinner" on Thursday with the Courses "Main", "Side"
    And the Meal Slot "Dinner" on Thursday has a Pinned Planned Meal of "Greens" in "Side" on 2026-11-12
    And the Meal Slot "Dinner" on Thursday has a Slot Rule for "Greens" in "Side"
    When I ask what removing the Course "Side" changes
    Then the response status is 200
    And the impact counts 2 Recipes (1 only this) and 1 Meal Slot (0 only this)
    And the impact lists 1 Planned Meal and 1 Slot Rule
    And the answer JSON at "plannedMeals.0.pinned" is "true"
    And the answer JSON at "plannedMeals.0.recipeName" is "Greens"

  Scenario: Deleting a Course that was never planned removes it for good
    Given I am signed in as the Admin
    And the Household has the Recipe "Soup" for the Courses "Starter"
    When I delete the Course "Starter"
    Then the response status is 422
    And the error names the field "replacement" and the reason "replacement_invalid"
    When I delete the Course "Starter" replacing it with "Main"
    Then the response status is 204
    And the Recipe "Soup" is marked with the Courses "Main"
    When I list the Courses including archived ones
    Then the Courses are "Main", "Side" and "Dessert"

  Scenario: The main Course cannot be deleted or archived
    Given I am signed in as the Admin
    When I delete the Course "Main"
    Then the response status is 409
    And the error code is "course_main"
    When I archive the Course "Main" replacing it with "Side"
    Then the response status is 409
    And the error code is "course_main"

  Scenario: A Course that was planned can only be archived
    Given I am signed in as the Admin
    And the Course "Side" has been planned
    When I delete the Course "Side" replacing it with "Main"
    Then the response status is 409
    And the error code is "course_planned"
    When I archive the Course "Side" replacing it with "Main"
    Then the response status is 200
    And the Course answer is "Side", not main and archived
    When I list the Courses
    Then the Courses are "Main", "Starter" and "Dessert"
    When I list the Courses including archived ones
    Then the Courses are "Main", "Starter", "Dessert" and "Side"

  Scenario: Archiving takes the Course off Recipes, Meal Slots and Slot Rules and removes unresolved Planned Meals
    Given I am signed in as the Admin
    And the Household has the Recipe "Greens" for the Courses "Side"
    And the Household has the Meal Slot "Dinner" on Thursday at 19:00 attended by nobody
    And the Admin saves the Meal Slot "Dinner" on Thursday with the Courses "Main", "Side"
    And the Meal Slot "Dinner" on Thursday has a Pinned Planned Meal of "Greens" in "Side" on 2026-11-12
    And the Meal Slot "Dinner" on Thursday has an unpinned Planned Meal of "Greens" in "Side" on 2026-11-19
    And the Meal Slot "Dinner" on Thursday has a Slot Rule for "Greens" in "Side"
    When I archive the Course "Side" replacing it with "Main"
    Then the response status is 200
    And the Recipe "Greens" is marked with the Courses "Main"
    And the Meal Slot "Dinner" on Thursday serves "Main"
    And the Meal Slot "Dinner" on Thursday has 0 unresolved Planned Meals in "Side" from today on
    And the Meal Slot "Dinner" on Thursday has 0 Slot Rules in "Side"

  Scenario: An archived Course's name cannot be reused, and Unarchive puts it back last
    Given I am signed in as the Admin
    And the Course "Starter" has been planned
    And I archive the Course "Starter" replacing it with "Main"
    When I add the Course "starter"
    Then the response status is 409
    And the error code is "course_name_taken"
    And the answer JSON at "error.archivedCourseId" is the id of the Course "Starter"
    When I unarchive the Course "Starter"
    Then the response status is 200
    And the Course answer is "Starter", not main and not archived
    When I list the Courses
    Then the Courses are "Main", "Side", "Dessert" and "Starter"

  Scenario: Make main is refused on an archived Course
    Given I am signed in as the Admin
    And I archive the Course "Dessert"
    When I make the Course "Dessert" the main Course
    Then the response status is 422
    And the error names the field "main"
