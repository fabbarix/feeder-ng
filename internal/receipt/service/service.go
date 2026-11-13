// Package service runs receipt reads (docs/design/receipt-reading.md §4, §7.1, §9; ADR 0018): the checks before a read,
// the one Messages call through the Recipe Assistant's client, the checked answer and the proposals, and the jobs the
// phone polls. It holds the read's photos in memory only: they are never written to disk and never logged, and a job
// keeps only its answer. The HTTP layer (internal/receipt/httpapi) is thin and calls it.
package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/receipt"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	rasvc "github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
)

// DefaultOverall caps one whole read: the photos and the one model call (design §9).
const DefaultOverall = 120 * time.Second

// Job retention (design §7.1): kept 10 minutes after they finish, at most 3 per User.
const (
	jobTTL      = 10 * time.Minute
	jobsPerUser = 3
	// effortLow is sent to models that take an effort setting (design §9).
	effortLow = "low"
	// maxTokens bounds the answer: about 200 lines of about 40 tokens each (design §9).
	maxTokens = 8000
)

// Codes of errors this package makes itself. The provider's and the photos' codes are the Recipe Assistant's.
const (
	CodeScansEmpty = "scans_empty"
	CodeCancelled  = "cancelled"
)

// Status is the state of a read job.
type Status string

// Job states.
const (
	StatusRunning Status = "running"
	StatusDone    Status = "done"
	StatusFailed  Status = "failed"
)

// Unavailable says why the Recipe Assistant cannot read (off, no_key, no_secret_key, key_unreadable, model_unavailable).
type Unavailable struct{ Reason string }

func (u *Unavailable) Error() string { return "assistant_unavailable: " + u.Reason }

// Ready is what one read needs from the assistant: the model, its client, and what the model can do.
type Ready struct {
	Model    string
	Claude   rasvc.Claude
	ImagesOK bool
	Effort   bool
}

// Assistant is the Recipe Assistant as a read sees it: availability and the client (FromRecipeAssistant), and the
// Limiter the receipt reads share with the recipe reads.
type Assistant interface {
	Ready(ctx context.Context) (Ready, error) // *Unavailable when the assistant cannot read
	Check(c recipeassistant.Caller) error
	Acquire(c recipeassistant.Caller) (func(), error)
}

// Events loads the Scanned list of a read: the applied, not undone shop_scan and shop_unknown events among the phone's
// client UUIDs, in ledger order, each with its household Date. Unknown uuids are left out. The port is the scan
// service's loader (scanhttpapi.ReceiptApplier), the one the apply recomputes the fingerprint with.
type Events interface {
	SessionEvents(ctx context.Context, shopID int64, uuids []string) ([]receipt.ScanEvent, error)
}

// Contexts loads what a read of a Shop is matched against: today, the Shop and date of the session, the saved Shops
// and the currency (SQLContexts is the SQL adapter).
type Contexts interface {
	Context(ctx context.Context, shopID int64) (receipt.Context, error)
}

// Deps are the ports. Zero Overall means DefaultOverall; a nil Logger means slog.Default().
type Deps struct {
	Assistant Assistant
	Events    Events
	Contexts  Contexts
	Photos    rasvc.Photos
	Clock     clock.Clock
	Logger    *slog.Logger
	Overall   time.Duration
}

// ReadInput is one read request: the Shop, the phone's client UUIDs of the session, and 1 to 4 photos (data URLs).
type ReadInput struct {
	ShopID      int64
	ClientUUIDs []string
	Photos      []rasvc.PhotoInput
}

// JobView is a snapshot of a read job. ShopID, Fingerprint, Rows, Ctx, Result and Warnings are set when the job is
// done (the apply needs the Shop, fingerprint, rows, context and proposals the User reviewed); Error when it failed.
// A view prints and logs as a summary only.
type JobView struct {
	ID          string
	Status      Status
	ShopID      int64
	Fingerprint string
	Rows        []receipt.Row
	Ctx         receipt.Context
	Result      receipt.Result
	Warnings    []receipt.Warning
	Error       *recipeassistant.Error
}

