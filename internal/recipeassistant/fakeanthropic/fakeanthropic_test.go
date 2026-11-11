package fakeanthropic_test

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipeassistant/fakeanthropic"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

func post(t *testing.T, base, key, text string) (int, map[string]any, http.Header) {
	t.Helper()
	body := `{"model":"claude-haiku-5-5","max_tokens":10,"messages":[{"role":"user","content":[{"type":"text","text":` + mustJSON(text) + `}]}]}`
	req, _ := http.NewRequest("POST", base+"/v1/messages", strings.NewReader(body))
	req.Header.Set("x-api-key", key)
	req.Header.Set("content-type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var m map[string]any
	_ = json.Unmarshal(raw, &m)
	return resp.StatusCode, m, resp.Header
}

func mustJSON(s string) string { b, _ := json.Marshal(s); return string(b) }

func TestValidAnswerParsesAsARecipeFile(t *testing.T) {
	if _, err := recipefile.Parse([]byte(fakeanthropic.ValidFile())); err != nil {
		t.Fatalf("the fake's valid answer must parse: %v", err)
	}
	if _, err := recipefile.Parse([]byte(fakeanthropic.InvalidFile())); err == nil {
		t.Fatal("the fake's invalid answer must fail Parse")
	}
	if _, err := recipefile.Parse([]byte(fakeanthropic.InjectedFile())); err == nil {
		t.Log("injected file parses (format is overwritten by the server before Parse)")
	}
}

func TestMarkersAndRecording(t *testing.T) {
	s := fakeanthropic.New()
	defer s.Close()
	status, m, _ := post(t, s.URL, "sk-1", "<source>#fake:valid</source>")
	if status != 200 || m["stop_reason"] != "end_turn" {
		t.Fatalf("valid: %d %v", status, m)
	}
	status, m, h := post(t, s.URL, "sk-1", "#fake:429")
	if status != 429 || h.Get("retry-after") != "1" {
		t.Fatalf("429: %d retry-after %q", status, h.Get("retry-after"))
	}
	if status, m, _ = post(t, s.URL, "sk-1", "#fake:refusal"); status != 200 || m["stop_reason"] != "refusal" {
		t.Fatalf("refusal: %d %v", status, m)
	}
	if got := len(s.Messages()); got != 3 {
		t.Fatalf("recorded %d messages, want 3", got)
	}
	if k := s.Keys(); len(k) != 1 || k[0] != "sk-1" {
		t.Fatalf("keys = %v", k)
	}
}

func TestModelsEndpoint(t *testing.T) {
	s := fakeanthropic.New()
	defer s.Close()
	resp, err := http.Get(s.URL + "/v1/models")
	if err != nil {
		t.Fatal(err)
	}
	var v struct{ Data []struct{ ID string } }
	_ = json.NewDecoder(resp.Body).Decode(&v)
	resp.Body.Close()
	if len(v.Data) < 3 || v.Data[0].ID != "claude-haiku-5-5" {
		t.Fatalf("models = %+v", v)
	}
	s.NoModelsEndpoint(true)
	resp, _ = http.Get(s.URL + "/v1/models/claude-haiku-5-5")
	resp.Body.Close()
	if resp.StatusCode != 404 {
		t.Fatalf("no endpoint: %d", resp.StatusCode)
	}
}
