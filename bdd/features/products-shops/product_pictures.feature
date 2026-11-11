Feature: Product pictures
  A Product may have one Picture, so a person in the shop can tell "Mutti passata" from "own-brand passata" at a
  glance. The Picture is added with the shared image picker: the editor uploads it first and then saves the Product
  with the image id. Product rows, the Product page and the result of a scan show it, and the nightly clean-up never
  removes a Picture a Product uses.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping household has the Ingredient "passata" in g

  Scenario: Adding a Product with a Picture
    When I add a 40x30 PNG image named "mutti-jar"
    And I create the Product "Mutti passata 700 g" of "passata" with pack size 700 and the image "mutti-jar"
    Then the response status is 201
    And the Product "Mutti passata 700 g" shows the picture "mutti-jar"

  Scenario: A Product does not need a Picture
    When I create the Product "Plain passata" of "passata" with pack size 500 and no picture
    Then the response status is 201
    And the Product "Plain passata" has no picture

  Scenario: Adding, replacing and removing the Picture of an existing Product
    Given the shopping catalogue has the Product "Mutti passata 700 g" of "passata" in g with pack size 700 and barcode "8000500310427"
    When I add a 40x30 PNG image named "first"
    And I set the picture of the Product "Mutti passata 700 g" to the image "first"
    Then the Product "Mutti passata 700 g" shows the picture "first"
    When I add a 40x30 PNG image named "second"
    And I set the picture of the Product "Mutti passata 700 g" to the image "second"
    Then the Product "Mutti passata 700 g" shows the picture "second"
    And the image "first" is gone
    When I remove the picture of the Product "Mutti passata 700 g"
    Then the Product "Mutti passata 700 g" has no picture
    And the image "second" is gone

  Scenario: Renaming a Product keeps its Picture
    When I add a 40x30 PNG image named "mutti-jar"
    And I create the Product "Mutti passata 700 g" of "passata" with pack size 700 and the image "mutti-jar"
    And I rename the Product "Mutti passata 700 g" to "Mutti passata"
    Then the Product "Mutti passata" shows the picture "mutti-jar"

  Scenario: A Picture that was never uploaded is refused
    When I create the Product "Mutti passata 700 g" of "passata" with pack size 700 and the image id "cccccccccccccccccccccccccccccccc"
    Then the response status is 400
    And the error code is "invalid_product"
    And the household has no Product "Mutti passata 700 g"

  Scenario: The picker will not discard a Picture a Product uses
    When I add a 40x30 PNG image named "mutti-jar"
    And I create the Product "Mutti passata 700 g" of "passata" with pack size 700 and the image "mutti-jar"
    And I discard the image "mutti-jar"
    Then the response status is 409
    And the error code is "image_in_use"
    And the image "mutti-jar" is still there

  Scenario: The nightly clean-up keeps Product Pictures and removes pictures nobody saved
    When I add a 40x30 PNG image named "forgotten"
    And I add a 40x30 PNG image named "mutti-jar"
    And I create the Product "Mutti passata 700 g" of "passata" with pack size 700 and the image "mutti-jar"
    And 49 hours pass
    And the scheduler runs its due jobs
    Then the image "forgotten" is gone
    And the image "mutti-jar" is still there

  Scenario: Archiving a Product keeps its Picture, deleting it removes the file
    When I add a 40x30 PNG image named "mutti-jar"
    And I create the Product "Mutti passata 700 g" of "passata" with pack size 700 and the image "mutti-jar"
    And I archive the Product "Mutti passata 700 g"
    Then the Product "Mutti passata 700 g" shows the picture "mutti-jar"
    When I delete the Product "Mutti passata 700 g"
    Then the image "mutti-jar" is gone

  Scenario: A scan of a Product shows its Picture
    Given the shopping catalogue has the Product "Mutti passata 700 g" of "passata" in g with pack size 700 and barcode "8000500310427"
    When I add a 40x30 PNG image named "mutti-jar"
    And I set the picture of the Product "Mutti passata 700 g" to the image "mutti-jar"
    And I scan the barcode "8000500310427" at "Coop" as scan "scan-0001"
    Then scan "scan-0001" was applied
    And scan "scan-0001" shows the Product picture "mutti-jar"

  Scenario: A scan of a Product without a Picture shows none
    Given the shopping catalogue has the Product "Mutti passata 700 g" of "passata" in g with pack size 700 and barcode "8000500310427"
    When I scan the barcode "8000500310427" at "Coop" as scan "scan-0001"
    Then scan "scan-0001" shows no Product picture

  Scenario: The what-is-this sheet can add the Picture of the new Product
    Given the barcode "5012345678900" is unknown at "Coop"
    When I add a 40x30 PNG image named "tin"
    And I save the unknown barcode "5012345678900" at "Coop" as scan "scan-0001" with the picture "tin"
    Then scan "scan-0001" was applied
    And scan "scan-0001" created the Product "Tinned tomatoes 400 g"
    And scan "scan-0001" shows the Product picture "tin"
    And the Product "Tinned tomatoes 400 g" shows the picture "tin"

  Scenario: The phone's offline data carries the Pictures
    Given the shopping catalogue has the Product "Mutti passata 700 g" of "passata" in g with pack size 700 and barcode "8000500310427"
    When I add a 40x30 PNG image named "mutti-jar"
    And I set the picture of the Product "Mutti passata 700 g" to the image "mutti-jar"
    Then the offline data for "Coop" lists the picture "mutti-jar" for "Mutti passata 700 g"