// Format prints the summary, whatever the verb (no rows, lines, prices or answers).
func (v JobView) Format(f fmt.State, _ rune) {
	fmt.Fprintf(f, "receipt.JobView{status=%s, rows=%d, proposals=%d}", v.Status, len(v.Rows), len(v.Result.Proposals))
}

// LogValue logs the summary only.
func (v JobView) LogValue() slog.Value {
	return slog.GroupValue(slog.String("status", string(v.Status)), slog.Int("rows", len(v.Rows)),
		slog.Int("proposals", len(v.Result.Proposals)))
}

// Service runs receipt reads. It is safe for concurrent use.
type Service struct {
	d    Deps
	mu   sync.Mutex
	jobs map[int64][]*job // by User, oldest first
}

// New returns a Service.
func New(d Deps) *Service {
	if d.Clock == nil {
		d.Clock = clock.System{}
	}
	if d.Logger == nil {
		d.Logger = slog.Default()
	}
	return &Service{d: d, jobs: map[int64][]*job{}}
}

// Check reports what a read would refuse for the caller's limits (the Limiter's Check), holding and counting nothing.
// The HTTP layer calls it before the body is read.
func (s *Service) Check(c recipeassistant.Caller) error { return s.d.Assistant.Check(c) }

// Available reports whether a read can start at all: *Unavailable with the reason when it cannot.
func (s *Service) Available(ctx context.Context) error {
	_, err := s.d.Assistant.Ready(ctx)
	return err
}

// Start checks the read in order (availability, the model's images, the photo limits, the session, the Limiter),
// then starts the job in the background and returns it running. A refusal holds nothing and sends nothing.
func (s *Service) Start(c recipeassistant.Caller, in ReadInput) (JobView, error) {
	ctx := context.Background()
	ready, err := s.d.Assistant.Ready(ctx)
	if err != nil {
		return JobView{}, err
	}
	if !ready.ImagesOK {
		return JobView{}, &recipeassistant.Error{Code: rasvc.CodePhotosNotSupport}
	}
	if err := checkPhotos(in.Photos); err != nil {
		return JobView{}, err
	}
	sctx, err := s.d.Contexts.Context(ctx, in.ShopID)
	if err != nil {
		return JobView{}, err
	}
	all, err := s.d.Events.SessionEvents(ctx, in.ShopID, in.ClientUUIDs)
	if err != nil {
		return JobView{}, err
	}
	events := sessionEvents(all, in.ShopID, sctx.Today)
	if len(events) == 0 {
		return JobView{}, &recipeassistant.Error{Code: CodeScansEmpty}
	}
	release, err := s.d.Assistant.Acquire(c)
	if err != nil {
		return JobView{}, err
	}
	var once sync.Once
	releaseOnce := func() { once.Do(release) }

	overall := s.d.Overall
	if overall <= 0 {
		overall = DefaultOverall
	}
	jctx, cancel := context.WithTimeout(ctx, overall)
	j := &job{id: newJobID(), userID: c.UserID, cancel: cancel, release: releaseOnce, status: StatusRunning}
	s.mu.Lock()
	s.pruneLocked(c.UserID)
	s.jobs[c.UserID] = append(s.jobs[c.UserID], j)
	s.mu.Unlock()

	// The plan is shared by pointer, so the photos have one holder that perform clears once they are prepared.
	p := &readPlan{ready: ready, shopID: in.ShopID, rows: receipt.GroupRows(events), fingerprint: receipt.Fingerprint(events),
		ctx: sctx, photos: in.Photos}
	view := j.view()
	go func() {
		defer releaseOnce() // a safety net: run releases before it publishes the terminal state
		defer cancel()
		s.run(jctx, j, p)
	}()
	return view, nil
}

