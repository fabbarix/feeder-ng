package service_test

// DoneRead: the read as the apply looks it up (design §7.2 step 1).

import (
	"context"
	"errors"
	"testing"
	"time"

	rsvc "github.com/fabbarix/feeder-ng/internal/receipt/service"
	rasvc "github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
)

func TestDoneReadReturnsTheUsersDoneRead(t *testing.T) {
	w := newWorld(t, goodAnswer(), 0)
	v := w.read(t, input("e1", "e2", "e3"))
	got, err := w.svc.DoneRead(context.Background(), userA.UserID, v.ID)
	if err != nil || got.ID != v.ID || got.Fingerprint != v.Fingerprint || len(got.Rows) != len(v.Rows) ||
		len(got.Result.Proposals) != len(v.Result.Proposals) || got.Ctx.Today != v.Ctx.Today {
		t.Fatalf("DoneRead = %+v, %v; want the done view %+v", got, err, v)
	}
}

func TestDoneReadOfAnUnknownExpiredOrAnotherUsersReadIsGone(t *testing.T) {
	w := newWorld(t, goodAnswer(), 0)
	v := w.read(t, input("e1"))
	ctx := context.Background()
	if _, err := w.svc.DoneRead(ctx, userA.UserID, "nope"); !errors.Is(err, rsvc.ErrReadGone) {
		t.Errorf("unknown: %v", err)
	}
	if _, err := w.svc.DoneRead(ctx, 8, v.ID); !errors.Is(err, rsvc.ErrReadGone) {
		t.Errorf("another User's: %v", err)
	}
	w.clk.Advance(10*time.Minute + time.Second)
	if _, err := w.svc.DoneRead(ctx, userA.UserID, v.ID); !errors.Is(err, rsvc.ErrReadGone) {
		t.Errorf("expired: %v", err)
	}
}

func TestDoneReadOfARunningOrFailedReadIsNotDone(t *testing.T) {
	w := newWorld(t, "not json", 0)
	failed := w.read(t, input("e1"))
	ctx := context.Background()
	if _, err := w.svc.DoneRead(ctx, userA.UserID, failed.ID); !errors.Is(err, rsvc.ErrReadNotDone) {
		t.Errorf("failed: %v", err)
	}

	release := make(chan struct{})
	w.claude.mu.Lock()
	w.claude.fn = func(ctx context.Context, _ rasvc.Request) (rasvc.Response, error) {
		select {
		case <-release:
		case <-ctx.Done():
		}
		return rasvc.Response{}, ctx.Err()
	}
	w.claude.mu.Unlock()
	running, err := w.svc.Start(userA, input("e1"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.svc.DoneRead(ctx, userA.UserID, running.ID); !errors.Is(err, rsvc.ErrReadNotDone) {
		t.Errorf("running: %v", err)
	}
	close(release)
	w.wait(t, userA.UserID, running.ID)
}

func TestDoneReadWhileTheAssistantIsOffIsUnavailable(t *testing.T) {
	w := newWorld(t, goodAnswer(), 0)
	v := w.read(t, input("e1"))
	w.asst.unavailable = "off"
	var u *rsvc.Unavailable
	if _, err := w.svc.DoneRead(context.Background(), userA.UserID, v.ID); !errors.As(err, &u) || u.Reason != "off" {
		t.Errorf("DoneRead = %v, want *Unavailable{off}", err)
	}
}
