// Package httpapi exposes the Courses routes of spec §16 (list, add, rename and Make main, reorder,
// impact, delete, archive, unarchive). Handlers only parse, call internal/course/store and respond.
//
// Team C1 (docs/dev/design/crs-c1.md): this file is a stub that registers the module without routes,
// so the tests in this directory are red for the right reason (404 instead of a compile error).
// The developer fills in mount.
package httpapi

import "github.com/fabbarix/feeder-ng/internal/app"

func init() { app.Register(app.Module{Name: "courses", Mount: mount}) }

func mount(r *app.Router, d app.Deps) {}
