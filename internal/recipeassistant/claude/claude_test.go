package claude_test

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/docs/spec"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/claude"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/fakeanthropic"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
)

const key = "sk-test-ADAPTER-key-9876"

func zero() *int { n := 0; return &n }

func client(url string, retries *int) *claude.Client {
	return claude.New(claude.Options{BaseURL: url, APIKey: recipeassistant.Secret(key), MaxRetries: retries})
}

func schema(t *testing.T) json.RawMessage {
	t.Helper()
	b, err := recipeassistant.OutputSchema(spec.Schema)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func req(t *testing.T, text string) service.Request {
	return service.Request{Model: "claude-haiku-5-5", System: "SYSTEM PROMPT TEXT", MaxTokens: 16000, Schema: schema(t),
		Turns: []service.Turn{{Role: "user", Text: text}}}
}

func codeOf(err error) string { return recipeassistant.CodeOf(err) }

// ---- request shape ---------------------------------------------------------------------------------------------

func TestRequestShape(t *testing.T) {
	f := fakeanthropic.New()
	defer f.Close()
	resp, err := client(f.URL, zero()).Message(context.Background(), req(t, "<source kind=\"text\">toast #fake:valid</source>"))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StopReason != "end_turn" || !strings.Contains(resp.Text, "feeder-recipe-file") || resp.RequestID == "" || resp.Usage.InputTokens == 0 || resp.Usage.OutputTokens == 0 {
		t.Errorf("response = %+v", resp)
	}
	ms := f.Messages()
	if len(ms) != 1 {
		t.Fatalf("requests = %d", len(ms))
	}
	m := ms[0]
	if m.Path != "/v1/messages" || m.APIKey != key || m.Header.Get("anthropic-version") == "" {
		t.Errorf("path/key/version: %s %q %q", m.Path, m.APIKey, m.Header.Get("anthropic-version"))
	}
	if v := m.Header.Get("anthropic-beta"); v != "" {
		t.Errorf("non-beta path only, got anthropic-beta: %q", v)
	}
	if m.Header.Get("Authorization") != "" {
		t.Error("x-api-key only, never Authorization")
	}
	body := m.JSON()
	for _, banned := range []string{"fallbacks", "thinking", "temperature", "top_p", "top_k", "tools", "tool_choice", "stream", "output_format", "betas", "container"} {
		if _, has := body[banned]; has {
			t.Errorf("the request must not contain %q", banned)
		}
	}
	if body["model"] != "claude-haiku-5-5" || body["max_tokens"] != float64(16000) {
		t.Errorf("model/max_tokens = %v/%v", body["model"], body["max_tokens"])
	}
	sys, ok := body["system"].([]any)
	if !ok || len(sys) != 1 {
		t.Fatalf("system must be one text block: %v", body["system"])
	}
	blk := sys[0].(map[string]any)
	cc, _ := blk["cache_control"].(map[string]any)
	if blk["type"] != "text" || blk["text"] != "SYSTEM PROMPT TEXT" || cc["type"] != "ephemeral" {
		t.Errorf("system block = %v", blk)
	}
	oc, _ := body["output_config"].(map[string]any)
	format, _ := oc["format"].(map[string]any)
	if format["type"] != "json_schema" {
		t.Fatalf("output_config.format = %v", oc)
	}
	var got, want bytes.Buffer
	gs, _ := json.Marshal(format["schema"])
	_ = json.Compact(&got, gs)
	_ = json.Compact(&want, schema(t))
	if !jsonEqual(t, got.Bytes(), want.Bytes()) {
		t.Error("output_config.format.schema must equal the projected schema")
	}
	if _, has := oc["effort"]; has {
		t.Error("effort is sent only when the request asks for it")
	}
	msgs := body["messages"].([]any)
	if len(msgs) != 1 || msgs[0].(map[string]any)["role"] != "user" {
		t.Errorf("messages = %v", msgs)
	}
}

func jsonEqual(t *testing.T, a, b []byte) bool {
	t.Helper()
	var x, y any
	if json.Unmarshal(a, &x) != nil || json.Unmarshal(b, &y) != nil {
		return false
	}
	xa, _ := json.Marshal(x)
	ya, _ := json.Marshal(y)
	return bytes.Equal(xa, ya)
}

func TestEffortIsSentOnlyWhenAsked(t *testing.T) {
	f := fakeanthropic.New()
	defer f.Close()
	r := req(t, "x #fake:valid")
	r.Effort = "medium"
	if _, err := client(f.URL, zero()).Message(context.Background(), r); err != nil {
		t.Fatal(err)
	}
	oc := f.Messages()[0].JSON()["output_config"].(map[string]any)
	if oc["effort"] != "medium" {
		t.Errorf("output_config = %v", oc)
	}
}

func TestImagesComeFirstAsBase64AndARepairAppendsTurnsUnchanged(t *testing.T) {
	f := fakeanthropic.New()
	defer f.Close()
	jpg := []byte{0xff, 0xd8, 0xff, 0xd9}
	r := req(t, `<source kind="photo" count="2"></source> #fake:valid`)
	r.Turns[0].Images = []service.Image{{MediaType: "image/jpeg", Data: jpg}, {MediaType: "image/jpeg", Data: jpg}}
	r.Turns = append(r.Turns, service.Turn{Role: "assistant", Text: `{"previous":"answer"}`}, service.Turn{Role: "user", Text: "fix: a, b"})
	if _, err := client(f.URL, zero()).Message(context.Background(), r); err != nil {
		t.Fatal(err)
	}
	msgs := f.Messages()[0].JSON()["messages"].([]any)
	if len(msgs) != 3 {
		t.Fatalf("messages = %d", len(msgs))
	}
	first := msgs[0].(map[string]any)["content"].([]any)
	if len(first) != 3 {
		t.Fatalf("first turn blocks = %d, want 2 images + 1 text", len(first))
	}
	for i := 0; i < 2; i++ {
		b := first[i].(map[string]any)
		src := b["source"].(map[string]any)
		if b["type"] != "image" || src["type"] != "base64" || src["media_type"] != "image/jpeg" || src["data"] != base64.StdEncoding.EncodeToString(jpg) {
			t.Errorf("image block %d = %v", i, b)
		}
	}
	if first[2].(map[string]any)["type"] != "text" {
		t.Errorf("text comes after the images: %v", first[2])
	}
	asst := msgs[1].(map[string]any)
	if asst["role"] != "assistant" || firstText(asst) != `{"previous":"answer"}` {
		t.Errorf("assistant turn = %v", asst)
	}
	if msgs[2].(map[string]any)["role"] != "user" {
		t.Error("repair user turn last")
	}
	if got := f.Messages()[0].Images(); len(got) != 2 || got[0].MediaType != "image/jpeg" {
		t.Errorf("fake sees images: %+v", got)
	}
}

// firstText is the text of the first content block of a message (the wire holds it JSON-escaped inside the body).
func firstText(m map[string]any) string {
	blocks, _ := m["content"].([]any)
	if len(blocks) == 0 {
		return ""
	}
	t, _ := blocks[0].(map[string]any)["text"].(string)
	return t
}

func TestSystemAndSchemaBytesAreStableAcrossCalls(t *testing.T) {
	f := fakeanthropic.New()
	defer f.Close()
	c := client(f.URL, zero())
	for i := 0; i < 2; i++ {
		if _, err := c.Message(context.Background(), req(t, "same #fake:valid")); err != nil {
			t.Fatal(err)
		}
	}
	a, b := f.Messages()[0].JSON(), f.Messages()[1].JSON()
	for _, k := range []string{"system", "output_config", "model", "max_tokens"} {
		x, _ := json.Marshal(a[k])
		y, _ := json.Marshal(b[k])
		if !bytes.Equal(x, y) {
			t.Errorf("%s differs between calls: the cache prefix must be stable", k)
		}
	}
}

// ---- error mapping ---------------------------------------------------------------------------------------------

func TestEveryFailureIsMappedToAFeederCode(t *testing.T) {
	f := fakeanthropic.New(fakeanthropic.WithRetryAfter("42"))
	defer f.Close()
	for marker, want := range map[string]string{
		"401": recipeassistant.CodeBadKey, "403": recipeassistant.CodeForbidden, "404-model": recipeassistant.CodeModelUnavailable,
		"429": recipeassistant.CodeRateLimited, "529": recipeassistant.CodeBusy, "500": recipeassistant.CodeBusy,
		"refusal": recipeassistant.CodeDeclined, "max-tokens": recipeassistant.CodeOutputTooLong,
	} {
		before := len(f.Messages())
		_, err := client(f.URL, zero()).Message(context.Background(), req(t, "x #fake:"+marker))
		if codeOf(err) != want {
			t.Errorf("%s: code = %q (%v), want %s", marker, codeOf(err), err, want)
			continue
		}
		var e *recipeassistant.Error
		errors.As(err, &e)
		switch marker {
		case "429":
			if e.RetryAfterSeconds != 42 {
				t.Errorf("429: RetryAfterSeconds = %d, want 42 (from retry-after)", e.RetryAfterSeconds)
			}
		case "refusal":
			if e.Model != "claude-haiku-5-5" {
				t.Errorf("refusal must name the model, got %q", e.Model)
			}
		}
		if n := len(f.Messages()) - before; n != 1 {
			t.Errorf("%s: %d requests with retries off, want 1 (and a refusal is never re-sent)", marker, n)
		}
	}
}

func TestARefusalIsNotRetriedEvenWithRetriesOn(t *testing.T) {
	f := fakeanthropic.New()
	defer f.Close()
	_, err := client(f.URL, nil).Message(context.Background(), req(t, "x #fake:refusal"))
	if codeOf(err) != recipeassistant.CodeDeclined || len(f.Messages()) != 1 {
		t.Errorf("code %q, requests %d, want declined after exactly one request", codeOf(err), len(f.Messages()))
	}
}

func TestA404ThatIsNotTheModelIsARequestRejected(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler()) // a base URL with the wrong path
	defer srv.Close()
	_, err := client(srv.URL, zero()).Message(context.Background(), req(t, "x"))
	if codeOf(err) != recipeassistant.CodeRequestRejected {
		t.Errorf("code = %q (%v)", codeOf(err), err)
	}
}

