package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/source"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// Retention of finished jobs (design §7): 10 minutes after finishing, at most 3 per User.
const (
	jobTTL      = 10 * time.Minute
	jobsPerUser = 3
	// maxURLChars bounds a page or photo address.
	maxURLChars = 2048
	// effortMedium is sent to models whose capabilities say they support it.
	effortMedium = "medium"
)

// LimitStatus is the caller's remaining reads (omitted for Admins).
type LimitStatus struct{ Remaining, ResetsInSeconds int }

// Status is GET /status.
type Status struct {
	Available bool
	Reason    string // no_secret_key, off, no_key, key_unreadable, model_unavailable
	Model     *ModelRef
	Photos    bool
	Limit     *LimitStatus
}

// ready is what a read needs: the saved settings and the key.
type ready struct {
	settings recipeassistant.Settings
	key      recipeassistant.Secret
	system   string // the read's system prompt (crs-e1)
}

// availability decides whether the assistant can read, with the reason when it cannot (design §7 status).
func (s *Service) availability(ctx context.Context) (r ready, reason string, err error) {
	row, err := s.d.Store.Load(ctx)
	if err != nil {
		return ready{}, "", err
	}
	switch {
	case s.d.Box == nil:
		return ready{}, "no_secret_key", nil
	case !row.Settings.Enabled:
		return ready{}, "off", nil
	case !row.Settings.HasKey:
		return ready{}, "no_key", nil
	}
	key, readable := s.savedKey(row)
	if !readable {
		return ready{}, "key_unreadable", nil
	}
	return ready{settings: row.Settings, key: key}, "", nil
}

// Status reports availability for a signed-in User.
func (s *Service) Status(ctx context.Context, c recipeassistant.Caller) (Status, error) {
	r, reason, err := s.availability(ctx)
	if err != nil {
		return Status{}, err
	}
	st := Status{Reason: reason}
	if reason == "" {
		lctx, cancel := context.WithTimeout(ctx, checkTimeout)
		info, ms := s.modelInfo(lctx, func() Claude { return s.client(r.settings.BaseURL, r.key) }, r.settings.BaseURL, r.settings.Model)
		cancel()
		if ms == modelUnavailable {
			st.Reason = "model_unavailable"
		} else {
			st.Available = true
			st.Model = &ModelRef{ID: r.settings.Model, Name: modelName(r.settings.Model, info.DisplayName)}
			st.Photos = s.d.Photos != nil && (ms != modelFound || info.ImageInput)
		}
	}
	if !c.Admin {
		rem, reset := s.limiter.Remaining(c)
		st.Limit = &LimitStatus{Remaining: rem, ResetsInSeconds: reset}
	}
	return st, nil
}

// Check reports what StartRead would refuse for the caller's limits, holding and counting nothing. The
// handler calls it before reading the request body.
func (s *Service) Check(c recipeassistant.Caller) error { return s.limiter.Check(c) }

// Available reports whether a read can start at all (the handler answers 503 assistant_off before the body).
func (s *Service) Available(ctx context.Context) error {
	_, reason, err := s.availability(ctx)
	if err != nil {
		return err
	}
	if reason != "" {
		return &recipeassistant.Error{Code: CodeAssistantOff}
	}
	return nil
}

// job is one read in flight or finished.
type job struct {
	id      string
	userID  int64
	cancel  context.CancelFunc
	release func() // frees the Limiter slot; idempotent, set once before the job is published

	mu         sync.Mutex
	state      string
	states     []string
	review     *ReviewRef
	source     *SourceInfo
	model      *ModelRef
	err        *recipeassistant.Error
	warnings   []recipeassistant.Warning
	cancelled  bool
	finishedAt time.Time
}

func (j *job) finished() bool {
	return j.state == StateDone || j.state == StateFailed || j.state == StateCancelled
}

func (j *job) set(state string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.state != state {
		j.state = state
		j.states = append(j.states, state)
	}
}

func (j *job) modelRef() *ModelRef {
	j.mu.Lock()
	defer j.mu.Unlock()
	return j.model
}

// dropReview gives back a Review a job still holds (a cancelled or failed read must not expose one).
func (s *Service) dropReview(j *job, sink Sink) {
	j.mu.Lock()
	ref := j.review
	j.review = nil
	j.mu.Unlock()
	if ref != nil {
		sink.CloseReview(j.userID, ref.ID)
	}
}

