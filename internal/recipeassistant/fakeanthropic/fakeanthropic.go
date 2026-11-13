// Package fakeanthropic is a fake Anthropic Messages/Models API for tests, BDD
// and manual browser checks (design §6.1). It records every request, answers
// from markers in the source text (#fake:valid, #fake:refusal, ...) or from a
// queue, and uses the documented response shapes. It never touches the network.
package fakeanthropic

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	_ "image/jpeg" // image sizes
	_ "image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"time"

	"github.com/fabbarix/feeder-ng/docs/spec"
)

// Request is one recorded request.
type Request struct {
	Method string
	Path   string
	Header http.Header
	Body   []byte
	APIKey string // the x-api-key header
}

// JSON decodes the body (nil map when it is not JSON).
func (r Request) JSON() map[string]any {
	var m map[string]any
	_ = json.Unmarshal(r.Body, &m)
	return m
}

// UserTexts returns every text block of every user turn, in order.
func (r Request) UserTexts() []string {
	var out []string
	msgs, _ := r.JSON()["messages"].([]any)
	for _, m := range msgs {
		mm, _ := m.(map[string]any)
		if mm["role"] != "user" {
			continue
		}
		switch c := mm["content"].(type) {
		case string:
			out = append(out, c)
		case []any:
			for _, b := range c {
				bb, _ := b.(map[string]any)
				if bb["type"] == "text" {
					s, _ := bb["text"].(string)
					out = append(out, s)
				}
			}
		}
	}
	return out
}

// ImageInfo describes one image block of the first user turn.
type ImageInfo struct {
	MediaType     string
	Bytes         int
	Width, Height int
	Index         int // position among the content blocks
}

// Images lists the image blocks of the first user turn, in order.
func (r Request) Images() []ImageInfo {
	var out []ImageInfo
	msgs, _ := r.JSON()["messages"].([]any)
	if len(msgs) == 0 {
		return nil
	}
	first, _ := msgs[0].(map[string]any)
	blocks, _ := first["content"].([]any)
	for i, b := range blocks {
		bb, _ := b.(map[string]any)
		if bb["type"] != "image" {
			continue
		}
		src, _ := bb["source"].(map[string]any)
		mt, _ := src["media_type"].(string)
		data, _ := src["data"].(string)
		raw, _ := base64.StdEncoding.DecodeString(data)
		info := ImageInfo{MediaType: mt, Bytes: len(raw), Index: i}
		if cfg, _, err := image.DecodeConfig(bytes.NewReader(raw)); err == nil {
			info.Width, info.Height = cfg.Width, cfg.Height
		}
		out = append(out, info)
	}
	return out
}

// Model is one entry of the fake Models API.
type Model struct {
	ID, DisplayName   string
	StructuredOutputs bool
	ImageInput        bool
	Effort            bool
	Lifecycle         string // "active" (default), "deprecated", "retired"
	RetiresAt         string // RFC 3339, optional
}

// Reply is a queued answer for a Messages call.
type Reply struct {
	Status     int // 0 = 200
	Text       string
	StopReason string // default end_turn
	ErrorType  string // for Status >= 400
	ErrorMsg   string
	RetryAfter string
}

// Server is the fake. Create it with New; Close it when done.
type Server struct {
	*httptest.Server

	mu         sync.Mutex
	reqs       []Request
	queue      []Reply
	models     []Model
	noModels   bool
	acceptKeys map[string]bool
	retryAfter string
	slowFor    time.Duration
	once429    map[string]bool
	// trickleGap is the pause between streamed chunks of #fake:trickle (default 50 ms), trickleChunks how many.
	trickleGap    time.Duration
	trickleChunks int
}

// Option configures New.
type Option func(*Server)

// WithRetryAfter sets the retry-after header (seconds) of #fake:429 answers (default "1").
func WithRetryAfter(seconds string) Option { return func(s *Server) { s.retryAfter = seconds } }

// WithTrickle makes #fake:trickle stream its answer in `chunks` pieces, `gap` apart (a slow but steady model).
func WithTrickle(gap time.Duration, chunks int) Option {
	return func(s *Server) { s.trickleGap, s.trickleChunks = gap, chunks }
}