func TestTransportFailureIsUnreachable(t *testing.T) {
	f := fakeanthropic.New()
	url := f.URL
	f.Close()
	_, err := client(url, zero()).Message(context.Background(), req(t, "x"))
	if codeOf(err) != recipeassistant.CodeUnreachable {
		t.Errorf("code = %q (%v)", codeOf(err), err)
	}
}

func TestRetriesHonourRetryAfterThenSucceed(t *testing.T) {
	f := fakeanthropic.New()
	defer f.Close()
	start := time.Now()
	resp, err := client(f.URL, nil).Message(context.Background(), req(t, "x #fake:429-once"))
	if err != nil || resp.StopReason != "end_turn" {
		t.Fatalf("resp %+v err %v", resp, err)
	}
	if n := len(f.Messages()); n != 2 {
		t.Errorf("requests = %d, want 2 (one 429 then success)", n)
	}
	if time.Since(start) < 900*time.Millisecond {
		t.Errorf("retry-after: 1 must be honoured, took %v", time.Since(start))
	}
}

func TestServerErrorsAreRetriedThenReportedAsBusy(t *testing.T) {
	f := fakeanthropic.New()
	defer f.Close()
	one := 1
	_, err := client(f.URL, &one).Message(context.Background(), req(t, "x #fake:529"))
	if codeOf(err) != recipeassistant.CodeBusy || len(f.Messages()) != 2 {
		t.Errorf("code %q, requests %d, want busy after 1 retry (2 requests)", codeOf(err), len(f.Messages()))
	}
}

