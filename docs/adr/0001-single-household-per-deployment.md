# One Household per deployment

Feeder serves exactly one Household per running instance. A family self-hosts its own container, so the schema has no tenant key, there is no join or invite-between-families flow, and Members, Recipes, Stock and Shops are global to the instance. We considered multi-household hosting and rejected it: tenant isolation would touch every table and query, and it adds nothing for a self-hosted family app. Another family runs another container and shares Recipes through Recipe Files.
