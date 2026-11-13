<!-- Draft for the CHANGELOG: paste under the 1.0.0-beta.5 heading, after its own lists. Not part of the app. -->

### Upgrading

No new settings. The database is migrated on start: 1500 adds the Meal Slot on one date (Not served, the date's own time and Guests), 1510 lets a Leftover sit in a Storage Place and be frozen and adds the Frozen Use-by and the history of Leftovers by hand, 1520 records which Planned Meal a purchase from the Shopping List was bought for, and 1530 adds Not needed on the Shopping List. Migrations cannot be undone. Purchases made before the upgrade have no record, so a Planned Meal becomes Bought only by a purchase after it.

If the database already has applied migrations, Feeder first saves a checked copy of it as `feeder-pre-1500.db` in the `backups` folder of the data volume (`/data/backups`), before any of the four migrations runs. It is not listed in Settings, the nightly clean-up does not remove it, an existing copy is kept, and a fresh install takes none. If the copy cannot be written, Feeder stops with a log line naming the file and migrates nothing.

A Leftover past its Use-by is no longer thrown away at 03:00: after the upgrade it waits on Today until someone answers Had it, Threw it out or Wasn't there.

Upgrade with `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.5 --namespace feeder --reset-then-reuse-values`, or pull the new image and restart.

To go back to 1.0.0-beta.4.2, stop Feeder (on Kubernetes, set the deployment to zero replicas), copy `feeder-pre-1500.db` over `feeder.db` (and delete `feeder.db-wal` and `feeder.db-shm`), then start the older image. Everything you changed after the upgrade is lost. On Kubernetes, `helm history feeder -n feeder` lists the revisions and `helm rollback feeder <revision> -n feeder` returns to the one that ran 1.0.0-beta.4.2, but only after the database is restored. The steps are in the deploy guide, "Upgrading from 1.0.0-beta.4.2 to 1.0.0-beta.5".