// Job returns the job if it belongs to the User.
func (s *Service) Job(userID int64, id string) (JobView, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneLocked(userID)
	for _, j := range s.jobs[userID] {
		if j.id == id {
			return j.view(), true
		}
	}
	return JobView{}, false
}

// Errors of DoneRead.
var (
	// ErrReadGone is a read that is unknown, no longer kept (10 minutes, 3 per User) or another User's.
	ErrReadGone = errors.New("receipt read: gone")
	// ErrReadNotDone is a read that is still running, or that failed.
	ErrReadNotDone = errors.New("receipt read: not done")
)

// DoneRead is the User's done read, as the apply needs it (design §7.2 step 1): *Unavailable when the assistant cannot
// read (the apply sits behind the same availability check as the reads), ErrReadGone for an unknown, expired or
// another User's read, ErrReadNotDone while it runs or after it failed.
func (s *Service) DoneRead(ctx context.Context, userID int64, id string) (JobView, error) {
	if err := s.Available(ctx); err != nil {
		return JobView{}, err
	}
	v, ok := s.Job(userID, id)
	if !ok {
		return JobView{}, ErrReadGone
	}
	if v.Status != StatusDone {
		return JobView{}, ErrReadNotDone
	}
	return v, nil
}

// Cancel stops a running job of the User (its model call is cancelled and it fails as cancelled), or forgets a
// finished one. It reports whether the User has such a job.
func (s *Service) Cancel(userID int64, id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneLocked(userID)
	list := s.jobs[userID]
	for i, j := range list {
		if j.id != id {
			continue
		}
		j.mu.Lock()
		running := j.status == StatusRunning
		if running {
			j.cancelled = true
		}
		j.mu.Unlock()
		if !running {
			s.jobs[userID] = append(append([]*job(nil), list[:i]...), list[i+1:]...)
			return true
		}
		j.cancel()
		j.release() // the slot is free as soon as the cancel is acknowledged; run's own release is then a no-op
		return true
	}
	return false
}

// readPlan is what a job needs: the assistant, the Shop, the rows and fingerprint of the Scanned list, its Context,
// and the photos (dropped once they are prepared).
type readPlan struct {
	ready       Ready
	shopID      int64
	rows        []receipt.Row
	fingerprint string
	ctx         receipt.Context
	photos      []rasvc.PhotoInput
}

// job is one read, running or finished.
type job struct {
	id      string
	userID  int64
	cancel  context.CancelFunc
	release func() // frees the Limiter slot; idempotent

	mu          sync.Mutex
	status      Status
	shopID      int64
	fingerprint string
	rows        []receipt.Row
	ctx         receipt.Context
	result      receipt.Result
	warnings    []receipt.Warning
	err         *recipeassistant.Error
	cancelled   bool
	finishedAt  time.Time
}

func (j *job) finished() bool { return j.status != StatusRunning }

func (j *job) view() JobView {
	j.mu.Lock()
	defer j.mu.Unlock()
	v := JobView{ID: j.id, Status: j.status}
	if j.status == StatusDone {
		v.ShopID, v.Fingerprint, v.Rows, v.Ctx, v.Result = j.shopID, j.fingerprint, j.rows, j.ctx, j.result
		v.Warnings = j.warnings
	}
	if j.err != nil {
		e := *j.err
		v.Error = &e
	}
	return v
}

// pruneLocked drops the User's finished jobs past their retention and keeps the newest jobsPerUser. The caller holds
// s.mu.
func (s *Service) pruneLocked(userID int64) {
	now := s.d.Clock.Now()
	list := s.jobs[userID]
	drop := map[*job]bool{}
	kept := 0
	for i := len(list) - 1; i >= 0; i-- { // newest first
		j := list[i]
		j.mu.Lock()
		finished := j.finished()
		old := finished && now.Sub(j.finishedAt) >= jobTTL
		j.mu.Unlock()
		if !finished {
			continue
		}
		if old || kept >= jobsPerUser {
			drop[j] = true
			continue
		}
		kept++
	}
	var out []*job
	for _, j := range list {
		if !drop[j] {
			out = append(out, j)
		}
	}
	if len(out) == 0 {
		delete(s.jobs, userID)
	} else {
		s.jobs[userID] = out
	}
}

