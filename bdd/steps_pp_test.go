package bdd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("pp", ppSteps) }

// ppSteps drives Product pictures over HTTP (docs/dev/design/pp-product-pictures.md). Images are added with the steps of the "images" set,
// which remember the id under w.Vars["image:<name>"]; scan results are remembered by the "shopping-scan" set under w.Vars["ss:result:<uuid>"].
func ppSteps(sc *godog.ScenarioContext, w *World) {
	type pic struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		Image    string `json:"image"`
		ImageURL string `json:"imageUrl"`
	}
	imageID := func(name string) (string, error) {
		id, ok := w.Vars["image:"+name].(string)
		if !ok {
			return "", fmt.Errorf("no image named %q was added", name)
		}
		return id, nil
	}
	// products lists every Product, archived ones too.
	products := func() ([]pic, error) {
		var all []pic
		r := w.Client.Get("/api/products?includeArchived=1")
		if err := r.JSON(&all); err != nil {
			return nil, fmt.Errorf("listing Products: %v %s", err, r.Body)
		}
		return all, nil
	}
	productNamed := func(name string) (pic, error) {
		all, err := products()
		if err != nil {
			return pic{}, err
		}
		for _, p := range all {
			if p.Name == name {
				return p, nil
			}
		}
		return pic{}, fmt.Errorf("no Product %q", name)
	}
	ingredientID := func(name string) (int64, error) {
		var all []pic
		if err := w.Client.Get("/api/ingredients").JSON(&all); err != nil {
			return 0, err
		}
		for _, i := range all {
			if strings.EqualFold(i.Name, name) {
				return i.ID, nil
			}
		}
		return 0, fmt.Errorf("no Ingredient %q", name)
	}
	createProduct := func(name, ingredient string, size int, image string) error {
		iid, err := ingredientID(ingredient)
		if err != nil {
			return err
		}
		body := map[string]any{"name": name, "ingredientId": iid, "packSize": size}
		if image != "" {
			body["image"] = image
		}
		w.Last = w.Client.Do("POST", "/api/products", body)
		return nil
	}
	patch := func(name string, body map[string]any) error {
		p, err := productNamed(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Do("PATCH", fmt.Sprintf("/api/products/%d", p.ID), body)
		return nil
	}

	sc.Step(`^I create the Product "([^"]*)" of "([^"]*)" with pack size (\d+) and the image "([^"]*)"$`, func(name, ing string, size int, img string) error {
		id, err := imageID(img)
		if err != nil {
			return err
		}
		return createProduct(name, ing, size, id)
	})
	sc.Step(`^I create the Product "([^"]*)" of "([^"]*)" with pack size (\d+) and the image id "([^"]*)"$`, func(name, ing string, size int, id string) error {
		return createProduct(name, ing, size, id)
	})
	sc.Step(`^I create the Product "([^"]*)" of "([^"]*)" with pack size (\d+) and no picture$`, func(name, ing string, size int) error {
		return createProduct(name, ing, size, "")
	})
	sc.Step(`^I set the picture of the Product "([^"]*)" to the image "([^"]*)"$`, func(name, img string) error {
		id, err := imageID(img)
		if err != nil {
			return err
		}
		return patch(name, map[string]any{"image": id})
	})
	sc.Step(`^I remove the picture of the Product "([^"]*)"$`, func(name string) error { return patch(name, map[string]any{"image": ""}) })
	sc.Step(`^I rename the Product "([^"]*)" to "([^"]*)"$`, func(name, to string) error { return patch(name, map[string]any{"name": to}) })
	sc.Step(`^I archive the Product "([^"]*)"$`, func(name string) error {
		p, err := productNamed(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Do("POST", fmt.Sprintf("/api/products/%d/archive", p.ID), map[string]any{})
		return nil
	})
	sc.Step(`^I delete the Product "([^"]*)"$`, func(name string) error {
		p, err := productNamed(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Do("DELETE", fmt.Sprintf("/api/products/%d", p.ID), nil)
		return nil
	})
	// Both the list (row thumbnails) and the detail (Product page) must say the same.
	sc.Step(`^the Product "([^"]*)" shows the picture "([^"]*)"$`, func(name, img string) error {
		want, err := imageID(img)
		if err != nil {
			return err
		}
		p, err := productNamed(name)
		if err != nil {
			return err
		}
		var detail pic
		if err := w.Client.Get(fmt.Sprintf("/api/products/%d", p.ID)).JSON(&detail); err != nil {
			return err
		}
		for where, got := range map[string]pic{"list": p, "detail": detail} {
			if got.Image != want || got.ImageURL != "/api/images/"+want {
				return fmt.Errorf("Product %q in the %s: image %q url %q, want %q", name, where, got.Image, got.ImageURL, want)
			}
		}
		return nil
	})
	sc.Step(`^the Product "([^"]*)" has no picture$`, func(name string) error {
		p, err := productNamed(name)
		if err != nil {
			return err
		}
		if p.Image != "" || p.ImageURL != "" {
			return fmt.Errorf("Product %q has image %q", name, p.Image)
		}
		return nil
	})
	sc.Step(`^the household has no Product "([^"]*)"$`, func(name string) error {
		if p, err := productNamed(name); err == nil {
			return fmt.Errorf("Product %q exists (id %d)", name, p.ID)
		}
		return nil
	})

	// --- Scans ---
	resultImageURL := func(uuid string) (string, error) {
		doc, ok := w.Vars["ss:result:"+uuid].(map[string]any)
		if !ok {
			return "", fmt.Errorf("scan %q has no result in this scenario", uuid)
		}
		s, _ := doc["scan"].(map[string]any)
		url, _ := s["productImageUrl"].(string)
		return url, nil
	}
	sc.Step(`^scan "([^"]*)" shows the Product picture "([^"]*)"$`, func(uuid, img string) error {
		want, err := imageID(img)
		if err != nil {
			return err
		}
		got, err := resultImageURL(uuid)
		if err != nil {
			return err
		}
		if got != "/api/images/"+want {
			return fmt.Errorf("scan %s: productImageUrl %q, want %q", uuid, got, "/api/images/"+want)
		}
		return nil
	})
	sc.Step(`^scan "([^"]*)" shows no Product picture$`, func(uuid string) error {
		got, err := resultImageURL(uuid)
		if err != nil {
			return err
		}
		if got != "" {
			return fmt.Errorf("scan %s: productImageUrl %q, want none", uuid, got)
		}
		return nil
	})
	shopID := func(name string) (int64, error) {
		var all []pic
		if err := w.Client.Get("/api/shops").JSON(&all); err != nil {
			return 0, err
		}
		for _, s := range all {
			if s.Name == name {
				return s.ID, nil
			}
		}
		return 0, fmt.Errorf("no Shop %q", name)
	}
	sc.Step(`^I save the unknown barcode "([^"]*)" at "([^"]*)" as scan "([^"]*)" with the picture "([^"]*)"$`, func(code, shop, uuid, img string) error {
		image, err := imageID(img)
		if err != nil {
			return err
		}
		sid, err := shopID(shop)
		if err != nil {
			return err
		}
		op := map[string]any{
			"clientUuid": uuid, "scannedAt": w.Ensure().Clock.Now().Format("2006-01-02T15:04:05Z07:00"), "kind": "shop_unknown", "shopId": sid,
			"barcode": ssGTIN14(code), "quantity": 400, "packSize": 400, "scope": "global",
			"ingredient":  map[string]any{"name": "tinned tomatoes", "baseUnit": "g"},
			"productName": "Tinned tomatoes 400 g", "productImage": image,
		}
		w.Last = w.Client.Post("/api/scan", op)
		var doc map[string]any
		if err := json.Unmarshal(w.Last.Body, &doc); err != nil {
			return fmt.Errorf("scan %s: not JSON: %s", uuid, w.Last.Body)
		}
		w.Vars["ss:result:"+uuid] = doc
		return nil
	})
	sc.Step(`^the offline data for "([^"]*)" lists the picture "([^"]*)" for "([^"]*)"$`, func(shop, img, product string) error {
		want, err := imageID(img)
		if err != nil {
			return err
		}
		sid, err := shopID(shop)
		if err != nil {
			return err
		}
		r := w.Client.Get(fmt.Sprintf("/api/scan/offline?shop=%d", sid))
		if r.Status != http.StatusOK {
			return fmt.Errorf("offline data = %d %s", r.Status, r.Body)
		}
		var data struct {
			Products []pic `json:"products"`
		}
		if err := r.JSON(&data); err != nil {
			return err
		}
		for _, p := range data.Products {
			if p.Name == product {
				if p.ImageURL != "/api/images/"+want {
					return fmt.Errorf("offline Product %q: imageUrl %q, want %q", product, p.ImageURL, "/api/images/"+want)
				}
				return nil
			}
		}
		return fmt.Errorf("the offline data has no Product %q", product)
	})
}
