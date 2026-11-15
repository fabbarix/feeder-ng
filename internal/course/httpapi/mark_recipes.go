package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/course"
	"github.com/fabbarix/feeder-ng/internal/course/store"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/plan"
	planhttp "github.com/fabbarix/feeder-ng/internal/plan/httpapi"
	planstore "github.com/fabbarix/feeder-ng/internal/plan/store"
)

// Mark Recipes as <Course> from the Plan (B9-32, PC-07) and its Undo (main-session ruling 2).
//
//	POST /api/courses/{id}/recipes        {recipeIds} -> {marked, markedIds, changes, undoToken?}
//	POST /api/courses/{id}/recipes/unmark {recipeIds} -> {unmarked, unmarkedIds, changes, undoToken?}
//
// Each is one transaction with one replan (planhttp.Replanner.Apply). markedIds are only the Recipes this call newly
// marked, so the Plan's Undo unmarks exactly those. Nothing to change answers at once, with no replan and no token.

type recipeIDsIn struct {
	RecipeIDs []int64 `json:"recipeIds"`
}

type markOut struct {
	Marked    int     `json:"marked"`
	MarkedIDs []int64 `json:"markedIds"`
	planhttp.Replan
}

type unmarkOut struct {
	Unmarked    int     `json:"unmarked"`
	UnmarkedIDs []int64 `json:"unmarkedIds"`
	planhttp.Replan
}

// markRecipes is POST /api/courses/{id}/recipes.
func (a *api) markRecipes(w http.ResponseWriter, r *http.Request) {
	ids, out, err := a.recipeMarks(r, false)
	if err != nil {
		a.failMarks(w, r, err)
		return
	}
	if len(ids) == 0 {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"marked": 0, "markedIds": ids, "changes": []any{}})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, markOut{Marked: len(ids), MarkedIDs: ids, Replan: out})
}

// unmarkRecipes is POST /api/courses/{id}/recipes/unmark.
func (a *api) unmarkRecipes(w http.ResponseWriter, r *http.Request) {
	ids, out, err := a.recipeMarks(r, true)
	if err != nil {
		a.failMarks(w, r, err)
		return
	}
	if len(ids) == 0 {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"unmarked": 0, "unmarkedIds": ids, "changes": []any{}})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, unmarkOut{Unmarked: len(ids), UnmarkedIDs: ids, Replan: out})
}

// recipeMarks parses the call, works out which Recipes change (course.Pick) and applies it through the planning
// Replanner. unmark false marks, true unmarks. It returns the ids that changed.
func (a *api) recipeMarks(r *http.Request, unmark bool) ([]int64, planhttp.Replan, error) {
	none := planhttp.Replan{}
	id, ok := idParam(r)
	if !ok {
		return nil, none, course.ErrNotFound
	}
	var in recipeIDsIn
	if err := httpx.DecodeJSON(r, &in); err != nil {
		return nil, none, err
	}
	ids, err := course.RecipeIDs(in.RecipeIDs)
	if err != nil {
		return nil, none, err
	}
	pre, err := a.st.RecipeMarks(r.Context(), id, ids)
	if err != nil {
		return nil, none, err
	}
	if !unmark && pre.Course.Archived {
		return nil, none, course.ErrNotFound
	}
	if len(course.Pick(ids, pre.Has, unmark)) == 0 {
		return []int64{}, none, nil
	}
	p := planhttp.ReplannerFor(a.d.DB)
	if p == nil {
		return nil, none, errors.New("courses: the planning module is not mounted")
	}
	var changed []int64
	out, err := p.Apply(r, plan.ReasonCourseRecipes, func(ctx context.Context, tx *sql.Tx, _ *planstore.Store) error {
		now, err := store.RecipeMarksTx(ctx, tx, id, ids)
		if err != nil {
			return err
		}
		changed = course.Pick(ids, now.Has, unmark)
		if unmark {
			return store.UnmarkRecipesTx(ctx, tx, id, changed)
		}
		return store.MarkRecipesTx(ctx, tx, id, changed)
	})
	if err != nil {
		return nil, none, err
	}
	// The plan event came from Apply; these refresh the Courses (counts) and the Recipes screens.
	a.changed("courses")
	a.recipesChanged("courses")
	return changed, out, nil
}

// failMarks answers a refused Mark or Unmark.
func (a *api) failMarks(w http.ResponseWriter, r *http.Request, err error) {
	var bad *httpx.APIError
	switch {
	case errors.Is(err, course.ErrRecipeIDs):
		writeRefusal(w, http.StatusUnprocessableEntity, refusal{Code: "validation_failed", Field: "recipeIds",
			Message: "Choose one or more Recipes"})
	case errors.As(err, &bad):
		httpx.WriteAPIError(w, err)
	default:
		a.fail(w, r, err, "")
	}
}