// WithSlow sets how long #fake:slow waits (default 10 s, or until the client goes away).
func WithSlow(d time.Duration) Option { return func(s *Server) { s.slowFor = d } }

// WithKeys makes the fake accept only these API keys (401 otherwise).
func WithKeys(keys ...string) Option {
	return func(s *Server) {
		s.acceptKeys = map[string]bool{}
		for _, k := range keys {
			s.acceptKeys[k] = true
		}
	}
}

// DefaultModels is what the fake lists unless SetModels is called.
func DefaultModels() []Model {
	return []Model{
		{ID: "claude-haiku-5-5", DisplayName: "Claude Haiku 5.5", StructuredOutputs: true, ImageInput: true, Effort: true},
		{ID: "claude-sonnet-5-5", DisplayName: "Claude Sonnet 5.5", StructuredOutputs: true, ImageInput: true, Effort: true},
		{ID: "claude-opus-5-5", DisplayName: "Claude Opus 5.5", StructuredOutputs: true, ImageInput: true, Effort: true},
		{ID: "claude-opus-4-6", DisplayName: "Claude Opus 4.6", StructuredOutputs: false, ImageInput: true},
		{ID: "claude-text-only", DisplayName: "Text Only", StructuredOutputs: true, ImageInput: false},
	}
}

func build(opts []Option) *Server {
	s := &Server{models: DefaultModels(), retryAfter: "1", slowFor: 10 * time.Second, once429: map[string]bool{},
		trickleGap: 50 * time.Millisecond, trickleChunks: 4}
	for _, o := range opts {
		o(s)
	}
	return s
}

// New starts a fake server on a random loopback port.
func New(opts ...Option) *Server {
	s := build(opts)
	s.Server = httptest.NewServer(http.HandlerFunc(s.serve))
	return s
}

// Handler is the fake as a plain handler (for cmd/fakeanthropic).
func Handler(opts ...Option) http.Handler { return http.HandlerFunc(build(opts).serve) }

// Requests returns a copy of every recorded request.
func (s *Server) Requests() []Request {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Request(nil), s.reqs...)
}

// Messages returns the recorded POST /v1/messages requests.
func (s *Server) Messages() []Request {
	var out []Request
	for _, r := range s.Requests() {
		if r.Method == http.MethodPost && r.Path == "/v1/messages" {
			out = append(out, r)
		}
	}
	return out
}

// Keys returns the distinct x-api-key values seen, in first-seen order.
func (s *Server) Keys() []string {
	var out []string
	seen := map[string]bool{}
	for _, r := range s.Requests() {
		if !seen[r.APIKey] {
			seen[r.APIKey] = true
			out = append(out, r.APIKey)
		}
	}
	return out
}

// Queue adds answers used (in order) by Messages calls that carry no marker.
func (s *Server) Queue(r ...Reply) {
	s.mu.Lock()
	s.queue = append(s.queue, r...)
	s.mu.Unlock()
}

// SetModels replaces the list.
func (s *Server) SetModels(m []Model) { s.mu.Lock(); s.models = m; s.mu.Unlock() }

// NoModelsEndpoint makes GET /v1/models and /v1/models/{id} answer 404 "not found" (a gateway without them).
func (s *Server) NoModelsEndpoint(v bool) { s.mu.Lock(); s.noModels = v; s.mu.Unlock() }

// ValidFile is the text of a valid answer: the spec example without exportedAt.
func ValidFile() string {
	var m map[string]any
	_ = json.Unmarshal(spec.Example, &m)
	delete(m, "exportedAt")
	b, _ := json.Marshal(m)
	return string(b)
}

