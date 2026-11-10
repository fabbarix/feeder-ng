package push_test

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/notify"
	"github.com/fabbarix/feeder-ng/internal/notify/push"
)

func newSender(t *testing.T) *push.Sender {
	t.Helper()
	v, err := push.LoadOrCreateVAPID(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	// An explicit plain client: these tests talk to httptest servers on loopback,
	// which the production client refuses (see ssrf_test.go).
	return &push.Sender{VAPID: v, Subject: "mailto:admin@example.test", Client: &http.Client{}}
}

func target(t *testing.T, url string) notify.Target {
	p, a := keyPair(t)
	return notify.Target{ID: 1, Endpoint: url, P256dh: p, Auth: a}
}

func TestSenderPostsAnEncryptedSignedMessage(t *testing.T) {
	var gotAuth, gotEnc, gotTTL string
	var body []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth, gotEnc, gotTTL = r.Header.Get("Authorization"), r.Header.Get("Content-Encoding"), r.Header.Get("TTL")
		body, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()
	err := newSender(t).Send(context.Background(), target(t, srv.URL), notify.Payload{Type: notify.AdvanceStep, Title: "Advance Step", Body: "Marinate the chicken now for 19:30", Tag: "k"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(gotAuth, "vapid ") {
		t.Errorf("Authorization = %q, want a vapid header", gotAuth)
	}
	if gotEnc != "aes128gcm" {
		t.Errorf("Content-Encoding = %q", gotEnc)
	}
	if gotTTL == "" || gotTTL == "0" {
		t.Errorf("TTL = %q, want a positive value", gotTTL)
	}
	if len(body) == 0 || strings.Contains(string(body), "Marinate") {
		t.Errorf("body must be encrypted, got %d bytes", len(body))
	}
}

func TestSenderMapsGoneToErrGone(t *testing.T) {
	for _, status := range []int{http.StatusNotFound, http.StatusGone} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(status) }))
		err := newSender(t).Send(context.Background(), target(t, srv.URL), notify.Payload{Title: "x"})
		srv.Close()
		if !errors.Is(err, notify.ErrGone) {
			t.Errorf("status %d: err = %v, want ErrGone", status, err)
		}
	}
}

func TestSenderReportsOtherFailuresAsPlainErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusInternalServerError) }))
	defer srv.Close()
	err := newSender(t).Send(context.Background(), target(t, srv.URL), notify.Payload{Title: "x"})
	if err == nil || errors.Is(err, notify.ErrGone) {
		t.Errorf("err = %v, want a non-Gone error", err)
	}
}
