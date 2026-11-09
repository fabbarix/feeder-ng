// Package deps pins, via blank imports, the third-party modules that later
// teams are expected to need, so go.mod/go.sum stay stable across teams.
// Remove an import here only when nothing in the module needs it.
package deps

import (
	_ "github.com/HugoSmits86/nativewebp"
	_ "github.com/SherClockHolmes/webpush-go"
	_ "github.com/cucumber/godog"
	_ "github.com/google/uuid"
	_ "golang.org/x/image/draw"
	_ "golang.org/x/oauth2"
	_ "golang.org/x/oauth2/google"
	_ "modernc.org/sqlite"
)