// BaseRecipesFile (beta.6, BR-C; marker #fake:base-recipes) is a valid answer with two Recipes: Lasagne (plannable) with a
// line "500 ml béchamel" marked `recipe: { name: "Béchamel", cue: "" }`, and Béchamel (baseRecipe, yield 1 l).
func BaseRecipesFile() string {
	return `{"format":"feeder-recipe-file","version":1,
 "ingredients":[
  {"name":"lasagne sheets","baseUnit":"g"},
  {"name":"béchamel","baseUnit":"ml"},
  {"name":"milk","baseUnit":"ml"},
  {"name":"butter","baseUnit":"g"},
  {"name":"flour","baseUnit":"g"}],
 "recipes":[
  {"name":"Lasagne","yield":4,"courses":["Main"],"ingredients":[
    {"ingredient":"lasagne sheets","quantity":250,"unit":"g"},
    {"ingredient":"béchamel","quantity":500,"unit":"ml","recipe":{"name":"Béchamel","cue":""}}]},
  {"name":"Béchamel","baseRecipe":true,"yield":1,"yieldUnit":"l","ingredients":[
    {"ingredient":"milk","quantity":1000,"unit":"ml"},
    {"ingredient":"butter","quantity":40,"unit":"g"},
    {"ingredient":"flour","quantity":40,"unit":"g"}]}]}`
}

// BaseReferenceFile (beta.6, BR-C; marker #fake:base-reference) is a valid answer with one Recipe, Lasagne, whose line
// "500 ml béchamel (see page 42)" is marked `recipe: { name: "Béchamel", cue: "see page 42" }`, and no Béchamel in the file.
func BaseReferenceFile() string {
	return `{"format":"feeder-recipe-file","version":1,
 "ingredients":[
  {"name":"lasagne sheets","baseUnit":"g"},
  {"name":"béchamel","baseUnit":"ml"}],
 "recipes":[
  {"name":"Lasagne","yield":4,"courses":["Main"],"ingredients":[
    {"ingredient":"lasagne sheets","quantity":250,"unit":"g"},
    {"ingredient":"béchamel","quantity":500,"unit":"ml","recipe":{"name":"Béchamel","cue":"see page 42"}}]}]}`
}

// InvalidFile is a well-formed JSON answer that fails the Recipe File schema (yield is a string).
func InvalidFile() string {
	var m map[string]any
	_ = json.Unmarshal(spec.Example, &m)
	delete(m, "exportedAt")
	m["recipes"].([]any)[0].(map[string]any)["yield"] = "four"
	b, _ := json.Marshal(m)
	return string(b)
}

// InjectedFile is a valid answer that tries to override server-controlled fields.
func InjectedFile() string {
	var m map[string]any
	_ = json.Unmarshal(spec.Example, &m)
	m["format"] = "evil"
	m["exportedAt"] = "2000-01-01T00:00:00Z"
	r := m["recipes"].([]any)[0].(map[string]any)
	r["image"] = "https://evil.example/pixel.png"
	r["source"] = map[string]any{"url": "https://evil.example/x", "attribution": "Family recipe"}
	b, _ := json.Marshal(m)
	return string(b)
}

// markerOf is the marker after "#fake:" in text: the leading letters, digits and hyphens, so "#fake:base-recipes</source>"
// is "base-recipes". It is "" when there is none.
func markerOf(text string) string {
	i := strings.Index(text, "#fake:")
	if i < 0 {
		return ""
	}
	rest := text[i+len("#fake:"):]
	end := 0
	for end < len(rest) {
		c := rest[end]
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-') {
			break
		}
		end++
	}
	return rest[:end]
}

func (s *Server) serve(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	req := Request{Method: r.Method, Path: r.URL.Path, Header: r.Header.Clone(), Body: body, APIKey: r.Header.Get("x-api-key")}
	s.mu.Lock()
	s.reqs = append(s.reqs, req)
	keys := s.acceptKeys
	s.mu.Unlock()
	w.Header().Set("request-id", fmt.Sprintf("req_fake%04d", len(s.Requests())))
	if keys != nil && !keys[req.APIKey] {
		writeError(w, 401, "authentication_error", "invalid x-api-key", "")
		return
	}
	switch {
	case r.Method == http.MethodPost && r.URL.Path == "/v1/messages":
		s.messages(w, r, req)
	case r.Method == http.MethodGet && r.URL.Path == "/v1/models":
		s.listModels(w)
	case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/v1/models/"):
		s.getModel(w, strings.TrimPrefix(r.URL.Path, "/v1/models/"))
	default:
		writeError(w, 404, "not_found_error", "Not Found", "")
	}
}

func writeError(w http.ResponseWriter, status int, typ, msg, retryAfter string) {
	if retryAfter != "" {
		w.Header().Set("retry-after", retryAfter)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"type": "error", "error": map[string]any{"type": typ, "message": msg}, "request_id": w.Header().Get("request-id")})
}

