package service

import (
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"

	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
)

// Cache lifetimes (design §2.1): the model list for an hour, a lookup that failed for a minute.
const (
	modelsTTL       = time.Hour
	lookupFailedTTL = time.Minute
)

type modelStatus int

const (
	modelUnknown modelStatus = iota // the lookup failed or the gateway cannot say
	modelFound
	modelUnavailable // 404 for the model, or retired
)

type modelEntry struct {
	info    ModelInfo
	status  modelStatus
	expires time.Time
}

type listEntry struct {
	list    []ModelInfo
	expires time.Time
}

// caches holds, in memory only, the models list per (base URL, key fingerprint) and the lookup of single models
// per (base URL, model). Neither holds a key.
type caches struct {
	mu     sync.Mutex
	models map[string]modelEntry
	lists  map[string]listEntry
}

func newCaches() caches {
	return caches{models: map[string]modelEntry{}, lists: map[string]listEntry{}}
}

func (c *caches) forgetModels() {
	c.mu.Lock()
	c.models = map[string]modelEntry{}
	c.lists = map[string]listEntry{}
	c.mu.Unlock()
}

func (c *caches) getModel(base, model string, now time.Time) (modelEntry, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.models[base+"\x00"+model]
	if !ok || !now.Before(e.expires) {
		return modelEntry{}, false
	}
	return e, true
}

func (c *caches) putModel(base, model string, info ModelInfo, now time.Time) {
	c.setModel(base, model, modelEntry{info: info, status: modelFound, expires: now.Add(modelsTTL)})
}

func (c *caches) setModel(base, model string, e modelEntry) {
	c.mu.Lock()
	c.models[base+"\x00"+model] = e
	c.mu.Unlock()
}

// fingerprint is the first 8 bytes of SHA-256 of the key in hex; it only keys the cache and is never stored.
func fingerprint(k recipeassistant.Secret) string {
	h := sha256.Sum256([]byte(k.Reveal()))
	return hex.EncodeToString(h[:8])
}

func (c *caches) getList(base string, key recipeassistant.Secret, now time.Time) ([]ModelInfo, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.lists[base+"\x00"+fingerprint(key)]
	if !ok || !now.Before(e.expires) {
		return nil, false
	}
	return e.list, true
}

func (c *caches) putList(base string, key recipeassistant.Secret, list []ModelInfo, now time.Time) {
	c.mu.Lock()
	c.lists[base+"\x00"+fingerprint(key)] = listEntry{list: list, expires: now.Add(modelsTTL)}
	c.mu.Unlock()
}
