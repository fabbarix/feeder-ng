package service_test

import (
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/shopping/service"
)

// B9-54 (RES 2, "ticked twice on two phones"): a tick answers with the additions made before it, including the SAME User's own
// (their other phone), each marked `Mine` and carrying the time it was ticked, oldest first. Before B9-54 the answer left the same
// User's own additions out, so a User who ticked a Line on two phones never learned it was ticked twice.

func TestATickAfterTheSameUsersOwnTickNamesItAsMine(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	at := startTime.Add(-2 * time.Hour)
	tickMilk(t, e, service.TickInput{Quantity: 400, ClientUUID: "phone-a", UserID: ana, TickedAt: at})
	second := tickMilk(t, e, service.TickInput{Quantity: 50, ClientUUID: "phone-b", UserID: ana, TickedAt: startTime.Add(-time.Hour)})
	if len(second.AlsoTickedBy) != 1 {
		t.Fatalf("AlsoTickedBy = %+v, want Ana's own earlier addition", second.AlsoTickedBy)
	}
	got := second.AlsoTickedBy[0]
	if got.Name != "Ana" || got.Quantity != 400 || got.By != "hand" || !got.Mine || !got.TickedAt.Equal(at) {
		t.Errorf("AlsoTickedBy[0] = %+v, want Ana's 400 by hand, Mine, ticked at the phone's time %v", got, at)
	}
}

func TestAnotherUsersAdditionIsNotMineAndCarriesItsTime(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	at := startTime.Add(-3 * time.Hour)
	tickMilk(t, e, service.TickInput{Quantity: 400, ClientUUID: "a", UserID: ana, TickedAt: at})
	second := tickMilk(t, e, service.TickInput{Quantity: 300, ClientUUID: "b", UserID: sam})
	if len(second.AlsoTickedBy) != 1 || second.AlsoTickedBy[0].Mine || second.AlsoTickedBy[0].Name != "Ana" || !second.AlsoTickedBy[0].TickedAt.Equal(at) {
		t.Errorf("AlsoTickedBy = %+v, want Ana's addition, not Mine, at %v", second.AlsoTickedBy, at)
	}
}

func TestTheAnswerListsEveryEarlierAdditionOldestFirstOwnAndOthers(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	tickMilk(t, e, service.TickInput{Quantity: 400, ClientUUID: "a", UserID: ana})
	tickMilk(t, e, service.TickInput{Quantity: 300, ClientUUID: "b", UserID: sam})
	third := tickMilk(t, e, service.TickInput{Quantity: 50, ClientUUID: "c", UserID: ana})
	if len(third.AlsoTickedBy) != 2 || third.AlsoTickedBy[0].Name != "Ana" || !third.AlsoTickedBy[0].Mine || third.AlsoTickedBy[1].Name != "Sam" || third.AlsoTickedBy[1].Mine {
		t.Errorf("AlsoTickedBy = %+v, want Ana's own (Mine) then Sam's, oldest first", third.AlsoTickedBy)
	}
}

func TestARetriedTickAnswersAsTheFirstTimeNeverNamingItselfOrLaterOnes(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	tickMilk(t, e, service.TickInput{Quantity: 400, ClientUUID: "a", UserID: ana})
	first := tickMilk(t, e, service.TickInput{Quantity: 50, ClientUUID: "b", UserID: ana})
	tickMilk(t, e, service.TickInput{Quantity: 300, ClientUUID: "c", UserID: sam})
	again := tickMilk(t, e, service.TickInput{Quantity: 50, ClientUUID: "b", UserID: ana})
	if again.Created || len(again.AlsoTickedBy) != 1 || len(first.AlsoTickedBy) != 1 || again.AlsoTickedBy[0].Name != "Ana" || again.AlsoTickedBy[0].Quantity != 400 {
		t.Errorf("retry = %+v (first %+v), want the same answer: Ana's 400 only, nothing made after it", again, first)
	}
}

func TestAScanOfTheSameUserEarlierIsAnAdditionByScanMarkedMine(t *testing.T) {
	e := newEnv(t)
	needsMilk(e, 800)
	lot, _, _ := e.stock.AddLot(ctx, service.StockAdd{IngredientID: e.ids[milk], Quantity: 1000, ClientUUID: "scan-1"})
	if _, err := e.svc.AfterLot(ctx, service.AfterLotInput{IngredientID: e.ids[milk], To: rng, LotID: lot, Quantity: 1000, ClientUUID: "scan-1", UserID: ana}); err != nil {
		t.Fatal(err)
	}
	second := tickMilk(t, e, service.TickInput{Quantity: 50, ClientUUID: "b", UserID: ana})
	if len(second.AlsoTickedBy) != 1 || second.AlsoTickedBy[0].By != "scan" || !second.AlsoTickedBy[0].Mine || second.AlsoTickedBy[0].Quantity != 1000 {
		t.Errorf("AlsoTickedBy = %+v, want Ana's own Scan of 1000, by scan, Mine", second.AlsoTickedBy)
	}
}
