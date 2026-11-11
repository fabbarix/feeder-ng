package bdd

import (
	"fmt"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("ppx", ppxSteps) }

// ppxSteps adds the offline-queue steps for pictured unknown barcodes (docs/dev/design/ppx-product-picture-sync.md). The phone has already
// uploaded the Picture (the "images" steps remember its id under w.Vars["image:<name>"]); the queue is the "shopping-scan" set's w.Vars["ss:queue"].
func ppxSteps(sc *godog.ScenarioContext, w *World) {
	enqueue := func(code, shop, uuid, imageName string) error {
		w.Ensure()
		var image string
		if imageName != "" {
			id, ok := w.Vars["image:"+imageName].(string)
			if !ok {
				return fmt.Errorf("no image named %q was added", imageName)
			}
			image = id
		}
		var shops []struct {
			ID   int64  `json:"id"`
			Name string `json:"name"`
		}
		if err := w.Client.Get("/api/shops").JSON(&shops); err != nil {
			return err
		}
		var shopID int64
		for _, s := range shops {
			if s.Name == shop {
				shopID = s.ID
			}
		}
		if shopID == 0 {
			return fmt.Errorf("no Shop %q", shop)
		}
		op := map[string]any{
			"clientUuid": uuid, "scannedAt": w.Env.Clock.Now().Format("2006-01-02T15:04:05Z07:00"), "kind": "shop_unknown", "shopId": shopID,
			"barcode": ssGTIN14(code), "quantity": 400, "packSize": 400, "scope": "global",
			"ingredient": map[string]any{"name": "tinned tomatoes", "baseUnit": "g"}, "productName": "Tinned tomatoes 400 g",
		}
		if image != "" {
			op["productImage"] = image
		}
		ops, _ := w.Vars["ss:queue"].([]map[string]any)
		w.Vars["ss:queue"] = append(ops, op)
		return nil
	}
	sc.Step(`^the phone queues the unknown barcode "([^"]*)" at "([^"]*)" as "([^"]*)" with the picture "([^"]*)"$`, func(code, shop, uuid, img string) error {
		return enqueue(code, shop, uuid, img)
	})
	sc.Step(`^the phone queues the unknown barcode "([^"]*)" at "([^"]*)" as "([^"]*)" with no picture$`, func(code, shop, uuid string) error {
		return enqueue(code, shop, uuid, "")
	})
}