// finish records how a job ended. The Limiter slot is freed by the caller before this, so a client that sees the
// terminal state can read again at once.
func (s *Service) finish(j *job, p *readPlan, res receipt.Result, warns []receipt.Warning, ae *recipeassistant.Error) {
	j.mu.Lock()
	if ae != nil {
		j.status, j.err = StatusFailed, ae
	} else {
		j.status = StatusDone
		j.shopID, j.fingerprint, j.rows, j.ctx = p.shopID, p.fingerprint, p.rows, p.ctx
		j.result, j.warnings = res, warns
	}
	j.finishedAt = s.d.Clock.Now()
	j.mu.Unlock()
	s.mu.Lock()
	s.pruneLocked(j.userID)
	s.mu.Unlock()
}

// readLog is what one read writes to the log: ids, counts, the model, the provider's request id, token counts, timing
// and the outcome. Never a row, a line, a price, a photo, the key or the answer.
type readLog struct {
	photos    int
	model     string
	requestID string
	usage     rasvc.Usage
	startedAt time.Time
}

// run performs one read and records how it ended.
func (s *Service) run(ctx context.Context, j *job, p *readPlan) {
	meta := &readLog{photos: len(p.photos), model: p.ready.Model, startedAt: time.Now()}
	conclude := func(res receipt.Result, warns []receipt.Warning, ae *recipeassistant.Error) {
		outcome := "done"
		if ae != nil {
			outcome = ae.Code
		}
		s.logRead(j, p, meta, outcome)
		j.release()
		s.finish(j, p, res, warns, ae)
	}
	defer func() {
		if rec := recover(); rec != nil {
			conclude(receipt.Result{}, nil, &recipeassistant.Error{Code: recipeassistant.CodeUnreachable})
		}
	}()
	res, warns, err := s.perform(ctx, p, meta)
	j.mu.Lock()
	cancelled := j.cancelled
	j.mu.Unlock()
	switch {
	case cancelled:
		conclude(receipt.Result{}, nil, &recipeassistant.Error{Code: CodeCancelled})
	case err != nil:
		conclude(receipt.Result{}, nil, apiError(err))
	default:
		conclude(res, warns, nil)
	}
}

// apiError is the read error of any failure: the Recipe Assistant's own error when it made one (a provider code, a
// photo code, an answer that cannot be used), else assistant_unreachable (a timeout, a connection, anything else).
// The message of other errors is never kept: it may carry the provider's text.
func apiError(err error) *recipeassistant.Error {
	var ae *recipeassistant.Error
	if errors.As(err, &ae) {
		return ae
	}
	return &recipeassistant.Error{Code: recipeassistant.CodeUnreachable}
}

