Feature: Tick a Shopping List Line by hand while scanning (beta.8, scan)
  On the Scan screen the To get tab ticks a Line by hand: the tick is the same call as on the Shop screen, with the
  Line's remaining quantity, and its Undo is the Shop screen's untick. These scenarios pin the API the To get row
  uses: the tick covers the Line and puts what is left into Stock, a scan before it counts in the Line's cover, and the
  untick (the toast's Undo) puts the Line back in To get.

  Background:
    Given a running Feeder
    And I am signed in as the User
    And the shopping household has a Shop "Coop"
    And the shopping catalogue has the Product "Mutti passata 700 g" of "passata" in g with pack size 700 and barcode "8000500310427"
    And I add the Shopping List extra of 1400 g of "passata"

  Scenario: Ticking a Line by hand marks it bought and adds it to Stock
    When I tick "passata" on the Shopping List by hand with 1400 g
    And I view the Shopping List at "Coop"
    Then the Shopping List line "passata" is ticked
    And the shopping Stock total of "passata" is 1400 g

  Scenario: A Line half covered by a scan is ticked for what is left
    Given I scan the Product "Mutti passata 700 g" at "Coop" as list scan "l1"
    When I tick "passata" on the Shopping List by hand with 700 g
    And I view the Shopping List at "Coop"
    Then the Shopping List line "passata" is ticked
    And the shopping Stock total of "passata" is 1400 g

  Scenario: Undo puts the Line back in To get
    Given I tick "passata" on the Shopping List by hand with 1400 g
    When I untick "passata" on the Shopping List
    And I view the Shopping List at "Coop"
    Then the Shopping List line "passata" is not ticked