func (s *Server) messages(w http.ResponseWriter, r *http.Request, req Request) {
	j := req.JSON()
	model, _ := j["model"].(string)
	first := ""
	if t := req.UserTexts(); len(t) > 0 {
		first = t[0]
	}
	turns := 0
	if msgs, ok := j["messages"].([]any); ok {
		for _, m := range msgs {
			if mm, _ := m.(map[string]any); mm["role"] == "user" {
				turns++
			}
		}
	}
	marker := markerOf(first)
	reply := Reply{Text: ValidFile()}
	switch marker {
	case "valid":
	case "base-recipes":
		reply.Text = BaseRecipesFile()
	case "base-reference":
		reply.Text = BaseReferenceFile()
	case "invalid-then-valid":
		if turns < 2 {
			reply.Text = InvalidFile()
		}
	case "invalid":
		reply.Text = InvalidFile()
	case "no-recipe":
		reply.Text = `{"format":"feeder-recipe-file","version":1,"recipes":[],"noRecipe":true}`
	case "injection":
		reply.Text = InjectedFile()
	case "refusal":
		reply.StopReason, reply.Text = "refusal", ""
	case "max-tokens":
		reply.StopReason, reply.Text = "max_tokens", `{"format":"feeder-recipe-file","ver`
	case "401":
		reply = Reply{Status: 401, ErrorType: "authentication_error", ErrorMsg: "invalid x-api-key"}
	case "403":
		reply = Reply{Status: 403, ErrorType: "permission_error", ErrorMsg: "not allowed to use this model"}
	case "404-model":
		reply = Reply{Status: 404, ErrorType: "not_found_error", ErrorMsg: "model: " + model}
	case "429":
		reply = Reply{Status: 429, ErrorType: "rate_limit_error", ErrorMsg: "rate limited", RetryAfter: s.retryAfter}
	case "429-once":
		s.mu.Lock()
		done := s.once429[model+first]
		s.once429[model+first] = true
		s.mu.Unlock()
		if !done {
			reply = Reply{Status: 429, ErrorType: "rate_limit_error", ErrorMsg: "rate limited", RetryAfter: "1"}
		}
	case "500":
		reply = Reply{Status: 500, ErrorType: "api_error", ErrorMsg: "internal error"}
	case "529":
		reply = Reply{Status: 529, ErrorType: "overloaded_error", ErrorMsg: "overloaded"}
	case "slow":
		select {
		case <-r.Context().Done():
			return
		case <-time.After(s.slowFor):
		}
	case "trickle", "stall":
		// Streaming only: handled by stream below (a non-streaming call just answers).
	default:
		s.mu.Lock()
		if len(s.queue) > 0 {
			reply, s.queue = s.queue[0], s.queue[1:]
		}
		s.mu.Unlock()
	}
	if reply.Status >= 400 {
		writeError(w, reply.Status, reply.ErrorType, reply.ErrorMsg, reply.RetryAfter)
		return
	}
	stop := reply.StopReason
	if stop == "" {
		stop = "end_turn"
	}
	content := []any{}
	if reply.Text != "" {
		content = append(content, map[string]any{"type": "text", "text": reply.Text})
	}
	msg := map[string]any{
		"id": "msg_fake", "type": "message", "role": "assistant", "model": model, "content": content,
		"stop_reason": stop, "stop_sequence": nil, "stop_details": nil,
		"usage": map[string]any{"input_tokens": 1200, "output_tokens": 800, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0},
	}
	if stop == "refusal" {
		msg["stop_details"] = map[string]any{"type": "refusal", "category": "general_harms", "explanation": "declined"}
	}
	if stream, _ := j["stream"].(bool); stream {
		s.stream(w, r, msg, reply.Text, marker)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(msg)
}

// stream answers a "stream": true call as server-sent events in the Messages API's order: message_start,
// content_block_start, content_block_delta (the text in pieces), content_block_stop, message_delta (stop_reason,
// usage), message_stop. #fake:trickle sends the pieces s.trickleGap apart; #fake:stall sends one piece, then nothing
// for s.slowFor (or until the client goes away).
func (s *Server) stream(w http.ResponseWriter, r *http.Request, msg map[string]any, text, marker string) {
	flusher, _ := w.(http.Flusher)
	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)
	send := func(event string, data map[string]any) bool {
		b, _ := json.Marshal(data)
		if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, b); err != nil {
			return false
		}
		if flusher != nil {
			flusher.Flush()
		}
		return r.Context().Err() == nil
	}
	wait := func(d time.Duration) bool {
		select {
		case <-r.Context().Done():
			return false
		case <-time.After(d):
			return true
		}
	}
	start := map[string]any{}
	for k, v := range msg {
		start[k] = v
	}
	start["content"], start["stop_reason"] = []any{}, nil
	start["usage"] = map[string]any{"input_tokens": 1200, "output_tokens": 1}
	if !send("message_start", map[string]any{"type": "message_start", "message": start}) || !send("ping", map[string]any{"type": "ping"}) {
		return
	}
	if text != "" {
		if !send("content_block_start", map[string]any{"type": "content_block_start", "index": 0, "content_block": map[string]any{"type": "text", "text": ""}}) {
			return
		}
		pieces := 4
		gap := time.Duration(0)
		if marker == "trickle" {
			pieces, gap = s.trickleChunks, s.trickleGap
		}
		if pieces < 1 {
			pieces = 1
		}
		size := (len(text) + pieces - 1) / pieces
		for i := 0; i < len(text); i += size {
			end := min(i+size, len(text))
			if !send("content_block_delta", map[string]any{"type": "content_block_delta", "index": 0, "delta": map[string]any{"type": "text_delta", "text": text[i:end]}}) {
				return
			}
			if marker == "stall" {
				wait(s.slowFor)
				return
			}
			if gap > 0 && end < len(text) && !wait(gap) {
				return
			}
		}
		if !send("content_block_stop", map[string]any{"type": "content_block_stop", "index": 0}) {
			return
		}
	}
	usage := msg["usage"].(map[string]any)
	if !send("message_delta", map[string]any{"type": "message_delta", "delta": map[string]any{"stop_reason": msg["stop_reason"], "stop_sequence": nil},
		"usage": map[string]any{"output_tokens": usage["output_tokens"]}}) {
		return
	}
	send("message_stop", map[string]any{"type": "message_stop"})
}

