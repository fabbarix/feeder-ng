// Package httpapi lets an Admin list the nightly snapshots and take one now. At
// Mount it schedules the nightly snapshot on app.Deps.Scheduler.
package httpapi

import (
	"net/http"
	"path/filepath"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/backup"
	hstore "github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

func init() { app.Register(app.Module{Name: "backup", Mount: mount}) }

type api struct {
	d   app.Deps
	dir string
	hs  *hstore.Store
}

func mount(r *app.Router, d app.Deps) {
	a := &api{d: d, dir: filepath.Join(d.Config.DataDir, backup.DirName), hs: hstore.New(d.DB, d.Clock)}
	d.Scheduler.Daily("backup.nightly", backup.NightlyAt, backup.Job(d.DB, a.dir))
	r.Admin("GET /api/admin/backups", a.list)
	r.Admin("POST /api/admin/backups", a.create)
}

type backupDTO struct {
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	CreatedAt string `json:"createdAt"`
}

func (a *api) list(w http.ResponseWriter, _ *http.Request) {
	infos, err := backup.List(a.dir)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "internal", "Something went wrong")
		return
	}
	out := make([]backupDTO, 0, len(infos))
	for _, i := range infos {
		out = append(out, toDTO(i))
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"backups": out})
}

// create takes a snapshot for today's household date, then prunes by policy.
func (a *api) create(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	s, err := a.hs.Settings(ctx)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "internal", "Something went wrong")
		return
	}
	loc := time.UTC
	if l, err := time.LoadLocation(s.TimeZone); err == nil {
		loc = l
	}
	day := a.d.Clock.Now().In(loc).Format("2006-01-02")
	if err := backup.Job(a.d.DB, a.dir)(ctx, day); err != nil {
		a.d.Logger.Error("backup failed", "err", err)
		httpx.WriteError(w, http.StatusInternalServerError, "internal", "The backup failed")
		return
	}
	infos, err := backup.List(a.dir)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "internal", "Something went wrong")
		return
	}
	for _, i := range infos {
		if i.Day == day {
			httpx.WriteJSON(w, http.StatusCreated, toDTO(i))
			return
		}
	}
	httpx.WriteError(w, http.StatusInternalServerError, "internal", "Something went wrong")
}

func toDTO(i backup.Info) backupDTO {
	return backupDTO{Name: i.Name, Size: i.Size, CreatedAt: i.CreatedAt.UTC().Format(time.RFC3339)}
}
