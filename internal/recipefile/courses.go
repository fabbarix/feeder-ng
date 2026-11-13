package recipefile

import (
	"fmt"
	"sort"

	"github.com/fabbarix/feeder-ng/internal/course"
	"github.com/fabbarix/feeder-ng/internal/recipe"
)

// Course planning of Import Review (docs/dev/design/crs-e1.md, 3.1 to 3.5). It runs only when the caller knows the
// Household's Courses; without them the file decides and nothing is added.

// courseState is what the Courses of the kept Recipes come to.
type courseState struct {
	known      bool
	rows       []CourseMatch
	matched    []*CourseRef    // by row: the Course the key matched, active or archived
	recipeIDs  map[int][]int64 // kept Recipe index -> existing Course ids in household order (main when none)
	recipeNew  map[int][]string
	recipeWhol map[int]bool
	newCourses []NewCourse
	unarchive  []int64
}

// buildCourses matches the file's Course names against the Household's Courses and resolves the answers.
func (r *review) buildCourses() {
	if len(r.ex.Courses) == 0 {
		return
	}
	st := &courseState{known: true, recipeIDs: map[int][]int64{}, recipeNew: map[int][]string{}, recipeWhol: map[int]bool{}}
	r.courses = st

	var mainID int64
	pos := map[int64]int{}
	active := 0
	for i, c := range r.ex.Courses {
		pos[c.ID] = i
		if c.Main {
			mainID = c.ID
		}
		if !c.Archived {
			active++
		}
	}
	isActive := func(id int64) bool {
		for _, c := range r.ex.Courses {
			if c.ID == id && !c.Archived {
				return true
			}
		}
		return false
	}

	// Rows, one per key over the kept Recipes, in first-seen order.
	rowOf := map[string]int{}
	recipeKeys := map[int][]string{}
	for i, rec := range r.f.Recipes {
		if !r.kept[i] || r.asBase[i] {
			continue // a Base recipe has no Courses (§3.1)
		}
		for j, raw := range rec.Courses {
			path := fmt.Sprintf("$.recipes[%d].courses[%d]", i, j)
			name, err := course.CleanName(raw)
			if err != nil {
				r.problem(path, ProblemCourseNameInvalid, "a Course name needs 1 to 40 characters")
				continue
			}
			key := course.NameKey(name)
			k, ok := rowOf[key]
			if !ok {
				k = len(st.rows)
				rowOf[key] = k
				st.rows = append(st.rows, CourseMatch{Name: name, Key: key, Status: CourseUnknown, Resolved: true})
				m := matchOf(r.ex.Courses, key)
				st.matched = append(st.matched, m)
				if m != nil {
					st.rows[k].Match = m
					st.rows[k].Status = CourseExact
					if m.Archived {
						st.rows[k].Status = CourseArchived
					}
				}
			}
			st.rows[k].UsedBy = append(st.rows[k].UsedBy, path)
			if !containsString(recipeKeys[i], key) {
				recipeKeys[i] = append(recipeKeys[i], key)
			}
		}
	}

	// Answers.
	// The limit: active Courses plus the added and the unarchived ones, going through the rows in order. The row
	// where that total first passes MaxCourses gets the Problem; later rows are not flagged again.
	total := active
	over := false
	passes := func(row *CourseMatch) {
		total++
		if !over && total > course.MaxCourses {
			over = true
			row.Resolved = false
			r.problem(row.UsedBy[0], ProblemTooManyCourses, "the Household would have more than 20 Courses")
		}
	}
	for k := range st.rows {
		row := &st.rows[k]
		eff := CourseDecision{Key: row.Key, Action: ActionUse, CourseID: mainID}
		switch row.Status {
		case CourseExact:
			eff.CourseID = st.matched[k].ID
		default:
			if dec := r.courseDecision(row.Key); dec != nil {
				switch dec.Action {
				case ActionUse:
					if isActive(dec.CourseID) {
						eff.CourseID = dec.CourseID
					} else {
						r.stale = true
					}
				case ActionSkip:
					eff = CourseDecision{Key: row.Key, Action: ActionSkip}
				case ActionAdd:
					if row.Status == CourseUnknown {
						eff = CourseDecision{Key: row.Key, Action: ActionAdd}
						passes(row)
					}
				case ActionUnarchive:
					if row.Status == CourseArchived {
						eff = CourseDecision{Key: row.Key, Action: ActionUnarchive, CourseID: st.matched[k].ID}
						passes(row)
					}
				}
			}
		}
		row.Effective = &eff
		switch eff.Action {
		case ActionAdd:
			st.newCourses = append(st.newCourses, NewCourse{Key: row.Key, Name: row.Name})
		case ActionUnarchive:
			st.unarchive = append(st.unarchive, eff.CourseID)
		}
	}

	// What each kept Recipe gets.
	for i, rec := range r.f.Recipes {
		if !r.kept[i] || r.asBase[i] {
			continue
		}
		var ids []int64
		var news []string
		for _, key := range recipeKeys[i] {
			eff := st.rows[rowOf[key]].Effective
			switch eff.Action {
			case ActionUse, ActionUnarchive:
				if !containsID(ids, eff.CourseID) {
					ids = append(ids, eff.CourseID)
				}
			case ActionAdd:
				news = append(news, key)
			}
		}
		sort.SliceStable(ids, func(a, b int) bool { return pos[ids[a]] < pos[ids[b]] })
		if len(ids) == 0 && len(news) == 0 {
			ids = []int64{mainID}
		}
		if len(ids) > 0 {
			st.recipeIDs[i] = ids
		}
		st.recipeNew[i] = news
		if rec.WholeMeal != nil {
			st.recipeWhol[i] = *rec.WholeMeal
		} else {
			st.recipeWhol[i] = recipe.DefaultWholeMeal(rec.ReadyMeal, ids, mainID)
		}
	}
}

// courseDecision is the first answer for a Course key.
func (r *review) courseDecision(key string) *CourseDecision {
	for i := range r.d.Courses {
		if r.d.Courses[i].Key == key {
			d := r.d.Courses[i]
			return &d
		}
	}
	return nil
}

// matchOf is the active Course with the key, or else the archived one (nil when none).
func matchOf(courses []CourseRef, key string) *CourseRef {
	var archived *CourseRef
	for i := range courses {
		if course.NameKey(courses[i].Name) != key {
			continue
		}
		if !courses[i].Archived {
			c := courses[i]
			return &c
		}
		if archived == nil {
			c := courses[i]
			archived = &c
		}
	}
	return archived
}

func containsString(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func containsID(list []int64, id int64) bool {
	for _, x := range list {
		if x == id {
			return true
		}
	}
	return false
}
