package httpapi_test

import (
	"strings"
	"testing"
)

// crs-e1: the Recipe Assistant sends the Agent Prompt with the Household's Courses in it, built for each read.
func TestARecipeAssistantReadSendsTheHouseholdsCoursesInTheSystemPrompt(t *testing.T) {
	w := raStart(t)
	if v := raText(t, w.user, "Toast #fake:valid"); v.State != "done" {
		t.Fatalf("read: %+v", v)
	}
	first := string(w.fake.Messages()[0].Body)
	for _, want := range []string{"- Main (default)", "- Side", "- Starter", "- Dessert"} {
		if !strings.Contains(first, want) {
			t.Errorf("the system prompt lacks %q", want)
		}
	}
	if strings.Contains(first, "{{COURSES}}") {
		t.Error("the placeholder was sent to the model")
	}

	// A Course added since the last read is in the next one: the prompt is not built once at start-up.
	if _, err := w.env.DB.Exec(`INSERT INTO courses (name, name_key, position, is_main, archived, created_at) VALUES ('Brunch', 'brunch', 4, 0, 0, '2026-11-09T12:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	if v := raText(t, w.admin, "Toast again #fake:valid"); v.State != "done" {
		t.Fatalf("second read: %+v", v)
	}
	ms := w.fake.Messages()
	if len(ms) != 2 || !strings.Contains(string(ms[1].Body), "- Brunch") {
		t.Fatalf("the second read must list Brunch")
	}
}
