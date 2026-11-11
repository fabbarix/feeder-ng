package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/fabbarix/feeder-ng/internal/course"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// Courses in the Recipe File store (crs-e1, docs/dev/design/crs-e1.md, 5). Reads go through the course store;
// the Confirm writes Course changes inside the Recipe File transaction, next to the Recipes that use them.

// existingCourses lists every Course, archived ones included, in household order.
func (s *Store) existingCourses(ctx context.Context) ([]recipefile.CourseRef, error) {
	list, err := s.courses.List(ctx, true)
	if err != nil {
		return nil, err
	}
	out := make([]recipefile.CourseRef, 0, len(list))
	for _, c := range list {
		out = append(out, recipefile.CourseRef{ID: c.ID, Name: c.Name, Main: c.Main, Archived: c.Archived})
	}
	return out, nil
}

// PromptCourses lists the active Courses in household order for the Agent Prompt. It implements
// service.CourseSource.
func (s *Store) PromptCourses(ctx context.Context) ([]recipefile.PromptCourse, error) {
	list, err := s.courses.List(ctx, false)
	if err != nil {
		return nil, err
	}
	out := make([]recipefile.PromptCourse, 0, len(list))
	for _, c := range list {
		out = append(out, recipefile.PromptCourse{Name: c.Name, Main: c.Main})
	}
	return out, nil
}

// applyCourses does the Course changes of a Commit inside tx: the unarchives, then the creations (last in the
// order). It returns the new Course ids by key. A Course that is gone, a name taken since the review, or more than
// 20 active Courses is ErrStale.
func applyCourses(ctx context.Context, tx *sql.Tx, c recipefile.Commit, res *Result, now string) (map[string]int64, error) {
	ids := map[string]int64{}
	if len(c.UnarchiveCourses) == 0 && len(c.NewCourses) == 0 {
		return ids, nil
	}
	var active int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM courses WHERE archived = 0`).Scan(&active); err != nil {
		return nil, err
	}
	for _, id := range c.UnarchiveCourses {
		var archived int
		err := tx.QueryRowContext(ctx, `SELECT archived FROM courses WHERE id = ?`, id).Scan(&archived)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrStale
		}
		if err != nil {
			return nil, err
		}
		if archived == 0 {
			continue
		}
		if _, err := tx.ExecContext(ctx, `UPDATE courses SET archived = 0,
			position = (SELECT COALESCE(MAX(position), -1) + 1 FROM courses) WHERE id = ?`, id); err != nil {
			return nil, err
		}
		active++
		res.CoursesUnarchived++
	}
	if active+len(c.NewCourses) > course.MaxCourses {
		return nil, ErrStale
	}
	for _, nc := range c.NewCourses {
		var taken int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM courses WHERE name_key = ?`, nc.Key).Scan(&taken); err != nil {
			return nil, err
		}
		if taken > 0 {
			return nil, ErrStale
		}
		var pos int
		if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(position), -1) + 1 FROM courses`).Scan(&pos); err != nil {
			return nil, err
		}
		r, err := tx.ExecContext(ctx, `INSERT INTO courses (name, name_key, position, is_main, archived, created_at)
			VALUES (?, ?, ?, 0, 0, ?)`, nc.Name, nc.Key, pos, now)
		if err != nil {
			return nil, err
		}
		id, err := r.LastInsertId()
		if err != nil {
			return nil, err
		}
		ids[nc.Key] = id
		res.CoursesCreated++
	}
	return ids, nil
}

// courseIDsFor is the Course ids a RecipeCommit writes: its existing ones, then the created ones it uses. nil
// when it has none (CreateTx then gives the main Course, a Replace keeps the stored ones; the planner never
// sends nil for a Household with Courses).
func courseIDsFor(rc recipefile.RecipeCommit, created map[string]int64) ([]int64, error) {
	if rc.Input.CourseIDs == nil && len(rc.NewCourseKeys) == 0 {
		return nil, nil
	}
	ids := append([]int64(nil), rc.Input.CourseIDs...)
	for _, k := range rc.NewCourseKeys {
		id, ok := created[k]
		if !ok {
			return nil, ErrStale
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// requireActive checks that every Course id is an active Course inside tx (a deleted or archived one is ErrStale).
func requireActive(ctx context.Context, tx *sql.Tx, ids []int64) error {
	for _, id := range ids {
		var n int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM courses WHERE id = ? AND archived = 0`, id).Scan(&n); err != nil {
			return err
		}
		if n == 0 {
			return fmt.Errorf("%w: course %d is not an active Course", ErrStale, id)
		}
	}
	return nil
}
