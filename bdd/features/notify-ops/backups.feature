Feature: Backups
  The Feeder keeps SQLite snapshots in /data/backups (ADR 0004). An Admin can
  list them and take one now; the nightly job (02:30 household time) uses the
  same code and prunes to 7 daily plus 4 weekly snapshots.

  Background:
    Given a running Feeder

  Scenario: An Admin takes a backup now
    Given I am signed in as the Admin
    When I take a backup now
    Then the response status is 201
    And the backup folder holds "feeder-2026-11-09.db"
    And the backup "feeder-2026-11-09.db" opens as a Feeder database with the Admin in it

  Scenario: Backups are listed newest first
    Given I am signed in as the Admin
    When I take a backup now
    And 1 days go by in the backup kitchen
    And I take a backup now
    And I list the backups
    Then the backups listed are "feeder-2026-11-10.db, feeder-2026-11-09.db"

  Scenario: Taking a backup twice on the same day keeps one file
    Given I am signed in as the Admin
    When I take a backup now
    And I take a backup now
    Then the backup folder holds 1 backup

  Scenario: Old backups are pruned to 7 daily and 4 weekly
    Given I am signed in as the Admin
    And the backup folder has a snapshot for each of the 40 days before today
    When I take a backup now
    Then the backup folder holds 11 backups
    And the backup folder holds "feeder-2026-11-09.db"
    And the backup folder holds "feeder-2026-11-02.db"
    And the backup folder does not hold "feeder-2026-10-30.db"

  Scenario: Files that are not snapshots are never deleted
    Given I am signed in as the Admin
    And the backup folder has a file "notes.txt"
    And the backup folder has a snapshot for each of the 40 days before today
    When I take a backup now
    Then the backup folder holds the file "notes.txt"

  Scenario: A User cannot manage backups
    Given I am signed in as the User
    When I take a backup now
    Then the response status is 403
    When I list the backups
    Then the response status is 403
