Feature: Offline scans and sync
  Scans made offline are queued on the phone with a client UUID and a timestamp, and applied in order when it is
  back online. The server is idempotent on the UUID. Forms filled offline are created on sync; a second creation of
  the same barcode is merged into the first.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping catalogue has the Product "Mutti passata 700 g" of "passata" in g with pack size 700 and barcode "8000500310427"
    And I add the Shopping List extra of 1400 g of "passata"

  Scenario: The phone caches everything it needs to resolve a scan
    When the phone caches the offline data for "Coop"
    Then the offline data knows the barcode "8000500310427" as "Mutti passata 700 g" with pack size 700

  Scenario: Queued scans are applied in order
    Given the phone caches the offline data for "Coop"
    And the phone queues the scan of "8000500310427" at "Coop" as "q-1"
    And the phone queues the scan of "8000500310427" at "Coop" as "q-2"
    When the phone syncs its queue
    Then the sync results are "applied, applied"
    And scan "q-1" did not tick the line
    And scan "q-2" ticked the line

  Scenario: Syncing the same queue again changes nothing
    Given the phone caches the offline data for "Coop"
    And the phone queues the scan of "8000500310427" at "Coop" as "q-1"
    And the phone syncs its queue
    When the phone syncs its queue
    Then the sync results are "duplicate"
    And the shopping Stock has 1 Lots of "passata"

  Scenario: An offline scan is dated by the day it was made
    Given the phone caches the offline data for "Coop"
    And the phone queues the scan of "8000500310427" at "Coop" as "q-1" on 2026-11-07
    When the phone syncs its queue
    Then the Stock Lot of scan "q-1" was bought on 2026-11-07

  Scenario: One rejected operation does not stop the rest
    Given the phone caches the offline data for "Coop"
    And the phone queues the scan of "8000500310427" at "Coop" as "q-1"
    And the phone queues a scan of an unknown Product as "q-bad"
    And the phone queues the scan of "8000500310427" at "Coop" as "q-2"
    When the phone syncs its queue
    Then the sync results are "applied, rejected, applied"

  Scenario: An unknown-barcode form filled offline is created on sync
    Given the phone queues the unknown barcode "5012345678900" at "Coop" as "q-1" named "Tinned tomatoes 400 g" for Ingredient "tinned tomatoes" of 400 g
    When the phone syncs its queue
    Then scan "q-1" created the Product "Tinned tomatoes 400 g"
    And the shopping Stock total of "tinned tomatoes" is 400 g

  Scenario: The same barcode created twice is merged into the first with a notice
    Given the phone queues the unknown barcode "5012345678900" at "Coop" as "q-1" named "Tinned tomatoes 400 g" for Ingredient "tinned tomatoes" of 400 g
    And the phone queues the unknown barcode "5012345678900" at "Coop" as "q-2" named "Tomatoes tin" for Ingredient "tinned tomatoes" of 400 g
    When the phone syncs its queue
    Then scan "q-2" was merged into "Tinned tomatoes 400 g"
    And there is exactly 1 Product named "Tinned tomatoes 400 g"
    And the shopping Stock has 2 Lots of "tinned tomatoes"
