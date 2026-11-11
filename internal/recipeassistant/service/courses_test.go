package service_test

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// crs-e1: the system prompt of a read lists the Household's Courses (docs/dev/design/crs-e1.md).

type stubCourses struct {
	mu    sync.Mutex
	list  []recipefile.PromptCourse
	err   error
	calls int
}

func (s *stubCourses) PromptCourses(context.Context) ([]recipefile.PromptCourse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls++
	return append([]recipefile.PromptCourse(nil), s.list...), s.err
}

func (s *stubCourses) set(l ...recipefile.PromptCourse) { s.mu.Lock(); s.list = l; s.mu.Unlock() }

func TestTheSystemPromptListsTheCoursesAndFollowsTheirChanges(t *testing.T) {
	src := &stubCourses{}
	src.set(recipefile.PromptCourse{Name: "Main", Main: true}, recipefile.PromptCourse{Name: "Side"})
	e := newEnv(t, opts{enabled: true, courses: src})
	e.done(t, user, textIn("Toast #fake:valid"))
	first := e.claude.call(0).System
	if !strings.Contains(first, "- Main (default)\n- Side\n") || strings.Contains(first, "{{COURSES}}") {
		t.Fatalf("the system prompt must list the Courses; got the rules part:\n%s", first[strings.Index(first, "13. Courses:"):strings.Index(first, "14. Whole meal:")])
	}
	if !strings.HasSuffix(first, recipeassistant.Addendum) {
		t.Fatal("the addendum is still appended")
	}

	// A Course renamed between two reads reaches the model: nothing is cached from the first read.
	src.set(recipefile.PromptCourse{Name: "Primo", Main: true}, recipefile.PromptCourse{Name: "Side"}, recipefile.PromptCourse{Name: "Brunch"})
	e.done(t, user, textIn("Toast again #fake:valid"))
	second := e.claude.call(1).System
	if !strings.Contains(second, "- Primo (default)\n- Side\n- Brunch\n") || strings.Contains(second, "- Main (default)") {
		t.Fatalf("the second read must list the new Courses")
	}
}

func TestTheSystemPromptIsByteStableWhileTheCoursesDoNot(t *testing.T) {
	// The system prompt carries the cache breakpoint: same Courses, same bytes.
	src := &stubCourses{}
	src.set(recipefile.PromptCourse{Name: "Main", Main: true})
	e := newEnv(t, opts{enabled: true, courses: src})
	e.done(t, user, textIn("One #fake:valid"))
	e.done(t, user, textIn("Two #fake:valid"))
	if e.claude.call(0).System != e.claude.call(1).System {
		t.Fatal("the system prompt changed between reads although the Courses did not")
	}
}

func TestWithoutACourseSourceThePromptSaysNoCoursesAreDefined(t *testing.T) {
	e := newEnv(t, opts{enabled: true})
	e.done(t, user, textIn("Toast #fake:valid"))
	if s := e.claude.call(0).System; !strings.Contains(s, "(no Courses defined)") || strings.Contains(s, "{{") {
		t.Fatal("a Service with no Course source renders the empty-list line")
	}
}

func TestAFailingCourseSourceRefusesTheReadBeforeAnythingIsSent(t *testing.T) {
	src := &stubCourses{err: errors.New("database is closed")}
	e := newEnv(t, opts{enabled: true, courses: src})
	if _, err := e.svc.StartRead(user, textIn("Toast #fake:valid"), e.sink); err == nil {
		t.Fatal("StartRead must fail when the Courses cannot be read: the model would invent them")
	}
	if e.claude.callCount() != 0 {
		t.Fatal("the model was called")
	}
	if err := e.svc.Check(user); err != nil {
		t.Errorf("a refused start holds no slot: %v", err)
	}
}
