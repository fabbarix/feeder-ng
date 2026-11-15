package runner

import (
	"context"
	"database/sql"
)

// B9-32 (PC-07): "Mark Recipes as Dessert" and its Undo change which Recipes carry a Course inside the replanning
// write's transaction (planhttp.Replanner.Apply). The recipe store reads outside it, so inside a write the Course
// lists are read again through the transaction, and that write's replan plans with the marks it just made.

// recipeCoursesIn maps every Recipe to its Course ids in household order, read through tx.
func recipeCoursesIn(ctx context.Context, tx *sql.Tx) (map[int64][]int64, error) {
	rows, err := tx.QueryContext(ctx, `SELECT rc.recipe_id, rc.course_id FROM recipe_courses rc
	        JOIN courses c ON c.id = rc.course_id ORDER BY rc.recipe_id, c.position, c.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64][]int64{}
	for rows.Next() {
		var recipeID, courseID int64
		if err := rows.Scan(&recipeID, &courseID); err != nil {
			return nil, err
		}
		out[recipeID] = append(out[recipeID], courseID)
	}
	return out, rows.Err()
}
