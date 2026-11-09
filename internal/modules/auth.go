// Package modules lists the feature modules compiled into the Feeder. Each
// feature has one file here that blank-imports its httpapi package, which
// registers the module in init(). cmd/feeder and testkit both import this
// package, so the binary and the BDD tests run the same module set.
package modules

import _ "github.com/fabbarix/feeder-ng/internal/auth/httpapi"
