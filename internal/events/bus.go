// Package events is the in-process publish/subscribe bus and the SSE endpoint
// that streams it to the SPA.
package events

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	bufferSize = 64
	pingEvery  = 25 * time.Second
)

// Event is one published message.
type Event struct {
	Topic string
	Data  json.RawMessage
}

type subscriber struct {
	topics map[string]struct{} // nil means every topic
	ch     chan Event
}

// Bus fans published events out to subscribers. Publish never blocks.
type Bus struct {
	mu   sync.Mutex
	subs map[*subscriber]struct{}
}

// NewBus returns an empty bus.
func NewBus() *Bus { return &Bus{subs: map[*subscriber]struct{}{}} }

// Publish sends data on topic to every matching subscriber. Data that cannot
// be marshalled is dropped. A subscriber whose buffer is full misses the event.
func (b *Bus) Publish(topic string, data any) {
	raw, err := json.Marshal(data)
	if err != nil {
		return
	}
	ev := Event{Topic: topic, Data: raw}
	b.mu.Lock()
	defer b.mu.Unlock()
	for s := range b.subs {
		if s.topics != nil {
			if _, ok := s.topics[topic]; !ok {
				continue
			}
		}
		select {
		case s.ch <- ev:
		default:
		}
	}
}

// Subscribe returns a channel of events for the given topics (all topics when
// none are given) and a cancel func that closes the channel. Cancel is
// idempotent.
func (b *Bus) Subscribe(topics ...string) (<-chan Event, func()) {
	s := &subscriber{ch: make(chan Event, bufferSize)}
	if len(topics) > 0 {
		s.topics = make(map[string]struct{}, len(topics))
		for _, t := range topics {
			s.topics[t] = struct{}{}
		}
	}
	b.mu.Lock()
	b.subs[s] = struct{}{}
	b.mu.Unlock()

	var once sync.Once
	cancel := func() {
		once.Do(func() {
			b.mu.Lock()
			defer b.mu.Unlock()
			delete(b.subs, s)
			close(s.ch)
		})
	}
	return s.ch, cancel
}

// Handler streams events as Server-Sent Events. The optional ?topics=a,b query
// parameter filters the stream.
func (b *Bus) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		var topics []string
		for _, t := range strings.Split(r.URL.Query().Get("topics"), ",") {
			if t = strings.TrimSpace(t); t != "" {
				topics = append(topics, t)
			}
		}
		ch, cancel := b.Subscribe(topics...)
		defer cancel()

		h := w.Header()
		h.Set("Content-Type", "text/event-stream")
		h.Set("Cache-Control", "no-cache")
		h.Set("X-Accel-Buffering", "no")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, ": connected\n\n")
		flusher.Flush()

		ping := time.NewTicker(pingEvery)
		defer ping.Stop()
		for {
			select {
			case <-r.Context().Done():
				return
			case ev, open := <-ch:
				if !open {
					return
				}
				fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Topic, ev.Data)
				flusher.Flush()
			case <-ping.C:
				fmt.Fprint(w, ": ping\n\n")
				flusher.Flush()
			}
		}
	})
}
