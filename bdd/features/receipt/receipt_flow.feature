Feature: Reading and applying a receipt, end to end (receipt reading, RR5)
  The two halves already have their own features: receipt_read.feature (the read) and receipt_apply.feature (the apply
  with seeded reads). These scenarios run them together through the real routes with the fake provider: read the
  photos, review the proposals, apply the ones the Member accepts. Nothing is written until the apply, and the apply
  writes nothing when the session is not the one that was read. A read never queues a photo, so there is no offline
  apply; a phone that was offline reads again once its scans have synced.

  Background:
    Given Feeder runs with the Recipe Assistant on through a fake provider
    And the Shops "Esselunga" and "Coop"
    And the Products "Mutti passata 700 g" and "Barilla spaghetti 500 g"
    And I am signed in as the User
    And I scanned "Mutti passata 700 g" twice at 7771 cents and "Barilla spaghetti 500 g" once at 119 cents in "Esselunga" today

  Scenario: Read, review and apply in one go
    Given the provider will read row 0 as 2 packs at 149 cents each
    When I read the receipt with 2 photos for "Esselunga"
    Then the receipt read is done
    And the Shopping List shows 15661 cents spent
    When I apply the read for "Esselunga" accepting "price:0"
    Then the receipt flow response status is 200
    And the receipt flow response applied 1 proposal
    And the Shopping List shows 417 cents spent
    And the latest Price of "Mutti passata 700 g" at "Esselunga" is 149 cents
    And the latest Price of "Barilla spaghetti 500 g" at "Esselunga" is 119 cents

  Scenario: Reading writes nothing, and a proposal the Member leaves unchecked is not applied
    Given the provider will read row 0 as 2 packs at 149 cents each
    When I read the receipt with 1 photos for "Esselunga"
    Then the receipt read is done
    And the Shopping List shows 15661 cents spent
    And the latest Price of "Mutti passata 700 g" at "Esselunga" is 7771 cents
    When I apply the read for "Esselunga" accepting nothing
    Then the receipt flow response status is 200
    And the receipt flow response applied 0 proposals
    And the Shopping List shows 15661 cents spent

  Scenario: A refusal leaves nothing to apply
    Given the provider will refuse the photo
    When I read the receipt with 1 photos for "Esselunga"
    Then the receipt read failed with "assistant_declined"
    And the read proposes nothing
    When I apply the read for "Esselunga" accepting "price:0"
    Then the receipt flow response status is not 200
    And the Shopping List shows 15661 cents spent

  Scenario: A Scan since the read refuses the apply and writes nothing
    Given the provider will read row 0 as 2 packs at 149 cents each
    When I read the receipt with 1 photos for "Esselunga"
    And I scan "Barilla spaghetti 500 g" again at 119 cents in "Esselunga"
    And I apply the read for "Esselunga" accepting "price:0"
    Then the receipt flow response status is 409 with the error "receipt_session_changed"
    And the Shopping List shows 15780 cents spent
    And the latest Price of "Mutti passata 700 g" at "Esselunga" is 7771 cents

  Scenario: A Price edited since the read refuses the apply
    Given the provider will read row 0 as 2 packs at 149 cents each
    When I read the receipt with 1 photos for "Esselunga"
    And I change the Price of the last scan to 120 cents
    And I apply the read for "Esselunga" accepting "price:0"
    Then the receipt flow response status is 409 with the error "receipt_session_changed"
    And the latest Price of "Mutti passata 700 g" at "Esselunga" is 7771 cents

  Scenario: A read is kept for 10 minutes, so the next day it is gone
    Given the provider will read row 0 as 2 packs at 149 cents each
    When I read the receipt with 1 photos for "Esselunga"
    And the household day turns
    And I apply the read for "Esselunga" accepting "price:0"
    Then the receipt flow response status is 410 with the error "receipt_read_gone"
    And the latest Price of "Mutti passata 700 g" at "Esselunga" is 7771 cents

  Scenario: A scan that synced after the read is a new session to read again
    Given the provider will read row 0 as 2 packs at 149 cents each
    When I read the receipt for "Esselunga" with the uuids of the session and one the server has never seen
    Then the receipt read is done
    And the read has 2 rows
    When the phone replays its waiting scan of "Barilla spaghetti 500 g" at 119 cents in "Esselunga"
    And I apply the read for "Esselunga" accepting "price:0"
    Then the receipt flow response status is 409 with the error "receipt_session_changed"
    When the provider will read row 0 as 2 packs at 149 cents each
    And I read the receipt with 1 photos for "Esselunga" again
    And I apply the read for "Esselunga" accepting "price:0"
    Then the receipt flow response status is 200
    And the latest Price of "Mutti passata 700 g" at "Esselunga" is 149 cents

  Scenario: A replayed scan is not added twice, so the read still matches
    Given the provider will read row 0 as 2 packs at 149 cents each
    When I read the receipt with 1 photos for "Esselunga"
    And the phone replays the scans it already sent in "Esselunga"
    And I apply the read for "Esselunga" accepting "price:0"
    Then the receipt flow response status is 200
    And the Shopping List shows 417 cents spent

  Scenario: The photos are not kept after the apply either
    Given the provider will read row 0 as 2 packs at 149 cents each
    When I read the receipt with 3 photos for "Esselunga"
    And I apply the read for "Esselunga" accepting "price:0"
    Then the receipt flow response status is 200
    And no file in the data directory is an image or holds the photos' bytes
    And no database row holds image bytes