func (j *job) view() JobView {
	j.mu.Lock()
	defer j.mu.Unlock()
	v := JobView{ID: j.id, State: j.state, States: append([]string(nil), j.states...), Source: j.source,
		Model: j.model, Warnings: append([]recipeassistant.Warning(nil), j.warnings...)}
	if j.state != StateCancelled && j.state != StateFailed {
		v.Review = j.review // never a Review that was closed
	}
	if j.err != nil {
		e := *j.err
		v.Error = &e
	}
	return v
}

func newJobID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand failed: " + err.Error())
	}
	return hex.EncodeToString(b)
}

func invalid(code string) error { return &recipeassistant.Error{Code: code} }

// validate checks the input of a read and returns the cleaned text.
func validate(in ReadInput) (ReadInput, error) {
	switch in.Kind {
	case recipeassistant.KindText:
		text, err := recipeassistant.ValidateText(in.Text)
		if err != nil {
			return in, err
		}
		in.Text = text
	case recipeassistant.KindPage:
		in.URL = strings.TrimSpace(in.URL)
		if !httpsURL(in.URL) {
			return in, invalid(CodeURLInvalid)
		}
	case recipeassistant.KindPhoto:
		if len(in.Photos) == 0 {
			return in, invalid(CodePhotosEmpty)
		}
		if len(in.Photos) > MaxPhotos {
			return in, invalid(CodeTooManyPhotos)
		}
		for _, p := range in.Photos {
			if err := validatePhoto(p); err != nil {
				return in, err
			}
		}
	default:
		return in, invalid(CodeURLInvalid)
	}
	return in, nil
}

// httpsURL accepts an absolute https address with a host and no credentials.
func httpsURL(raw string) bool {
	if raw == "" || len(raw) > maxURLChars {
		return false
	}
	u, err := url.Parse(raw)
	return err == nil && strings.EqualFold(u.Scheme, "https") && u.Hostname() != "" && u.User == nil
}

var photoMediaTypes = map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true}

// validatePhoto does the synchronous checks of design ra-c-service §3: exactly one of data URL or URL, a
// supported declared type, and the 8 MB size cap. Decoding happens later, in the preparing state.
func validatePhoto(p PhotoInput) error {
	if (p.DataURL == "") == (p.URL == "") {
		return invalid(CodePhotoUnsupported)
	}
	if p.URL != "" {
		if !httpsURL(strings.TrimSpace(p.URL)) {
			return invalid(CodeURLInvalid)
		}
		return nil
	}
	const marker = ";base64,"
	i := strings.Index(p.DataURL, marker)
	if !strings.HasPrefix(p.DataURL, "data:") || i < 0 || !photoMediaTypes[strings.ToLower(p.DataURL[len("data:"):i])] {
		return invalid(CodePhotoUnsupported)
	}
	payload := p.DataURL[i+len(marker):]
	size := len(payload) / 4 * 3
	if n := len(payload); n >= 2 && payload[n-1] == '=' {
		size -= 1
		if payload[n-2] == '=' {
			size -= 1
		}
	}
	if size > imaging.MaxBytes {
		return invalid(CodePhotoTooLarge)
	}
	return nil
}

