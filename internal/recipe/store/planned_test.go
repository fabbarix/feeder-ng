package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe/store"
)

type errChecker struct{}

func (errChecker) WasPlanned(context.Context, store.Querier, int64) (bool, error) {
	return false, errors.New("boom")
}

func TestPlannedCheckers(t *testing.T) {
	p := store.NewPlannedCheckers()
	if planned, err := p.WasPlanned(context.Background(), nil, 1); planned || err != nil {
		t.Fatalf("empty registry = %v, %v; want false, nil (default: never planned)", planned, err)
	}
	p.Register("a", planned{1: true})
	p.Register("b", planned{2: true})
	for id, want := range map[int64]bool{1: true, 2: true, 3: false} {
		got, err := p.WasPlanned(context.Background(), nil, id)
		if err != nil || got != want {
			t.Errorf("WasPlanned(%d) = %v, %v; want %v", id, got, err, want)
		}
	}
	p.Unregister("a")
	if got, _ := p.WasPlanned(context.Background(), nil, 1); got {
		t.Error("Unregister did not remove the checker")
	}
	p.Register("err", errChecker{})
	if _, err := p.WasPlanned(context.Background(), nil, 3); err == nil {
		t.Error("a checker error must be returned")
	}
	for name, f := range map[string]func(){
		"duplicate": func() { p.Register("b", planned{}) },
		"empty":     func() { p.Register("", planned{}) },
		"nil":       func() { p.Register("c", nil) },
	} {
		func() {
			defer func() {
				if recover() == nil {
					t.Errorf("%s Register must panic", name)
				}
			}()
			f()
		}()
	}
}
