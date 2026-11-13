Feature: Reading a receipt
  At the end of a shop a Member photographs the Receipt. Feeder sends up to 4 photos and today's Scanned list to the
  assistant the Admin configured for the Recipe Assistant, and shows what the assistant read as proposals. Only today's
  Scanned list, before Change Shop, can be read; the photos are never stored or logged; reads share the Recipe
  Assistant's limit. Nothing is written by a read (the Apply is a later package).

  Background:
    Given Feeder runs with the Recipe Assistant on through a fake provider
    And the Shops "Esselunga" and "Coop"
    And the Products "Mutti passata 700 g" and "Barilla spaghetti 500 g"
    And I am signed in as the User
    And I scanned "Mutti passata 700 g" twice at 7771 cents and "Barilla spaghetti 500 g" once at 119 cents in "Esselunga" today

  Scenario: A Member reads a receipt and gets proposals, rows, totals and a fingerprint
    Given the provider will read row 0 as 2 packs at 149 cents each
    When I read the receipt with 2 photos for "Esselunga"
    Then the receipt read is done
    And the provider got 2 JPEG photos before one text block holding the 2 rows
    And the read has 2 rows, the first being "Mutti passata 700 g" scanned 2 times
    And the read proposes "price:0", checked, changing the Price from 7771 to 149
    And the read proposes "missing:1" for the row not on the receipt
    And the read has a fingerprint of 64 hex digits
    And the read has the receipt total of 7800 cents and the scanned total of 15661 cents

  Scenario: Reading twice gives the same fingerprint, and an edit changes it
    Given the provider will read row 0 as 2 packs at 149 cents each
    And the provider will read row 0 as 2 packs at 149 cents each
    When I read the receipt with 1 photos for "Esselunga"
    And I read the receipt with 1 photos for "Esselunga" again
    Then the two fingerprints are the same
    When I change the Price of the last scan to 120 cents
    And the provider will read row 0 as 2 packs at 149 cents each
    And I read the receipt with 1 photos for "Esselunga" again
    Then the fingerprint differs from the first

  Scenario: Photos are never stored
    Given the provider will read row 0 as 2 packs at 149 cents each
    When I read the receipt with 3 photos for "Esselunga"
    Then the receipt read is done
    And no file in the data directory is an image or holds the photos' bytes
    And no database row holds image bytes

  Scenario: Photos, rows, lines and prices are never logged
    Given the provider will read row 0 as 2 packs at 149 cents each
    When I read the receipt with 2 photos for "Esselunga"
    Then the logs contain no Product name, barcode, receipt line, price of the Scanned list, photo data or API key

  Scenario Outline: At most 4 photos, at least 1
    When I send a receipt read with <photos> photos
    Then the receipt read is refused with <status> "<code>"

    Examples:
      | photos | status | code            |
      | 0      | 422    | photos_empty    |
      | 5      | 422    | too_many_photos |

  Scenario: A photo that is not an image is refused
    When I send a receipt read with a text file as its photo
    Then the receipt read is refused with 422 "photo_unsupported"

  Scenario: Only today's Scanned list can be read
    When the household day turns
    And I send a receipt read with 1 photos
    Then the receipt read is refused with 422 "scans_empty"
    And the provider received no request

  Scenario: Change Shop ends the session that can be read
    Given I scanned "Mutti passata 700 g" once at 150 cents in "Coop" today
    When I send a receipt read for "Coop" with the uuids of the Esselunga session
    Then the receipt read is refused with 422 "scans_empty"

  Scenario: Scans still waiting to sync are left out
    Given the provider will read row 0 as 2 packs at 149 cents each
    When I read the receipt for "Esselunga" with the uuids of the session and one the server has never seen
    Then the receipt read is done
    And the read has 2 rows

  Scenario Outline: What the assistant does with a photo
    Given the provider will <behaviour>
    When I read the receipt with 1 photos for "Esselunga"
    Then the receipt read failed with "<code>"
    And the read proposes nothing

    Examples:
      | behaviour                       | code                     |
      | refuse the photo                | assistant_declined       |
      | say the photo is not a receipt  | no_receipt_found         |
      | answer with prose               | assistant_invalid_output |
      | reject the key                  | assistant_bad_key        |
      | run out of tokens               | assistant_output_too_long |

  Scenario: The assistant is off
    Given the Admin switches the assistant off
    When I send a receipt read with 1 photos
    Then the receipt read is refused with 409 "assistant_unavailable" because "off"

  Scenario: There is no API key
    Given the assistant is on with no API key
    When I send a receipt read with 1 photos
    Then the receipt read is refused with 409 "assistant_unavailable" because "no_key"

  Scenario: An Admin may read too
    Given the provider will read row 0 as 2 packs at 149 cents each
    When an Admin reads the receipt with 1 photos for "Esselunga"
    Then the receipt read is done

  Scenario: Receipt reads share the Recipe Assistant's limit of 30 an hour
    When I have made 30 accepted reads
    And I send a receipt read with 1 photos
    Then the receipt read is refused with 429 "too_many_reads" and a wait

  Scenario: A running read can be cancelled and frees the User
    Given the provider will hold the read
    When I start a receipt read with 1 photos for "Esselunga"
    And I cancel the receipt read
    Then the receipt read ends failed with "cancelled"
    And I can start another receipt read at once

  Scenario: Another User cannot see my read
    Given the provider will read row 0 as 2 packs at 149 cents each
    When I read the receipt with 1 photos for "Esselunga"
    Then an Admin asking for that read gets 404