// StartRead validates the input, takes the Limiter slot and starts the job in the background. It returns at
// once with the job's first state. Refusals are *recipeassistant.Error: CodeAssistantOff, source validation
// (text_empty, text_too_long, url_invalid, photos_empty, too_many_photos, photos_not_supported_by_model) and
// the Limiter's read_in_progress / too_many_reads. Nothing is held or counted when it refuses.
func (s *Service) StartRead(c recipeassistant.Caller, in ReadInput, sink Sink) (JobView, error) {
	ctx := context.Background()
	r, reason, err := s.availability(ctx)
	if err != nil {
		return JobView{}, err
	}
	if reason != "" {
		return JobView{}, invalid(CodeAssistantOff)
	}
	if s.promptErr != nil {
		return JobView{}, s.promptErr
	}
	system, err := s.systemPrompt(ctx)
	if err != nil {
		return JobView{}, err
	}
	r.system = system
	in, err = validate(in)
	if err != nil {
		return JobView{}, err
	}
	if in.Kind == recipeassistant.KindPhoto {
		if s.d.Photos == nil {
			return JobView{}, invalid(CodePhotosNotSupport)
		}
		lctx, cancel := context.WithTimeout(ctx, checkTimeout)
		info, ms := s.modelInfo(lctx, func() Claude { return s.client(r.settings.BaseURL, r.key) }, r.settings.BaseURL, r.settings.Model)
		cancel()
		if ms == modelFound && !info.ImageInput {
			return JobView{}, invalid(CodePhotosNotSupport)
		}
	}
	release, err := s.limiter.Acquire(c)
	if err != nil {
		return JobView{}, err
	}

	first := StateReading
	switch in.Kind {
	case recipeassistant.KindPage:
		first = StateFetching
	case recipeassistant.KindPhoto:
		first = StatePreparing
	}
	overall := s.d.Overall
	if overall <= 0 {
		overall = DefaultOverall
	}
	jctx, cancel := context.WithTimeout(ctx, overall)
	var once sync.Once
	releaseOnce := func() { once.Do(release) }
	j := &job{id: newJobID(), userID: c.UserID, cancel: cancel, release: releaseOnce, state: first, states: []string{first}}
	s.mu.Lock()
	s.pruneLocked(c.UserID)
	s.jobs[c.UserID] = append(s.jobs[c.UserID], j)
	s.mu.Unlock()
	view := j.view()
	go func() {
		defer releaseOnce() // safety net; run releases before it publishes the terminal state
		defer cancel()
		s.run(jctx, j, r, in, sink, releaseOnce)
	}()
	return view, nil
}