func modelJSON(m Model) map[string]any {
	life := m.Lifecycle
	if life == "" {
		life = "active"
	}
	sup := func(b bool) map[string]any { return map[string]any{"supported": b} }
	var retires any
	if m.RetiresAt != "" {
		retires = m.RetiresAt
	}
	return map[string]any{
		"type": "model", "id": m.ID, "display_name": m.DisplayName, "created_at": "2026-01-01T00:00:00Z",
		"max_input_tokens": 1000000, "max_tokens": 128000, "lifecycle": life, "retires_at": retires,
		"capabilities": map[string]any{"structured_outputs": sup(m.StructuredOutputs), "image_input": sup(m.ImageInput), "effort": sup(m.Effort)},
	}
}

func (s *Server) listModels(w http.ResponseWriter) {
	s.mu.Lock()
	models, no := append([]Model(nil), s.models...), s.noModels
	s.mu.Unlock()
	if no {
		writeError(w, 404, "not_found_error", "Not Found", "")
		return
	}
	data := []any{}
	for _, m := range models {
		if m.Lifecycle != "retired" {
			data = append(data, modelJSON(m))
		}
	}
	out := map[string]any{"data": data, "has_more": false, "first_id": nil, "last_id": nil}
	if len(data) > 0 {
		out["first_id"], out["last_id"] = data[0].(map[string]any)["id"], data[len(data)-1].(map[string]any)["id"]
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func (s *Server) getModel(w http.ResponseWriter, id string) {
	s.mu.Lock()
	models, no := append([]Model(nil), s.models...), s.noModels
	s.mu.Unlock()
	if no {
		writeError(w, 404, "not_found_error", "Not Found", "")
		return
	}
	for _, m := range models {
		if m.ID == id {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(modelJSON(m))
			return
		}
	}
	writeError(w, 404, "not_found_error", "model: "+id, "")
}