func TestARetryAfterBeyondTheDeadlineStopsAtOnceAsRateLimited(t *testing.T) {
	f := fakeanthropic.New(fakeanthropic.WithRetryAfter("600"))
	defer f.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	start := time.Now()
	_, err := client(f.URL, nil).Message(ctx, req(t, "x #fake:429"))
	var e *recipeassistant.Error
	if !errors.As(err, &e) || e.Code != recipeassistant.CodeRateLimited || e.RetryAfterSeconds != 600 {
		t.Fatalf("err = %v, want rate limited with retryAfterSeconds 600", err)
	}
	if time.Since(start) > 2*time.Second || len(f.Messages()) != 1 {
		t.Errorf("must not wait: took %v with %d requests", time.Since(start), len(f.Messages()))
	}
}

func TestCancellingAbortsTheHTTPCall(t *testing.T) {
	f := fakeanthropic.New(fakeanthropic.WithSlow(30 * time.Second))
	defer f.Close()
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(150 * time.Millisecond); cancel() }()
	start := time.Now()
	_, err := client(f.URL, zero()).Message(ctx, req(t, "x #fake:slow"))
	if !errors.Is(err, context.Canceled) {
		t.Errorf("err = %v, want context.Canceled", err)
	}
	if time.Since(start) > 3*time.Second {
		t.Errorf("took %v", time.Since(start))
	}
	ctx2, cancel2 := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel2()
	_, err = client(f.URL, zero()).Message(ctx2, req(t, "x #fake:slow"))
	if codeOf(err) != recipeassistant.CodeUnreachable {
		t.Errorf("a deadline is assistant_unreachable, got %v", err)
	}
}

