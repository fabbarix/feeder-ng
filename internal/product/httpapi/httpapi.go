// Package httpapi exposes the Shop, Product, Price, catalog and resolve routes
// (docs/dev/design/t9-products-shops.md). Handlers stay thin: parse, call
// internal/product or its store, respond.
package httpapi

import "github.com/fabbarix/feeder-ng/internal/app"

func init() { app.Register(app.Module{Name: "products", Mount: mount}) }

// mount registers the routes. TODO(developer): every route in the design note;
// Shop and Weight Barcode Rule writes use r.Admin, the rest r.User.
func mount(r *app.Router, d app.Deps) {}
