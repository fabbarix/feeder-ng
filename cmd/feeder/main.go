// Command feeder runs the Feeder server: configuration, database, migrations,
// the app with its modules and the embedded SPA, served until SIGINT or SIGTERM.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/db"
	_ "github.com/fabbarix/feeder-ng/internal/modules"
	"github.com/fabbarix/feeder-ng/web"
)

const shutdownGrace = 10 * time.Second

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	slog.SetDefault(logger)

	cfg, err := config.Load(os.Getenv)
	if err != nil {
		fmt.Fprintln(os.Stderr, "feeder:", err)
		os.Exit(2)
	}
	if err := run(cfg, logger); err != nil {
		logger.Error("feeder stopped", "error", err)
		os.Exit(1)
	}
}

func run(cfg config.Config, logger *slog.Logger) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	d, err := db.Open(cfg.DBPath())
	if err != nil {
		return err
	}
	defer d.Close()
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		return err
	}
	a, err := app.New(cfg, d, clock.System{}, web.FS(), app.WithLogger(logger))
	if err != nil {
		return err
	}

	go a.Deps.Scheduler.Run(ctx, time.Minute)

	srv := &http.Server{Addr: cfg.Addr, Handler: a.Handler, ReadHeaderTimeout: 10 * time.Second}
	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.ListenAndServe() }()
	logger.Info("feeder listening", "addr", cfg.Addr, "data", cfg.DataDir)

	select {
	case err := <-serveErr:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		logger.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownGrace)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
}
