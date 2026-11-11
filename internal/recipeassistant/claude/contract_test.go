package claude_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/anthropics/anthropic-sdk-go"

	"github.com/fabbarix/feeder-ng/internal/recipeassistant/fakeanthropic"
)

// Contract tests (plan §6.4): testdata/api holds JSON fixtures of the API reference shapes. Each is decoded with
// the SDK's own types, and the fake server's answers must carry every field the fixtures do (so the fake cannot
// drift from what the SDK, and therefore the adapter, reads).

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", "api", name))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestSDKDecodesTheMessageFixtures(t *testing.T) {
	var ok anthropic.Message
	if err := json.Unmarshal(fixture(t, "message_end_turn.json"), &ok); err != nil {
		t.Fatal(err)
	}
	if ok.StopReason != anthropic.StopReasonEndTurn || len(ok.Content) != 1 || ok.Usage.InputTokens != 1200 || ok.Usage.OutputTokens != 800 || ok.Usage.CacheReadInputTokens != 1100 {
		t.Errorf("end_turn = %+v", ok)
	}
	if tb, isText := ok.Content[0].AsAny().(anthropic.TextBlock); !isText || tb.Text == "" {
		t.Errorf("content[0] = %#v", ok.Content[0].AsAny())
	}
	var ref anthropic.Message
	if err := json.Unmarshal(fixture(t, "message_refusal.json"), &ref); err != nil {
		t.Fatal(err)
	}
	if ref.StopReason != anthropic.StopReasonRefusal || ref.StopDetails.Category != "general_harms" || len(ref.Content) != 0 {
		t.Errorf("refusal = %+v", ref)
	}
	var mx anthropic.Message
	if err := json.Unmarshal(fixture(t, "message_max_tokens.json"), &mx); err != nil {
		t.Fatal(err)
	}
	if mx.StopReason != anthropic.StopReasonMaxTokens {
		t.Errorf("max_tokens = %q", mx.StopReason)
	}
}

func TestSDKDecodesTheErrorFixtures(t *testing.T) {
	for name, typ := range map[string]string{
		"error_authentication.json": "authentication_error", "error_rate_limit.json": "rate_limit_error",
		"error_overloaded.json": "overloaded_error", "error_model_not_found.json": "not_found_error",
	} {
		var e anthropic.Error
		if err := json.Unmarshal(fixture(t, name), &e); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if string(e.Type()) != typ {
			t.Errorf("%s: type = %q, want %q", name, e.Type(), typ)
		}
	}
}

func TestSDKDecodesTheModelFixtures(t *testing.T) {
	var m anthropic.ModelInfo
	if err := json.Unmarshal(fixture(t, "model.json"), &m); err != nil {
		t.Fatal(err)
	}
	c := m.Capabilities
	if m.ID != "claude-haiku-5-5" || !c.StructuredOutputs.Supported || !c.ImageInput.Supported || !c.Effort.Supported {
		t.Errorf("model = %+v", m)
	}
	var page struct {
		Data    []anthropic.ModelInfo `json:"data"`
		HasMore bool                  `json:"has_more"`
		LastID  string                `json:"last_id"`
	}
	if err := json.Unmarshal(fixture(t, "models_page.json"), &page); err != nil {
		t.Fatal(err)
	}
	if len(page.Data) != 1 || !page.HasMore || page.LastID == "" || !page.Data[0].Capabilities.StructuredOutputs.Supported {
		t.Errorf("page = %+v", page)
	}
}

// keys returns the key paths of a JSON document, arrays collapsed to their first element.
func keys(prefix string, v any, out map[string]bool) {
	switch x := v.(type) {
	case map[string]any:
		for k, c := range x {
			out[prefix+"."+k] = true
			keys(prefix+"."+k, c, out)
		}
	case []any:
		if len(x) > 0 {
			keys(prefix+"[]", x[0], out)
		}
	}
}

func shape(t *testing.T, b []byte) map[string]bool {
	t.Helper()
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	out := map[string]bool{}
	keys("", v, out)
	return out
}

func TestTheFakeCarriesEveryFieldOfTheFixtures(t *testing.T) {
	f := fakeanthropic.New()
	defer f.Close()
	c := client(f.URL, zero())
	if _, err := c.Message(context.Background(), req(t, "x #fake:valid")); err != nil {
		t.Fatal(err)
	}
	// The fake's own raw answer, fetched with the same request the adapter sent.
	body := f.Messages()[0].Body
	got := rawPost(t, f.URL+"/v1/messages", body)
	want := shape(t, fixture(t, "message_end_turn.json"))
	have := shape(t, got)
	// Fields the reference lists but the fake need not carry: optional nested usage details.
	optional := map[string]bool{".usage.cache_creation": true, ".usage.cache_creation.ephemeral_5m_input_tokens": true,
		".usage.cache_creation.ephemeral_1h_input_tokens": true, ".usage.service_tier": true}
	for k := range want {
		if !have[k] && !optional[k] {
			t.Errorf("the fake's message lacks %s", k)
		}
	}
}

func rawPost(t *testing.T, url string, body []byte) []byte {
	t.Helper()
	r, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	r.Header.Set("x-api-key", key)
	r.Header.Set("anthropic-version", "2023-06-01")
	r.Header.Set("content-type", "application/json")
	resp, err := http.DefaultClient.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return b
}