// perform is the read: the photos are prepared, one Messages call is made, and the answer is checked and turned into
// proposals. It returns the result, or the error the job fails with.
func (s *Service) perform(ctx context.Context, p *readPlan, meta *readLog) (receipt.Result, []receipt.Warning, error) {
	prepared, err := s.prepare(ctx, p.photos)
	if err != nil {
		return receipt.Result{}, nil, err
	}
	p.photos = nil // the photos live in the request now, and go once the call ends
	images := make([]rasvc.Image, len(prepared))
	for i, ph := range prepared {
		images[i] = rasvc.Image{MediaType: "image/jpeg", Data: ph.JPEG}
	}
	text, err := receipt.BuildRequestText(receipt.RequestInput{Shop: p.ctx.SessionShop.Name, Date: p.ctx.SessionDate,
		Currency: p.ctx.Currency, MinorDigits: p.ctx.MinorDigits, Rows: p.rows, PhotoCount: len(prepared)})
	if err != nil {
		return receipt.Result{}, nil, err
	}
	req := rasvc.Request{Model: p.ready.Model, System: receipt.SystemPrompt(),
		Turns: []rasvc.Turn{{Role: "user", Images: images, Text: text}}, Schema: json.RawMessage(receipt.OutputSchema()),
		MaxTokens: maxTokens}
	if p.ready.Effort {
		req.Effort = effortLow
	}
	resp, err := p.ready.Claude.Message(ctx, req)
	meta.absorb(resp)
	if err != nil {
		return receipt.Result{}, nil, err
	}
	ans, warns, err := receipt.Finish([]byte(resp.Text), p.rows, p.ctx.Today)
	if err != nil {
		return receipt.Result{}, nil, err
	}
	return receipt.Propose(p.rows, ans, p.ctx), warns, nil
}

// prepare turns the photos into JPEGs with the Recipe Assistant's preparer.
func (s *Service) prepare(ctx context.Context, in []rasvc.PhotoInput) ([]rasvc.PreparedPhoto, error) {
	if s.d.Photos == nil {
		return nil, &recipeassistant.Error{Code: rasvc.CodePhotoUnavailable}
	}
	prepared, err := s.d.Photos.Prepare(ctx, in)
	if err != nil {
		var ae *recipeassistant.Error
		if errors.As(err, &ae) {
			return nil, ae
		}
		return nil, &recipeassistant.Error{Code: rasvc.CodePhotoUnavailable}
	}
	return prepared, nil
}

// absorb keeps the request id and the token counts of one call.
func (m *readLog) absorb(resp rasvc.Response) {
	if resp.RequestID != "" {
		m.requestID = resp.RequestID
	}
	m.usage.InputTokens += resp.Usage.InputTokens
	m.usage.OutputTokens += resp.Usage.OutputTokens
	m.usage.CacheReadTokens += resp.Usage.CacheReadTokens
	m.usage.CacheCreationTokens += resp.Usage.CacheCreationTokens
}

func (s *Service) logRead(j *job, p *readPlan, m *readLog, outcome string) {
	s.d.Logger.Info("receipt read",
		"read", j.id, "user", j.userID, "rows", len(p.rows), "photos", m.photos, "model", m.model,
		"request_id", m.requestID, "input_tokens", m.usage.InputTokens, "output_tokens", m.usage.OutputTokens,
		"cache_read_tokens", m.usage.CacheReadTokens, "cache_creation_tokens", m.usage.CacheCreationTokens,
		"duration_ms", time.Since(m.startedAt).Milliseconds(), "outcome", outcome)
}

// checkPhotos is the synchronous check of the photos: 1 to 4, each a supported data URL within the size cap.
func checkPhotos(ps []rasvc.PhotoInput) error {
	switch {
	case len(ps) == 0:
		return &recipeassistant.Error{Code: rasvc.CodePhotosEmpty}
	case len(ps) > rasvc.MaxPhotos:
		return &recipeassistant.Error{Code: rasvc.CodeTooManyPhotos}
	}
	for _, p := range ps {
		if err := rasvc.CheckDataPhoto(p); err != nil {
			return err
		}
	}
	return nil
}

// sessionEvents keeps the events of this Shop made today: the Scanned list a read is of (Q5).
func sessionEvents(all []receipt.ScanEvent, shopID int64, today string) []receipt.ScanEvent {
	var out []receipt.ScanEvent
	for _, e := range all {
		if e.ShopID == shopID && e.Date == today {
			out = append(out, e)
		}
	}
	return out
}

// newJobID returns a random id for a job.
func newJobID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand failed: " + err.Error())
	}
	return hex.EncodeToString(b)
}
