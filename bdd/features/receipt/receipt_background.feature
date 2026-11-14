@receipt-background
Feature: A receipt read goes on when the phone leaves the screen (receipt reading 3.3, beta.8)
  The phone starts a read and may leave the photos screen: the app keeps asking in the background and tells the User when the
  Receipt review is ready (the Scan screen's "Read the receipt" row, and a toast elsewhere in the app). That works because the
  server owns the read: it is not tied to the request that started it, it is kept for 10 minutes after it finishes, and the
  phone can ask for it again at any time, also after a reload. Leaving the screen never sends a DELETE; only Cancel does.
  The phone side (the row, the toast, the reload) is covered by the vitest suites in web/src/features/receipt; these scenarios pin
  the server contract it relies on.

  Background:
    Given Feeder runs with the Recipe Assistant on through a fake provider
    And the Shops "Esselunga" and "Coop"
    And the Products "Mutti passata 700 g" and "Barilla spaghetti 500 g"
    And I am signed in as the User
    And I scanned "Mutti passata 700 g" twice at 7771 cents and "Barilla spaghetti 500 g" once at 119 cents in "Esselunga" today

  Scenario: A read goes on while the phone is not asking, and is there when it comes back
    Given the provider will read row 0 as 2 packs at 149 cents each
    When I start a receipt read with 2 photos for "Esselunga"
    And the phone does not ask for a moment
    And I ask for the receipt read
    Then the receipt read is done
    And the read proposes "price:0", checked, changing the Price from 7771 to 149

  Scenario: A read the phone left running still frees its slot when it ends, so the next read can start
    Given the provider will read row 0 as 2 packs at 149 cents each
    When I start a receipt read with 1 photos for "Esselunga"
    And the phone does not ask for a moment
    Then I can start another receipt read at once

  Scenario: A finished read can be fetched again and again for 10 minutes (a reload, a second tab)
    Given the provider will read row 0 as 2 packs at 149 cents each
    When I read the receipt with 1 photos for "Esselunga"
    And 9 minutes pass
    And I ask for the receipt read
    Then the receipt read is done
    And the read has a fingerprint of 64 hex digits

  Scenario: After 10 minutes the read is gone, and asking says so (the phone then shows the plain row)
    Given the provider will read row 0 as 2 packs at 149 cents each
    When I read the receipt with 1 photos for "Esselunga"
    And 11 minutes pass
    And I ask for the receipt read
    Then the response status is 404

  Scenario: Only Cancel stops a read
    Given the provider will hold the read
    When I start a receipt read with 1 photos for "Esselunga"
    And the phone does not ask for a moment
    And I ask for the receipt read once
    Then the receipt read is still running
    When I cancel the receipt read
    Then the receipt read ends failed with "cancelled"
