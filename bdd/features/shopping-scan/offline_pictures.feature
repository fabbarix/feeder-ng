Feature: Product pictures on scans: merges and the offline queue
  A merged unknown-barcode scan gives its Picture to the existing Product when that Product has none, and never replaces
  one. A phone that filled in the "what is this?" form offline uploads the Picture first and then syncs the scan with
  the image id; a Picture that is gone by then is dropped and the scan still applies.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping catalogue has the Product "Mutti passata 700 g" of "passata" in g with pack size 700 and barcode "8000500310427"

  Scenario: A merged scan fills a Product that has no Picture
    When I add a 40x30 PNG image named "tin"
    And I save the unknown barcode "8000500310427" at "Coop" as scan "scan-0001" with the picture "tin"
    Then scan "scan-0001" was merged into "Mutti passata 700 g"
    And scan "scan-0001" shows the Product picture "tin"
    And the Product "Mutti passata 700 g" shows the picture "tin"
    And the image "tin" is still there

  Scenario: A merged scan never replaces the Picture the Product already has
    When I add a 40x30 PNG image named "jar"
    And I add a 40x30 PNG image named "tin"
    And I set the picture of the Product "Mutti passata 700 g" to the image "jar"
    And I save the unknown barcode "8000500310427" at "Coop" as scan "scan-0001" with the picture "tin"
    Then scan "scan-0001" was merged into "Mutti passata 700 g"
    And scan "scan-0001" shows the Product picture "jar"
    And the Product "Mutti passata 700 g" shows the picture "jar"

  Scenario: The unused Picture of a merged scan is left for the nightly clean-up
    When I add a 40x30 PNG image named "jar"
    And I add a 40x30 PNG image named "tin"
    And I set the picture of the Product "Mutti passata 700 g" to the image "jar"
    And I save the unknown barcode "8000500310427" at "Coop" as scan "scan-0001" with the picture "tin"
    Then the image "tin" is still there
    When 49 hours pass
    And the scheduler runs its due jobs
    Then the image "tin" is gone
    And the image "jar" is still there

  Scenario: The phone uploads the Picture and then syncs the scan with its image id
    Given I add a 40x30 PNG image named "tin"
    And the phone queues the unknown barcode "5012345678900" at "Coop" as "q-1" with the picture "tin"
    When the phone syncs its queue
    Then the sync results are "applied"
    And scan "q-1" created the Product "Tinned tomatoes 400 g"
    And scan "q-1" shows the Product picture "tin"
    And the Product "Tinned tomatoes 400 g" shows the picture "tin"

  Scenario: Syncing the same queue again does not duplicate or change the Picture
    Given I add a 40x30 PNG image named "tin"
    And the phone queues the unknown barcode "5012345678900" at "Coop" as "q-1" with the picture "tin"
    And the phone syncs its queue
    When the phone syncs its queue
    Then the sync results are "duplicate"
    And the Product "Tinned tomatoes 400 g" shows the picture "tin"

  Scenario: A Picture swept before the phone syncs is dropped and the scan still applies
    Given I add a 40x30 PNG image named "tin"
    And 49 hours pass
    And the scheduler runs its due jobs
    And the image "tin" is gone
    And the phone queues the unknown barcode "5012345678900" at "Coop" as "q-1" with the picture "tin"
    And the phone queues the unknown barcode "4006381333931" at "Coop" as "q-2" with no picture
    When the phone syncs its queue
    Then the sync results are "applied, applied"
    And scan "q-1" created the Product "Tinned tomatoes 400 g"
    And scan "q-1" shows no Product picture
    And the Product "Tinned tomatoes 400 g" has no picture

  Scenario: A queued scan merged into a Product without a Picture fills it on sync
    Given I add a 40x30 PNG image named "tin"
    And the phone queues the unknown barcode "8000500310427" at "Coop" as "q-1" with the picture "tin"
    When the phone syncs its queue
    Then scan "q-1" was merged into "Mutti passata 700 g"
    And the Product "Mutti passata 700 g" shows the picture "tin"