// pruneLocked drops the User's finished jobs past their retention and keeps the newest jobsPerUser.
func (s *Service) pruneLocked(userID int64) {
	now := s.d.Clock.Now()
	list := s.jobs[userID]
	var finished []*job
	for _, j := range list {
		j.mu.Lock()
		if j.finished() {
			finished = append(finished, j)
		}
		j.mu.Unlock()
	}
	drop := map[*job]bool{}
	kept := 0
	for i := len(finished) - 1; i >= 0; i-- { // newest first
		j := finished[i]
		j.mu.Lock()
		old := now.Sub(j.finishedAt) >= jobTTL
		j.mu.Unlock()
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

// CancelJob cancels a running job of the User (or forgets a finished one). It reports whether the job exists.
func (s *Service) CancelJob(userID int64, id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pruneLocked(userID)
	for i, j := range s.jobs[userID] {
		if j.id != id {
			continue
		}
		j.mu.Lock()
		if j.finished() {
			s.jobs[userID] = append(append([]*job(nil), s.jobs[userID][:i]...), s.jobs[userID][i+1:]...)
		} else {
			j.cancelled = true
		}
		j.mu.Unlock()
		j.cancel()
		j.release() // the slot is free as soon as the cancel is acknowledged; run's own release is then a no-op
		return true
	}
	return false
}

// finish records the end of a job.
func (s *Service) finish(j *job, state string, err *recipeassistant.Error) {
	j.mu.Lock()
	j.state = state
	j.states = append(j.states, state)
	j.err = err
	j.finishedAt = s.d.Clock.Now()
	j.mu.Unlock()
	s.mu.Lock()
	s.pruneLocked(j.userID)
	s.mu.Unlock()
}

// readLog is what one read writes to the log: ids, kind, page host, counts, model, outcome. Never the key, the
// source, the output, photo bytes or a URL path or query.
type readLog struct {
	kind      recipeassistant.SourceKind
	host      string
	photos    int
	model     string
	requestID string
	usage     Usage
	calls     int
	startedAt time.Time
}

// run executes a job and records how it ended. The order matters: the log line is written and the Limiter slot is
// released before the terminal state becomes visible, so a client that sees it can read again at once.
func (s *Service) run(ctx context.Context, j *job, r ready, in ReadInput, sink Sink, release func()) {
	rl := &readLog{kind: in.Kind, model: r.settings.Model, photos: len(in.Photos), startedAt: time.Now()}
	if in.Kind == recipeassistant.KindPage {
		if u, err := url.Parse(in.URL); err == nil {
			rl.host = u.Hostname()
		}
	}
	conclude := func(state string, e *recipeassistant.Error, outcome string) {
		s.logRead(j, rl, outcome)
		release()
		s.finish(j, state, e)
	}
	defer func() {
		if rec := recover(); rec != nil {
			conclude(StateFailed, &recipeassistant.Error{Code: recipeassistant.CodeUnreachable}, recipeassistant.CodeUnreachable)
		}
	}()
	err := s.perform(ctx, j, r, in, sink, rl)
	if s.afterPerform != nil {
		s.afterPerform() // test-only seam, nil in production
	}
	j.mu.Lock()
	cancelled := j.cancelled
	j.mu.Unlock()
	switch {
	case err == nil:
		// perform returned nil: the read is complete and its Review is open, so a cancel that landed after it
		// came too late. The job is done; never cancelled with a Review still open.
		conclude(StateDone, nil, "ok")
	case cancelled:
		s.dropReview(j, sink)
		conclude(StateCancelled, nil, "cancelled")
	default:
		var ae *recipeassistant.Error
		if !errors.As(err, &ae) {
			// A deadline (the 300 s cap) or any other failure of the call chain.
			ae = &recipeassistant.Error{Code: recipeassistant.CodeUnreachable}
		}
		s.dropReview(j, sink)
		if ae.Code == recipeassistant.CodeDeclined {
			// The adapter knows the model by id; the Client shows the display name.
			if m := j.modelRef(); m != nil {
				c := *ae
				c.Model = m.Name
				ae = &c
			}
		}
		conclude(StateFailed, ae, ae.Code)
	}
}

func (s *Service) logRead(j *job, rl *readLog, outcome string) {
	s.d.Logger.Info("recipe assistant read",
		"read", j.id, "user", j.userID, "source", string(rl.kind), "host", rl.host, "photos", rl.photos,
		"model", rl.model, "calls", rl.calls, "request_id", rl.requestID,
		"input_tokens", rl.usage.InputTokens, "output_tokens", rl.usage.OutputTokens,
		"cache_read_tokens", rl.usage.CacheReadTokens, "cache_creation_tokens", rl.usage.CacheCreationTokens,
		"duration_ms", time.Since(rl.startedAt).Milliseconds(), "outcome", outcome)
}

// perform is the pipeline of design §7: [fetch | prepare] -> read -> check (one repair) -> images -> open review.
func (s *Service) perform(ctx context.Context, j *job, r ready, in ReadInput, sink Sink, rl *readLog) error {
	cl := s.client(r.settings.BaseURL, r.key)
	var (
		src        recipeassistant.Source
		finishIn   recipeassistant.FinishInput
		images     []Image
		candidates []recipefile.CandidatePhoto
		info       SourceInfo
	)
	info.Kind = in.Kind
	switch in.Kind {
	case recipeassistant.KindText:
		src = recipeassistant.Source{Kind: recipeassistant.KindText, Text: in.Text}
		finishIn = recipeassistant.FinishInput{Kind: recipeassistant.KindText, SourceImageURLs: recipeassistant.TextImageURLs(in.Text)}
	case recipeassistant.KindPage:
		page, err := s.d.Pages.FetchPage(ctx, in.URL)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return &recipeassistant.Error{Code: CodePageUnavailable, Message: "The page could not be opened."}
		}
		ex := source.Extract(page.Body, page.FinalURL)
		src = recipeassistant.Source{Kind: recipeassistant.KindPage, URL: page.FinalURL, Title: ex.Title, Text: ex.Text, StructuredData: ex.Recipes}
		finishIn = recipeassistant.FinishInput{Kind: recipeassistant.KindPage, PageURL: page.FinalURL, SourceImageURLs: ex.ImageURLs}
		if len(ex.ImageURLs) > 0 {
			finishIn.FallbackImage = ex.ImageURLs[0]
		}
		info.Title, info.URL, info.StructuredData = ex.Title, page.FinalURL, len(ex.Recipes) > 0
	case recipeassistant.KindPhoto:
		prepared, err := s.d.Photos.Prepare(ctx, in.Photos)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			var ae *recipeassistant.Error
			if errors.As(err, &ae) {
				return ae
			}
			return &recipeassistant.Error{Code: CodePhotoUnavailable}
		}
		for _, p := range prepared {
			images = append(images, Image{MediaType: "image/jpeg", Data: p.JPEG})
			cand, err := recipefile.NewCandidate(p.JPEG)
			if err != nil {
				return &recipeassistant.Error{Code: CodePhotoUnsupported}
			}
			candidates = append(candidates, cand)
		}
		src = recipeassistant.Source{Kind: recipeassistant.KindPhoto, PhotoCount: len(prepared)}
		finishIn = recipeassistant.FinishInput{Kind: recipeassistant.KindPhoto}
		info.PhotoCount = len(prepared)
	}
	text, err := recipeassistant.BuildSourceText(src)
	if err != nil {
		return err
	}
	j.set(StateReading)

	ms, _ := s.lookupModel(ctx, cl, r.settings)
	// The model is known before the call, so a failed read carries its display name too.
	model := &ModelRef{ID: r.settings.Model, Name: modelName(r.settings.Model, ms.DisplayName)}
	j.mu.Lock()
	j.model = model
	j.mu.Unlock()
	effort := ""
	if ms.Effort {
		effort = effortMedium
	}
	req := Request{Model: r.settings.Model, System: r.system, Turns: []Turn{{Role: "user", Images: images, Text: text}},
		Schema: s.schema, MaxTokens: 16000, Effort: effort}
	call := func(req Request) (string, error) {
		rl.calls++
		resp, err := cl.Message(ctx, req)
		if resp.RequestID != "" {
			rl.requestID = resp.RequestID
		}
		rl.usage.InputTokens += resp.Usage.InputTokens
		rl.usage.OutputTokens += resp.Usage.OutputTokens
		rl.usage.CacheReadTokens += resp.Usage.CacheReadTokens
		rl.usage.CacheCreationTokens += resp.Usage.CacheCreationTokens
		return resp.Text, err
	}
	answer, err := call(req)
	if err != nil {
		return err
	}
	j.set(StateChecking)
	fin, ferr := recipeassistant.Finish([]byte(answer), finishIn)
	var ae *recipeassistant.Error
	if errors.As(ferr, &ae) && ae.Code == recipeassistant.CodeInvalidOutput {
		paths := ae.Paths
		if len(paths) == 0 {
			paths = []recipefile.PathError{{Path: "$", Message: ae.Message}}
		}
		repair := req
		repair.Turns = append(append([]Turn(nil), req.Turns...),
			Turn{Role: "assistant", Text: answer},
			Turn{Role: "user", Text: recipeassistant.RepairPrompt(paths)})
		answer, err = call(repair)
		if err != nil {
			return err
		}
		fin, ferr = recipeassistant.Finish([]byte(answer), finishIn)
	}
	if ferr != nil {
		return ferr
	}

	j.set(StateImages)
	set := recipefile.ResolveImages(ctx, fin.File, s.d.Images)
	if err := ctx.Err(); err != nil {
		return err
	}
	j.mu.Lock()
	cancelled := j.cancelled
	j.mu.Unlock()
	if cancelled {
		return context.Canceled
	}
	ref, err := sink.OpenReview(ctx, j.userID, fin.File, set, candidates)
	if err != nil {
		return err
	}
	// A cancel or the deadline can land while the Review opens. The check and the assignment share one lock,
	// so a cancel either sees the Review (the run is still the one that closes it) or is seen here: give the
	// Review back instead of leaking it.
	j.mu.Lock()
	cancelled = j.cancelled
	late := cancelled || ctx.Err() != nil
	if !late {
		j.review = &ref
		j.source = &info
		j.warnings = fin.Warnings
	}
	j.mu.Unlock()
	if late {
		sink.CloseReview(j.userID, ref.ID)
		if cancelled {
			return context.Canceled
		}
		return ctx.Err()
	}
	return nil
}

// lookupModel is the cached model lookup of a read (effort support and the display name); failures give an
// empty ModelInfo.
func (s *Service) lookupModel(ctx context.Context, cl Claude, set recipeassistant.Settings) (ModelInfo, modelStatus) {
	return s.modelInfo(ctx, func() Claude { return cl }, set.BaseURL, set.Model)
}
