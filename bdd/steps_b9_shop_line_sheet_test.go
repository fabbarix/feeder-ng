package bdd

import (
	"fmt"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("b9_shop_line_sheet", b9ShopLineSheetSteps) }

// b9ShopLineSheetSteps (B9-43): one bridge between the shopping steps (Ingredient ids in Vars["ss:ingredient:<name>"]) and the stock steps
// (Vars["stock.ing.<name>"]), so the Stock Put away steps can name an Ingredient the shopping steps made.
func b9ShopLineSheetSteps(sc *godog.ScenarioContext, w *World) {
	sc.Step(`^Stock knows the shopping Ingredient "([^"]*)"$`, func(name string) error {
		id, ok := w.Vars["ss:ingredient:"+name].(int64)
		if !ok {
			return fmt.Errorf("no shopping Ingredient %q in this scenario", name)
		}
		w.Vars["stock.ing."+name] = id
		return nil
	})
}
