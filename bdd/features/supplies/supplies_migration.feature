Feature: Migration 1550 and its snapshot (Supplies, H8)
  Migration 1550 adds the kind and the Restock level to Ingredients and nothing else. Every Ingredient that was there
  before is food with no Restock level, and its Products, Prices and Stock stay as they were. The snapshot Feeder takes
  before it, feeder-pre-1550.db, sits in the backups folder, is not listed in Settings and is never pruned. (ADR 0017,
  docs/dev/deploy.md)

  Background:
    Given a running Feeder
    And I am signed in as the Admin

  Scenario: Migration 1550 is applied
    Then the migration "1550_supplies.sql" is recorded
    And the Ingredients table has the columns "kind" and "restock_level"

  Scenario: An Ingredient written before the migration reads as food with no Restock level
    Given an Ingredient "flour" was written the way beta.6 wrote it, with a Product and 1000 g in Stock
    When I GET the Ingredient "flour"
    Then the response status is 200
    And the response JSON field "kind" is "food"
    And the response JSON field "restockLevel" is null
    And the Product "Flour 1 kg" of "flour" is still in the catalogue
    And the Household holds 1000 g of "flour" in Stock

  Scenario: Food from before the migration can be made a Supply later
    Given an Ingredient "flour" was written the way beta.6 wrote it, with a Product and 1000 g in Stock
    When I PATCH the Ingredient "flour" with JSON:
      """
      {"kind": "supply", "restockLevel": 2000}
      """
    Then the response status is 200
    And the response JSON field "kind" is "supply"
    And the Household holds 1000 g of "flour" in Stock

  Scenario: The snapshot before the migration is kept, unlisted and never pruned
    Given the backup folder has a file "feeder-pre-1550.db"
    And the backup folder has a snapshot for each of the 40 days before today
    When I take a backup now
    And I list the backups
    Then the backups listed do not include "feeder-pre-1550.db"
    And the backup folder holds the file "feeder-pre-1550.db"
