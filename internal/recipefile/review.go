package recipefile

import (
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// review is one run of the Import Review rules over (file, existing data,
// decisions, images). Every public planning call builds a fresh review, so no
// answer outlives the data it was given for.
type review struct {
	f      File
	ex     Existing
	d      Decisions
	images ImageSet

	existingByKey map[string]ingredient.Ingredient
	existingByID  map[int64]ingredient.Ingredient
	takenNames    map[string]bool // normalised names of existing and created Ingredients

	recipes  []RecipeStatus
	kept     []bool
	courses  *courseState // crs-e1: nil when the caller knows no Courses
	imported []string
	cleaned  map[int]recipe.Input

	rows     []*ingRow
	byKey    map[string]*ingRow
	prompts  []UnitPrompt
	problems []Problem
	warnings []Warning
	newCount int
	stale    bool // an answer refers to a Recipe or Ingredient that no longer exists

	baseIngs    map[int64]bool  // Ingredients that belong to a Base recipe: never matched by plain name (base_review.go)
	baseRecipes map[int64]bool  // existing Base recipes
	baseIngOf   map[int64]int64 // existing Base recipe id -> its Ingredient
	baseRows    []*baseRow      // the Base recipe tiles
	asBase      []bool          // per file Recipe: created as a Base recipe (marked, or a file answer points at it)
	baseYield   []yieldOf       // per file Recipe that is a Base recipe: its Yield
	baseAt      map[string]*baseLine
	stepBase    []map[string]*baseLine // per file Recipe: the Base recipe lines a Step use named like it stands for
	nextVirt    int64
	takeOvers   []TakeOverAsk
	targets     map[string]*baseTarget // Base recipe Ingredients by ref (base_review.go)
	targetByID  map[int64]*baseTarget
	baseConvs   []BaseConversion // unit answers for Base recipe Ingredients, to store
	takeAnswer  map[string]bool  // take-over answers in force, by path (false when only "keep apart" applies)
}

// ingRow is one Ingredient of the kept Recipes, keyed by normalised name.
type ingRow struct {
	key       string
	name      string // display name, first spelling in the file
	def       *Ingredient
	defIdx    int
	usedBy    []string
	readyMeal bool // the single line of a Ready Meal named like its Recipe: piece Ingredient by default
	match     *ingredient.Ingredient
	conflict  *BaseUnitConflict
	sugg      []Suggestion
	status    string
	decision  *IngredientDecision
	effective *IngredientDecision
	target    *target
}

// target is what a row resolves to: an existing Ingredient, or one to create.
type target struct {
	id         int64  // existing id, or a negative placeholder for a creation
	existingID int64  // 0 when created
	name       string // created: display name
	base       units.Base
	shelf      *int
	convs      []units.Conversion // Unit Conversions in force, file's ones included
	added      []units.Conversion // existing: file conversions to add
	answered   []units.Conversion // one-off answers to unit prompts
	clean      ingredient.Input   // created: the validated Input
}

func newReview(f File, ex Existing, d Decisions, images ImageSet) *review {
	r := &review{
		f: f, ex: ex, d: d, images: images,
		existingByKey: map[string]ingredient.Ingredient{},
		existingByID:  map[int64]ingredient.Ingredient{},
		takenNames:    map[string]bool{},
		cleaned:       map[int]recipe.Input{},
		byKey:         map[string]*ingRow{},
	}
	r.baseIngs, r.baseRecipes = baseSets(ex)
	r.baseIngOf = map[int64]int64{}
	for _, b := range ex.BaseRecipes {
		r.baseIngOf[b.RecipeID] = b.IngredientID
	}
	for _, e := range ex.Ingredients {
		r.existingByID[e.ID] = e
		if r.baseIngs[e.ID] {
			continue // a Base recipe's Ingredient is keyed by its Base recipe, never by name
		}
		if _, dup := r.existingByKey[e.Key()]; !dup {
			r.existingByKey[e.Key()] = e
		}
		r.takenNames[e.Key()] = true
	}
	r.buildRecipeRows()
	r.buildBaseRows()
	r.buildCourses()
	r.buildIngredientRows()
	r.resolveRows()
	r.checkUnits()
	r.answerPrompts()
	r.finishTargets()
	r.checkBaseUnits()
	r.checkRecipes()
	r.checkBaseRecipes()
	r.buildTakeOvers()
	r.collectImageWarnings()
	return r
}

// decisionFor returns the User's Ingredient answer for a key (the first one).
func (r *review) decisionFor(key string) *IngredientDecision {
	for i := range r.d.Ingredients {
		if r.d.Ingredients[i].Key == key {
			d := r.d.Ingredients[i]
			return &d
		}
	}
	return nil
}

// ---- Recipes -------------------------------------------------------------

func (r *review) buildRecipeRows() {
	taken := map[string]bool{}
	for _, e := range r.ex.Recipes {
		taken[units.NormalizeName(e.Name)] = true
	}
	for _, rec := range r.f.Recipes {
		taken[units.NormalizeName(rec.Name)] = true
	}
	for i, rec := range r.f.Recipes {
		name := collapse(rec.Name)
		row := RecipeStatus{Index: i, Name: rec.Name, Status: RecipeNew, Resolved: true, ImportedAs: name}
		dec := r.recipeDecision(i)
		var action string
		if dec != nil {
			action = dec.Action
		}
		existing, conflict := r.existingRecipe(rec.Name)
		switch {
		case conflict:
			row.Status, row.ExistingID, row.Resolved = RecipeConflict, existing.ID, false
			row.ImportedAs = ""
			switch action {
			case ActionReplace:
				row.Action, row.Resolved = action, true
				row.ImportedAs = name
			case ActionSkip:
				row.Action, row.Resolved = action, true
			case ActionKeepBoth:
				row.Action, row.Resolved = action, true
				row.ImportedAs = nextFreeName(name, taken)
				taken[units.NormalizeName(row.ImportedAs)] = true
			}
		case action == ActionSkip:
			row.Action = ActionSkip
			row.ImportedAs = ""
		}
		if action == ActionReplace && !conflict {
			r.stale = true
		}
		if row.Action == ActionSkip {
			row.ImportedAs = ""
		}
		if row.ImportedAs != "" {
			r.imported = append(r.imported, row.ImportedAs)
		} else {
			r.imported = append(r.imported, name)
		}
		r.kept = append(r.kept, row.Action != ActionSkip)
		r.recipes = append(r.recipes, row)
	}

	seen := map[string]bool{}
	for i, rec := range r.f.Recipes {
		if !r.kept[i] {
			continue
		}
		key := units.NormalizeName(rec.Name)
		if seen[key] {
			r.problem(fmt.Sprintf("$.recipes[%d].name", i), "duplicate_recipe_name", "two Recipes in the file have this name")
		}
		seen[key] = true
	}
}

// existingRecipe is the household's Recipe with the same normalised name, if any.
func (r *review) existingRecipe(name string) (RecipeRef, bool) {
	for _, e := range r.ex.Recipes {
		if units.NormalizeName(e.Name) == units.NormalizeName(name) {
			return e, true
		}
	}
	return RecipeRef{}, false
}

func (r *review) recipeDecision(i int) *RecipeDecision {
	for k := range r.d.Recipes {
		if r.d.Recipes[k].Index == i {
			return &r.d.Recipes[k]
		}
	}
	return nil
}

// nextFreeName is "name (n)" for the smallest n >= 2 whose name is not taken.
func nextFreeName(name string, taken map[string]bool) string {
	for n := 2; ; n++ {
		cand := fmt.Sprintf("%s (%d)", name, n)
		if !taken[units.NormalizeName(cand)] {
			return cand
		}
	}
}

// recipePath maps a recipe.Validate field ("lines[0].quantity") to a JSON path.
func recipePath(i int, field string) string {
	base := fmt.Sprintf("$.recipes[%d].", i)
	if strings.HasPrefix(field, "lines") {
		field = "ingredients" + strings.TrimPrefix(field, "lines")
	}
	return base + field
}

// ---- Ingredients ---------------------------------------------------------

func (r *review) buildIngredientRows() {
	defs := map[string]int{}
	for j, def := range r.f.Ingredients {
		key := units.NormalizeName(def.Name)
		if _, dup := defs[key]; dup {
			r.problem(fmt.Sprintf("$.ingredients[%d].name", j), "duplicate_ingredient", "the file defines this Ingredient twice")
			continue
		}
		defs[key] = j
	}
	add := func(name, path string, readyMeal bool) {
		key := units.NormalizeName(name)
		row := r.byKey[key]
		if row == nil {
			row = &ingRow{key: key, name: ingredient.DisplayName(name), defIdx: -1}
			if j, ok := defs[key]; ok {
				row.def, row.defIdx = &r.f.Ingredients[j], j
				row.name = ingredient.DisplayName(row.def.Name)
			}
			r.byKey[key] = row
			r.rows = append(r.rows, row)
		}
		row.usedBy = append(row.usedBy, path)
		row.readyMeal = row.readyMeal || readyMeal
	}
	for i, rec := range r.f.Recipes {
		if !r.kept[i] {
			continue
		}
		for j, l := range rec.Ingredients {
			if r.baseLineFor(linePath(i, j)) != nil {
				continue // a Base recipe line calls for the Base recipe's Ingredient, not a plain one
			}
			pack := rec.ReadyMeal && j == 0 && units.NormalizeName(l.Ingredient) == units.NormalizeName(rec.Name)
			add(l.Ingredient, linePath(i, j), pack)
		}
		for s, st := range rec.Steps {
			for u, use := range st.Uses {
				if r.stepBaseOf(i, use.Ingredient) != nil {
					continue
				}
				add(use.Ingredient, fmt.Sprintf("$.recipes[%d].steps[%d].uses[%d]", i, s, u), false)
			}
		}
	}
}

func (r *review) resolveRows() {
	for _, d := range r.d.Ingredients {
		if d.Action == ActionUse {
			if _, ok := r.existingByID[d.IngredientID]; !ok {
				r.stale = true
			}
		}
	}
	for _, row := range r.rows {
		row.decision = r.decisionFor(row.key)
		row.status, row.sugg, row.conflict = r.classify(row)
		if ex, ok := r.existingByKey[row.key]; ok {
			row.match = &ex
		}
		row.target = r.targetFor(row)
		if row.decision != nil {
			d := *row.decision
			d.Key = row.key
			row.effective = &d
		} else if row.target != nil {
			row.effective = defaultEffective(row)
		}
	}
}

// classify says how a row's name relates to the existing Ingredients.
func (r *review) classify(row *ingRow) (string, []Suggestion, *BaseUnitConflict) {
	ex, matched := r.existingByKey[row.key]
	switch {
	case matched && row.def != nil && row.def.BaseUnit != string(ex.Base):
		return StatusConflict, nil, &BaseUnitConflict{File: row.def.BaseUnit, Existing: string(ex.Base)}
	case matched:
		return StatusExact, nil, nil
	case row.def == nil && row.readyMeal:
		return StatusNew, nil, nil // R14: a Ready Meal's pack needs no definition
	case row.def == nil:
		return StatusUndefined, nil, nil
	}
	var cands []ingredient.Candidate
	for _, e := range r.ex.Ingredients {
		if r.baseIngs[e.ID] {
			continue
		}
		cands = append(cands, ingredient.Candidate{ID: e.ID, Name: e.Name})
	}
	var sugg []Suggestion
	for _, s := range ingredient.Search(row.name, cands, 0).Suggestions {
		e := r.existingByID[s.ID]
		sugg = append(sugg, Suggestion{ID: s.ID, Name: s.Name, BaseUnit: string(e.Base), Score: s.Score})
	}
	if len(sugg) > 0 {
		return StatusSuggested, sugg, nil
	}
	return StatusNew, nil, nil
}

// targetFor resolves a row from the User's decision, or else from the default
// (exact -> use; suggested and new -> create from the file's definition).
func (r *review) targetFor(row *ingRow) *target {
	d := row.decision
	if d != nil {
		switch d.Action {
		case ActionUse:
			if e, ok := r.existingByID[d.IngredientID]; ok {
				return existingTarget(e)
			}
			return nil
		case ActionCreate:
			return r.createTarget(row, d)
		}
		return nil
	}
	switch row.status {
	case StatusExact:
		return existingTarget(*row.match)
	case StatusNew, StatusSuggested:
		return r.createTarget(row, nil)
	}
	return nil
}

func defaultEffective(row *ingRow) *IngredientDecision {
	if row.target.existingID != 0 {
		return &IngredientDecision{Key: row.key, Action: ActionUse, IngredientID: row.target.existingID}
	}
	return &IngredientDecision{Key: row.key, Action: ActionCreate}
}

func existingTarget(e ingredient.Ingredient) *target {
	return &target{
		id:         e.ID,
		existingID: e.ID,
		base:       e.Base,
		convs:      append([]units.Conversion(nil), e.Conversions...),
	}
}

// createTarget builds the Ingredient to create for a row. It needs a Base Unit
// (the file's definition, or the User's), and a name nobody else has.
func (r *review) createTarget(row *ingRow, d *IngredientDecision) *target {
	name := row.name
	var base units.Base
	var shelf *int
	var convs []units.Conversion
	if row.def != nil {
		name = ingredient.DisplayName(row.def.Name)
		base = units.Base(row.def.BaseUnit)
		shelf = row.def.ShelfLifeDays
		for _, c := range row.def.Conversions {
			convs = append(convs, units.Conversion{Unit: c.Unit, ToBase: c.ToBase})
		}
	}
	if d != nil {
		if d.Name != "" {
			name = ingredient.DisplayName(d.Name)
		}
		if row.def == nil && !(row.readyMeal && d.BaseUnit == "") {
			b, ok := units.ParseBase(d.BaseUnit)
			if !ok {
				return nil
			}
			base = b
		}
	}
	if row.def == nil && row.readyMeal && base == "" {
		base = units.Piece
	}
	if base == "" {
		return nil
	}
	key := units.NormalizeName(name)
	if r.takenNames[key] {
		return nil
	}
	r.takenNames[key] = true
	r.newCount++
	return &target{
		id:    int64(-r.newCount),
		name:  name,
		base:  base,
		shelf: shelf,
		convs: convs,
	}
}

// checkUnits asks for a Unit Conversion for every (Ingredient, unit) that a kept
// line or Step use cannot convert, and adds the file's missing conversions to
// matched Ingredients (warning where the existing value differs).
func (r *review) checkUnits() {
	for _, row := range r.rows {
		if row.target == nil || row.target.existingID == 0 || row.def == nil {
			continue
		}
		r.addFileConversions(row)
	}
	for i, rec := range r.f.Recipes {
		if !r.kept[i] {
			continue
		}
		for j, l := range rec.Ingredients {
			if r.baseLineFor(linePath(i, j)) != nil {
				continue
			}
			r.checkUse(units.NormalizeName(l.Ingredient), l.Unit, linePath(i, j))
		}
		for s, st := range rec.Steps {
			for u, use := range st.Uses {
				if r.stepBaseOf(i, use.Ingredient) != nil {
					continue
				}
				r.checkUse(units.NormalizeName(use.Ingredient), use.Unit, fmt.Sprintf("$.recipes[%d].steps[%d].uses[%d]", i, s, u))
			}
		}
	}
}

// addFileConversions merges the file's conversions into a matched Ingredient.
// The existing value wins for a unit it already has.
func (r *review) addFileConversions(row *ingRow) {
	t := row.target
	for j, c := range row.def.Conversions {
		path := fmt.Sprintf("$.ingredients[%d].conversions[%d]", row.defIdx, j)
		conv := units.Conversion{Unit: c.Unit, ToBase: c.ToBase}
		if err := units.ValidateConversion(t.base, conv); err != nil {
			r.problem(path, "invalid_conversion", conversionText(conv, t.base))
			continue
		}
		unit := units.NormalizeUnit(c.Unit)
		if have, ok := findConv(t.convs, unit); ok {
			if have.ToBase != c.ToBase {
				r.warn(path, WarnConversionDiffers, fmt.Sprintf("%s is %v %s in this Feeder, the file says %v; this Feeder's value is kept", unit, have.ToBase, t.base, c.ToBase))
			}
			continue
		}
		t.added = append(t.added, conv)
		t.convs = append(t.convs, conv)
	}
}

func (r *review) checkUse(key, unit, path string) {
	row := r.byKey[key]
	if row == nil || row.target == nil {
		return
	}
	u := units.NormalizeUnit(unit)
	if units.IsConvertible(u, row.unitsView()) {
		return
	}
	for i := range r.prompts {
		if r.prompts[i].Key == key && r.prompts[i].Unit == u {
			r.prompts[i].UsedBy = append(r.prompts[i].UsedBy, path)
			return
		}
	}
	r.prompts = append(r.prompts, UnitPrompt{
		Key: key, Ingredient: row.name, Unit: u, Base: string(row.target.base), UsedBy: []string{path},
	})
}

// answerPrompts applies the User's conversion answers. A bad answer is a
// Problem at the first use and leaves the prompt open.
func (r *review) answerPrompts() {
	for i := range r.prompts {
		p := &r.prompts[i]
		ans := r.answerFor(p.Key, p.Unit)
		if ans == nil {
			continue
		}
		row := r.byKey[p.Key]
		conv := units.Conversion{Unit: p.Unit, ToBase: ans.ToBase}
		if err := units.ValidateConversion(row.target.base, conv); err != nil {
			r.problem(p.UsedBy[0], "invalid_conversion", conversionText(conv, row.target.base))
			continue
		}
		row.target.answered = append(row.target.answered, conv)
		row.target.convs = append(row.target.convs, conv)
		toBase := ans.ToBase
		p.Answered, p.ToBase = true, &toBase
	}
}

func (r *review) answerFor(key, unit string) *ConversionAnswer {
	for i := range r.d.Conversions {
		a := r.d.Conversions[i]
		if a.Key == key && units.NormalizeUnit(a.Unit) == unit {
			return &a
		}
	}
	return nil
}

// finishTargets validates the Ingredients to create (the same rules the store
// applies), so a bad one is a Problem and never reaches the transaction.
func (r *review) finishTargets() {
	for _, row := range r.rows {
		t := row.target
		if t == nil || t.existingID != 0 {
			continue
		}
		in := ingredient.Input{Name: t.name, Base: t.base, ShelfLifeDays: t.shelf, Conversions: append([]units.Conversion(nil), t.convs...)}
		clean, err := in.Validate()
		if err != nil {
			path := r.usedByPath(row)
			if row.defIdx >= 0 {
				path = fmt.Sprintf("$.ingredients[%d]", row.defIdx)
			}
			r.problem(path, "invalid_ingredient", err.Error())
			continue
		}
		t.clean = clean
	}
}

func (r *review) usedByPath(row *ingRow) string {
	if len(row.usedBy) > 0 {
		return row.usedBy[0]
	}
	return "$"
}

// unitsView is the Ingredient as the unit maths sees it, with conversions in force.
func (row *ingRow) unitsView() units.Ingredient {
	return units.Ingredient{Name: row.name, Base: row.target.base, Conversions: row.target.convs}
}

// checkRecipes runs recipe.Input.Validate on every kept Recipe whose Ingredients
// are all resolved. Unknown units are left to the unit prompts.
func (r *review) checkRecipes() {
	lookup := func(id int64) (units.Ingredient, bool) {
		if t, ok := r.targetByID[id]; ok {
			return t.ing, true
		}
		for _, row := range r.rows {
			if row.target != nil && row.target.id == id {
				return row.unitsView(), true
			}
		}
		if e, ok := r.existingByID[id]; ok {
			return e.Units(), true
		}
		return units.Ingredient{}, false
	}
	for i, rec := range r.f.Recipes {
		if !r.kept[i] || !r.allResolved(i, rec) {
			continue
		}
		in := r.recipeInput(i, rec)
		clean, err := in.Validate(lookup)
		if err == nil {
			r.cleaned[i] = clean
			continue
		}
		var unknown *recipe.UnknownUnitError
		if errors.As(err, &unknown) {
			continue
		}
		var ve *recipe.ValidationError
		if errors.As(err, &ve) {
			r.problem(recipePath(i, ve.Field), ve.Code, ve.Message)
			continue
		}
		r.problem(fmt.Sprintf("$.recipes[%d]", i), "invalid_recipe", err.Error())
	}
}

func (r *review) allResolved(i int, rec Recipe) bool {
	for j, l := range rec.Ingredients {
		if r.baseLineFor(linePath(i, j)) != nil {
			continue
		}
		if row := r.byKey[units.NormalizeName(l.Ingredient)]; row == nil || row.target == nil {
			return false
		}
	}
	for _, st := range rec.Steps {
		for _, u := range st.Uses {
			if r.stepBaseOf(i, u.Ingredient) != nil {
				continue
			}
			if row := r.byKey[units.NormalizeName(u.Ingredient)]; row == nil || row.target == nil {
				return false
			}
		}
	}
	return true
}

// recipeInput turns a file Recipe into a recipe.Input whose Ingredient ids are
// the rows' target ids. Minutes are rounded up to whole minutes.
func (r *review) recipeInput(i int, rec Recipe) recipe.Input {
	in := recipe.Input{
		Name:              rec.Name,
		Description:       rec.Description,
		Yield:             rec.Yield,
		ReadyMeal:         rec.ReadyMeal,
		Tags:              rec.Tags,
		CooldownDays:      rec.CooldownDays,
		LeftoverUseByDays: rec.LeftoverUseByDays,
		ReheatMinutes:     rec.ReheatMinutes,
	}
	if r.asBase[i] {
		y := r.baseYield[i]
		in.Yield, in.YieldUnit, in.BaseRecipe = y.yield, y.unit, boolPtr(true)
	}
	if rec.Source != nil {
		in.Source = recipe.Source{URL: rec.Source.URL, Attribution: rec.Source.Attribution}
	}
	for j, l := range rec.Ingredients {
		if bl := r.baseLineFor(linePath(i, j)); bl != nil {
			in.Lines = append(in.Lines, recipe.Line{IngredientID: bl.target.id, Quantity: l.Quantity, Unit: bl.unit, Optional: l.Optional, Note: l.Note})
			continue
		}
		row := r.byKey[units.NormalizeName(l.Ingredient)]
		in.Lines = append(in.Lines, recipe.Line{IngredientID: row.target.id, Quantity: l.Quantity, Unit: l.Unit, Optional: l.Optional, Note: l.Note})
	}
	for _, st := range rec.Steps {
		s := recipe.Step{
			Text:            st.Text,
			Kind:            schedule.Kind(st.Kind),
			DurationMinutes: wholeMinutes(st.DurationMinutes),
			LeadTimeMinutes: wholeMinutes(st.LeadTimeMinutes),
			After:           st.After,
		}
		for _, u := range st.Uses {
			if sb := r.stepBaseOf(i, u.Ingredient); sb != nil {
				s.Uses = append(s.Uses, recipe.Use{IngredientID: sb.target.id, Quantity: u.Quantity, Unit: u.Unit})
				continue
			}
			row := r.byKey[units.NormalizeName(u.Ingredient)]
			s.Uses = append(s.Uses, recipe.Use{IngredientID: row.target.id, Quantity: u.Quantity, Unit: u.Unit})
		}
		in.Steps = append(in.Steps, s)
	}
	return in
}

func wholeMinutes(m *float64) int {
	if m == nil {
		return 0
	}
	return int(math.Ceil(*m))
}

// collectImageWarnings keeps the image warnings of the kept Recipes.
func (r *review) collectImageWarnings() {
	for _, w := range r.images.Warnings {
		var i int
		if _, err := fmt.Sscanf(w.Path, "$.recipes[%d]", &i); err == nil && i >= 0 && i < len(r.kept) && !r.kept[i] {
			continue
		}
		r.warnings = append(r.warnings, w)
	}
}

func (r *review) problem(path, code, msg string) {
	r.problems = append(r.problems, Problem{Path: path, Code: code, Message: msg})
}

func (r *review) warn(path, code, msg string) {
	r.warnings = append(r.warnings, Warning{Path: path, Code: code, Message: msg})
}

func findConv(cs []units.Conversion, unit string) (units.Conversion, bool) {
	for _, c := range cs {
		if units.NormalizeUnit(c.Unit) == unit {
			return c, true
		}
	}
	return units.Conversion{}, false
}

func conversionText(c units.Conversion, base units.Base) string {
	return fmt.Sprintf("the conversion of %q to %s must be a positive number", c.Unit, base)
}

func collapse(s string) string { return strings.Join(strings.Fields(s), " ") }

// plan assembles the Import Review state from the rows.
func (r *review) plan() Plan {
	p := Plan{
		Ingredients:     []IngredientMatch{},
		UnitPrompts:     append([]UnitPrompt{}, r.prompts...),
		Recipes:         append([]RecipeStatus{}, r.recipes...),
		Courses:         []CourseMatch{},
		BaseRecipeLines: r.baseLines(),
		TakeOvers:       []TakeOverAsk{},
		Problems:        append([]Problem{}, r.problems...),
		Warnings:        append([]Warning{}, r.warnings...),
	}
	ready := len(r.problems) == 0 && r.baseReady()
	if r.courses != nil {
		p.Courses = append(p.Courses, r.courses.rows...)
		for _, c := range r.courses.rows {
			ready = ready && c.Resolved
		}
	}
	adopts := r.adoptions()
	for _, row := range r.rows {
		m := IngredientMatch{
			Name: row.name, Key: row.key, Status: row.status, Definition: row.def,
			Suggestions: append([]Suggestion{}, row.sugg...), Conflict: row.conflict,
			Effective: row.effective, Resolved: row.target != nil, UsedBy: append([]string{}, row.usedBy...),
			AddsImage: adopts[row.key] != "",
		}
		if row.match != nil {
			m.Match = &ExistingRef{ID: row.match.ID, Name: row.match.Name, BaseUnit: string(row.match.Base)}
		}
		ready = ready && m.Resolved
		p.Ingredients = append(p.Ingredients, m)
	}
	for _, pr := range r.prompts {
		ready = ready && pr.Answered
	}
	for _, rs := range r.recipes {
		ready = ready && rs.Resolved
	}
	for _, a := range r.takeOvers {
		ready = ready && a.Resolved
	}
	p.TakeOvers = append([]TakeOverAsk{}, r.takeOvers...)
	p.Ready = ready
	return p
}

// commit is the write set of a ready review.
func (r *review) commit() Commit {
	c := Commit{Resolved: map[string]ResolvedIngredient{}, Images: map[string]imaging.Result{}, Warnings: r.warnings, BaseRecipeLines: r.baseCommits(),
		BaseConversions: append([]BaseConversion{}, r.baseConvs...)}
	if r.courses != nil {
		c.NewCourses = r.courses.newCourses
		c.UnarchiveCourses = r.courses.unarchive
	}
	adopts := r.adoptions()
	for _, row := range r.rows {
		t := row.target
		c.Resolved[row.key] = ResolvedIngredient{ID: t.existingID}
		if t.existingID == 0 {
			ni := NewIngredient{Key: row.key, Input: t.clean}
			if row.def != nil {
				// IM2: only a NEW Ingredient takes the file's picture; existing ones are never changed by an import.
				p := fmt.Sprintf("$.ingredients[%d].image", row.defIdx)
				if res, ok := r.images.Images[p]; ok {
					ni.ImagePath = p
					c.Images[p] = res
				}
			}
			c.NewIngredients = append(c.NewIngredients, ni)
			continue
		}
		if p := adopts[row.key]; p != "" {
			c.AddedImages = append(c.AddedImages, AddedImage{IngredientID: t.existingID, ImagePath: p})
			c.Images[p] = r.images.Images[p]
		}
		for _, conv := range append(append([]units.Conversion(nil), t.added...), t.answered...) {
			c.AddedConversions = append(c.AddedConversions, AddedConversion{IngredientID: t.existingID, Conversion: conv})
		}
	}
	var recs []RecipeCommit
	for i, rec := range r.f.Recipes {
		if !r.kept[i] {
			continue
		}
		rc := r.recipeCommit(i, rec)
		recs = append(recs, rc)
		for _, p := range append([]string{rc.ImagePath, rc.BaseImage}, rc.StepImagePaths...) {
			if res, ok := r.images.Images[p]; ok && p != "" {
				c.Images[p] = res
			}
		}
	}
	for _, bl := range r.creates() {
		recs = append(recs, RecipeCommit{
			Index: -1, Action: "create", Line: bl.path, TakeOver: r.takeOverFor(bl.path),
			Input: recipe.Input{Name: bl.name, Yield: bl.yield.yield, YieldUnit: bl.yield.unit, BaseRecipe: boolPtr(true)},
		})
	}
	c.Recipes = orderBaseFirst(recs)
	return c
}

func (r *review) recipeCommit(i int, rec Recipe) RecipeCommit {
	in := r.cleaned[i]
	in.Name = r.recipes[i].ImportedAs
	rc := RecipeCommit{Index: i, Action: "create", Input: in}
	if r.recipes[i].Action == ActionReplace {
		rc.Action, rc.ReplaceID = ActionReplace, r.recipes[i].ExistingID
	}
	for k, l := range rec.Ingredients {
		rc.Input.Lines[k].IngredientID = 0
		var ref BaseRef
		if bl := r.baseLineFor(linePath(i, k)); bl != nil {
			ref = bl.ref
		}
		rc.LineBases = append(rc.LineBases, ref)
		rc.LineKeys = append(rc.LineKeys, units.NormalizeName(l.Ingredient))
	}
	for s, st := range rec.Steps {
		var keys []string
		var refs []BaseRef
		for u, use := range st.Uses {
			rc.Input.Steps[s].Uses[u].IngredientID = 0
			var ref BaseRef
			if sb := r.stepBaseOf(i, use.Ingredient); sb != nil {
				ref = sb.ref
			}
			refs = append(refs, ref)
			keys = append(keys, units.NormalizeName(use.Ingredient))
		}
		rc.UseBases = append(rc.UseBases, refs)
		rc.UseKeys = append(rc.UseKeys, keys)
		p := fmt.Sprintf("$.recipes[%d].steps[%d].image", i, s)
		if !r.hasImage(p) {
			p = ""
		}
		rc.StepImagePaths = append(rc.StepImagePaths, p)
	}
	if p := fmt.Sprintf("$.recipes[%d].image", i); r.hasImage(p) {
		rc.ImagePath = p
	}
	switch {
	case r.asBase[i]:
		// A Base recipe has no Courses and is never a whole meal (§3.1); the store writes it so.
		in.CourseIDs, in.WholeMeal = nil, nil
		rc.TakeOver = r.takeOverFor(fmt.Sprintf("$.recipes[%d]", i))
		r.baseDefinition(&rc, units.NormalizeName(r.recipes[i].ImportedAs))
	case r.courses != nil:
		st := r.courses
		w := st.recipeWhol[i]
		in.CourseIDs = st.recipeIDs[i]
		in.WholeMeal = &w
		rc.NewCourseKeys = st.recipeNew[i]
	case rec.WholeMeal != nil:
		w := *rec.WholeMeal
		in.WholeMeal = &w
	}
	rc.Input = in
	return rc
}

func (r *review) hasImage(p string) bool {
	_, ok := r.images.Images[p]
	return ok
}

// adoptions maps a row key to the image path its existing Ingredient adopts (IM3). A row adopts when its target is an
// existing Ingredient with no picture and the file's definition has a resolved picture. When several rows resolve to
// the same Ingredient, the first definition in file order wins.
func (r *review) adoptions() map[string]string {
	out := map[string]string{}
	best := map[int64]int{} // existing id -> defIdx of the winner
	for _, row := range r.rows {
		t := row.target
		if t == nil || t.existingID == 0 || row.def == nil {
			continue
		}
		if e, ok := r.existingByID[t.existingID]; !ok || e.Image != "" {
			continue
		}
		p := fmt.Sprintf("$.ingredients[%d].image", row.defIdx)
		if !r.hasImage(p) {
			continue
		}
		if prev, ok := best[t.existingID]; ok && prev < row.defIdx {
			continue
		}
		best[t.existingID] = row.defIdx
	}
	for _, row := range r.rows {
		if row.target != nil && row.def != nil && row.target.existingID != 0 {
			if j, ok := best[row.target.existingID]; ok && j == row.defIdx {
				out[row.key] = fmt.Sprintf("$.ingredients[%d].image", j)
			}
		}
	}
	return out
}