// ---- keys, redirects, logs -------------------------------------------------------------------------------------

func TestRedirectsAreRefusedSoTheKeyNeverLeavesTheBaseOrigin(t *testing.T) {
	other := fakeanthropic.New()
	defer other.Close()
	redirector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, other.URL+r.URL.Path, http.StatusTemporaryRedirect)
	}))
	defer redirector.Close()
	_, err := client(redirector.URL, zero()).Message(context.Background(), req(t, "x #fake:valid"))
	if err == nil {
		t.Fatal("a redirected call must fail")
	}
	if len(other.Requests()) != 0 {
		t.Fatalf("the redirect target got %d requests (with the key!)", len(other.Requests()))
	}
	for _, path := range []func() error{
		func() error { _, e := client(redirector.URL, zero()).Models(context.Background()); return e },
		func() error { _, e := client(redirector.URL, zero()).Model(context.Background(), "m"); return e },
	} {
		if path() == nil || len(other.Requests()) != 0 {
			t.Error("Models calls must not follow redirects either")
		}
	}
}

func TestHTTPClientPolicy(t *testing.T) {
	c := claude.NewHTTPClient()
	tr, ok := c.Transport.(*http.Transport)
	if !ok || tr.TLSClientConfig == nil || tr.TLSClientConfig.MinVersion < tls.VersionTLS12 {
		t.Errorf("TLS 1.2+ required: %#v", c.Transport)
	}
	if tr != nil && tr.Proxy == nil {
		t.Error("the environment's proxy must be honoured")
	}
	if c.CheckRedirect == nil {
		t.Fatal("CheckRedirect must refuse redirects")
	}
	if err := c.CheckRedirect(&http.Request{}, []*http.Request{{}}); err == nil {
		t.Error("CheckRedirect must return an error")
	}
}

func TestTheKeyAndTheBodyNeverReachTheLog(t *testing.T) {
	f := fakeanthropic.New()
	defer f.Close()
	var buf bytes.Buffer
	c := claude.New(claude.Options{BaseURL: f.URL, APIKey: recipeassistant.Secret(key), MaxRetries: zero(), Logger: slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug}))})
	_, _ = c.Message(context.Background(), req(t, "UNIQUEBODYTEXT #fake:401"))
	_, _ = c.Message(context.Background(), req(t, "UNIQUEBODYTEXT #fake:valid"))
	out := buf.String()
	for _, banned := range []string{key, "ADAPTER-key", "UNIQUEBODYTEXT", "SYSTEM PROMPT TEXT", "feeder-recipe-file", "invalid x-api-key"} {
		if strings.Contains(out, banned) {
			t.Errorf("log leaks %q:\n%s", banned, out)
		}
	}
	if !strings.Contains(out, "401") || !strings.Contains(out, "req_fake") {
		t.Errorf("log should carry the status and request id:\n%s", out)
	}
}

// ---- models ----------------------------------------------------------------------------------------------------

