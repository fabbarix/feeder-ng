package store_test

import (
	"bytes"
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/store"
	"github.com/fabbarix/feeder-ng/internal/secretbox"
)

var t0 = time.Date(2026, 11, 10, 9, 0, 0, 0, time.UTC)

func open(t *testing.T) (*store.Store, *sql.DB, *clock.Fake) {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	clk := clock.NewFake(t0)
	return store.New(d, clk), d, clk
}

func newBox(t *testing.T, fill byte) (*secretbox.Box, secretbox.MasterKey) {
	t.Helper()
	mk, err := secretbox.ParseMasterKey("W1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1s=") // 32 x 0x5b
	if err != nil {
		t.Fatal(err)
	}
	b, err := secretbox.New(mk)
	if err != nil {
		t.Fatal(err)
	}
	return b, mk
}

var admin = store.Actor{UserID: 1, Email: "admin@example.test"}

func TestLoadReturnsTheSeedRow(t *testing.T) {
	s, _, _ := open(t)
	row, err := s.Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if row.Settings != recipeassistant.DefaultSettings() || row.Ciphertext != nil || row.MasterID != "" {
		t.Errorf("seed = %+v", row)
	}
}

func TestTheKeyRoundTripsEncryptedAndLast4IsStoredBesideIt(t *testing.T) {
	s, d, _ := open(t)
	ctx := context.Background()
	box, mk := newBox(t, 0x5b)
	const key = "sk-ant-api03-SECRETSECRET-wxyz"
	sealed, err := box.Seal([]byte(key))
	if err != nil {
		t.Fatal(err)
	}
	set := recipeassistant.Settings{Enabled: true, BaseURL: "http://127.0.0.1:9", Model: "claude-sonnet-5-5", HasKey: true, KeyLast4: "wxyz"}
	err = s.Save(ctx, store.SaveInput{Settings: set, Key: &store.SealedKey{Ciphertext: sealed, MasterID: mk.ID(), Last4: "wxyz"}, Actor: admin,
		Changes: []recipeassistant.Change{{Action: recipeassistant.ActionKeySaved, Detail: "wxyz"}}})
	if err != nil {
		t.Fatal(err)
	}
	row, err := s.Load(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if row.Settings != set || row.MasterID != mk.ID() || row.UpdatedBy != admin.UserID || !row.UpdatedAt.Equal(t0) {
		t.Errorf("row = %+v", row)
	}
	plain, err := box.Open(row.Ciphertext)
	if err != nil || string(plain) != key {
		t.Fatalf("Open = %q, %v", plain, err)
	}
	// Plaintext is nowhere in the database file's rows.
	var blob []byte
	var last4 string
	if err := d.QueryRow(`SELECT api_key_ciphertext, api_key_last4 FROM recipe_assistant_settings WHERE id=1`).Scan(&blob, &last4); err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(blob, []byte("SECRETSECRET")) || last4 != "wxyz" {
		t.Errorf("stored blob leaks the key or last4 = %q", last4)
	}
	var ev string
	_ = d.QueryRow(`SELECT group_concat(action||':'||detail) FROM recipe_assistant_events`).Scan(&ev)
	if ev != "key_saved:wxyz" {
		t.Errorf("events = %q (only the last four may be recorded)", ev)
	}
}

func TestSavingWithoutAKeyKeepsTheStoredKeyAndClearKeyRemovesIt(t *testing.T) {
	s, _, _ := open(t)
	ctx := context.Background()
	box, mk := newBox(t, 0x5b)
	sealed, _ := box.Seal([]byte("sk-abcdefgh-1234"))
	_ = s.Save(ctx, store.SaveInput{Settings: recipeassistant.Settings{BaseURL: recipeassistant.DefaultBaseURL, Model: "m1", HasKey: true, KeyLast4: "1234"},
		Key: &store.SealedKey{Ciphertext: sealed, MasterID: mk.ID(), Last4: "1234"}, Actor: admin})
	if err := s.Save(ctx, store.SaveInput{Settings: recipeassistant.Settings{BaseURL: recipeassistant.DefaultBaseURL, Model: "m2", HasKey: true, KeyLast4: "1234"}, Actor: admin}); err != nil {
		t.Fatal(err)
	}
	row, _ := s.Load(ctx)
	if row.Settings.Model != "m2" || !bytes.Equal(row.Ciphertext, sealed) || row.MasterID != mk.ID() {
		t.Errorf("a save without Key must keep the sealed key: %+v", row)
	}
	if err := s.Save(ctx, store.SaveInput{Settings: recipeassistant.Settings{BaseURL: recipeassistant.DefaultBaseURL, Model: "m2"}, ClearKey: true, Actor: admin}); err != nil {
		t.Fatal(err)
	}
	row, _ = s.Load(ctx)
	if row.Ciphertext != nil || row.MasterID != "" || row.Settings.HasKey || row.Settings.KeyLast4 != "" {
		t.Errorf("ClearKey must remove ciphertext, master id and last4: %+v", row)
	}
}

func TestChangeHistoryOneRowPerChangeNewestFirstWithAnActorSnapshot(t *testing.T) {
	s, _, clk := open(t)
	ctx := context.Background()
	save := func(who store.Actor, cs ...recipeassistant.Change) {
		if err := s.Save(ctx, store.SaveInput{Settings: recipeassistant.DefaultSettings(), Actor: who, Changes: cs}); err != nil {
			t.Fatal(err)
		}
		clk.Advance(time.Minute)
	}
	save(admin, recipeassistant.Change{Action: recipeassistant.ActionTurnedOn}, recipeassistant.Change{Action: recipeassistant.ActionModelChanged, Detail: "a -> b"})
	save(store.Actor{UserID: 7, Email: "other@example.test"}, recipeassistant.Change{Action: recipeassistant.ActionTurnedOff})
	save(admin) // a no-op save writes no event
	ev, err := s.Events(ctx, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(ev) != 3 {
		t.Fatalf("events = %+v, want 3", ev)
	}
	if ev[0].Action != "turned_off" || ev[0].ActorEmail != "other@example.test" || ev[0].ActorUserID != 7 || !ev[0].At.Equal(t0.Add(time.Minute)) {
		t.Errorf("newest first with the actor snapshot: %+v", ev[0])
	}
	if ev[2].Action != "turned_on" && ev[1].Action != "turned_on" {
		t.Errorf("both changes of the first save are recorded: %+v", ev)
	}
	if got, _ := s.Events(ctx, 2); len(got) != 2 {
		t.Errorf("limit not applied: %d", len(got))
	}
}

func TestASaveIsAtomicNoEventsWithoutTheSettingsWrite(t *testing.T) {
	s, d, _ := open(t)
	ctx := context.Background()
	// Make the settings write fail: a trigger that aborts any update of the row.
	if _, err := d.Exec(`CREATE TRIGGER no_update BEFORE UPDATE ON recipe_assistant_settings BEGIN SELECT RAISE(ABORT, 'boom'); END`); err != nil {
		t.Fatal(err)
	}
	err := s.Save(ctx, store.SaveInput{Settings: recipeassistant.Settings{Enabled: true, BaseURL: recipeassistant.DefaultBaseURL, Model: "m"}, Actor: admin,
		Changes: []recipeassistant.Change{{Action: recipeassistant.ActionTurnedOn}}})
	if err == nil {
		t.Fatal("the save must fail")
	}
	if ev, _ := s.Events(ctx, 20); len(ev) != 0 {
		t.Errorf("events written without the settings: %+v", ev)
	}
}

func TestEventsOlderThanAYearArePruned(t *testing.T) {
	s, _, clk := open(t)
	ctx := context.Background()
	_ = s.Save(ctx, store.SaveInput{Settings: recipeassistant.DefaultSettings(), Actor: admin, Changes: []recipeassistant.Change{{Action: recipeassistant.ActionTurnedOn}}})
	clk.Advance(store.EventRetention - time.Hour)
	_ = s.Save(ctx, store.SaveInput{Settings: recipeassistant.DefaultSettings(), Actor: admin, Changes: []recipeassistant.Change{{Action: recipeassistant.ActionTurnedOff}}})
	clk.Advance(2 * time.Hour) // the first is now older than the retention
	n, err := s.Prune(ctx)
	if err != nil || n != 1 {
		t.Fatalf("Prune = %d, %v, want 1", n, err)
	}
	ev, _ := s.Events(ctx, 20)
	if len(ev) != 1 || ev[0].Action != "turned_off" {
		t.Errorf("remaining = %+v", ev)
	}
}