func TestModelsAndModelFlattenTheCapabilities(t *testing.T) {
	f := fakeanthropic.New()
	defer f.Close()
	f.SetModels([]fakeanthropic.Model{
		{ID: "claude-haiku-5-5", DisplayName: "Claude Haiku 5.5", StructuredOutputs: true, ImageInput: true, Effort: true},
		{ID: "old-one", DisplayName: "Old", Lifecycle: "deprecated", RetiresAt: "2027-03-12T00:00:00Z"},
	})
	c := client(f.URL, zero())
	list, err := c.Models(context.Background())
	if err != nil || len(list) != 2 {
		t.Fatalf("Models = %+v %v", list, err)
	}
	h := list[0]
	if h.ID != "claude-haiku-5-5" || h.DisplayName != "Claude Haiku 5.5" || !h.StructuredOutputs || !h.ImageInput || !h.Effort || h.Lifecycle != "active" {
		t.Errorf("haiku = %+v", h)
	}
	if o := list[1]; o.Lifecycle != "deprecated" || !strings.HasPrefix(o.RetiresAt, "2027-03-12") || o.StructuredOutputs {
		t.Errorf("old = %+v", o)
	}
	one, err := c.Model(context.Background(), "old-one")
	if err != nil || one.ID != "old-one" {
		t.Errorf("Model = %+v %v", one, err)
	}
	if _, err := c.Model(context.Background(), "nope"); codeOf(err) != recipeassistant.CodeModelUnavailable {
		t.Errorf("unknown model: %v", err)
	}
	f.NoModelsEndpoint(true)
	if _, err := c.Models(context.Background()); err == nil {
		t.Error("a gateway without /v1/models is an error the service turns into the catalogue fallback")
	}
	if _, err := c.Model(context.Background(), "claude-haiku-5-5"); codeOf(err) != recipeassistant.CodeRequestRejected {
		t.Errorf("a 404 without a model name is request_rejected (wrong path), got %q", codeOf(err))
	}
}

func TestModelsWithABadKeyIsBadKey(t *testing.T) {
	f := fakeanthropic.New(fakeanthropic.WithKeys("sk-other"))
	defer f.Close()
	if _, err := client(f.URL, zero()).Models(context.Background()); codeOf(err) != recipeassistant.CodeBadKey {
		t.Errorf("err = %v", err)
	}
}

// ---- review send-back: per-attempt timeout, retry-after-ms ---------------------------------------------------------

// A per-attempt timeout is not retried: it would bill a slow model again for the same answer.
func TestAPerAttemptTimeoutIsNotRetried(t *testing.T) {
	f := fakeanthropic.New(fakeanthropic.WithSlow(3 * time.Second))
	defer f.Close()
	c := claude.New(claude.Options{BaseURL: f.URL, APIKey: recipeassistant.Secret(key), RequestTimeout: 200 * time.Millisecond})
	start := time.Now()
	_, err := c.Message(context.Background(), req(t, "x #fake:slow"))
	if codeOf(err) != recipeassistant.CodeUnreachable {
		t.Errorf("code = %q (%v), want unreachable", codeOf(err), err)
	}
	if n := len(f.Messages()); n != 1 {
		t.Errorf("requests = %d, want exactly 1 (a timed-out attempt is not retried)", n)
	}
	if time.Since(start) > 2*time.Second {
		t.Errorf("took %v", time.Since(start))
	}
}

// retry-after-ms (milliseconds) is honoured like retry-after: one that does not fit the deadline stops at once.
func TestRetryAfterMsBeyondTheDeadlineStopsAtOnce(t *testing.T) {
	var n int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n++
		w.Header().Set("retry-after-ms", "1500")
		w.Header().Set("content-type", "application/json")
		w.WriteHeader(429)
		_, _ = w.Write([]byte(`{"type":"error","error":{"type":"rate_limit_error","message":"slow down"}}`))
	}))
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, err := client(srv.URL, nil).Message(ctx, req(t, "x"))
	var e *recipeassistant.Error
	if !errors.As(err, &e) || e.Code != recipeassistant.CodeRateLimited || e.RetryAfterSeconds != 2 {
		t.Fatalf("err = %v, want rate limited with retryAfterSeconds 2 (1500 ms rounded up)", err)
	}
	if n != 1 {
		t.Errorf("requests = %d, want 1: 1.5 s does not fit a 1 s budget", n)
	}
}
