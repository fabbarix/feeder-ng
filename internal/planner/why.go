package planner

import "sort"

// ruleWhy is the slot_rule chip for a Slot Rule.
func ruleWhy(rule SlotRule) Why {
	if rule.Tag != "" {
		return Why{Code: ReasonSlotRule, Tag: rule.Tag}
	}
	return Why{Code: ReasonSlotRule, RecipeID: rule.RecipeID}
}

// matchRule returns the first Slot Rule the Recipe satisfies: by id, or by Tag.
func matchRule(rules []SlotRule, r Recipe) (SlotRule, bool) {
	for _, rule := range rules {
		if rule.Tag != "" {
			if hasTag(r.Tags, rule.Tag) {
				return rule, true
			}
			continue
		}
		if rule.RecipeID == r.ID {
			return rule, true
		}
	}
	return SlotRule{}, false
}

// buildWhy assembles the chips: the Slot Rule first (if any), then the largest
// positive terms, at most 3 chips in all. With nothing to say there are no chips
// (ADR 0009 retired best_available). The relaxed chip is appended by the caller.
func buildWhy(chips []chip, rule *Why) []Why {
	var out []Why
	if rule != nil {
		out = append(out, *rule)
	}
	sorted := append([]chip(nil), chips...)
	sort.SliceStable(sorted, func(a, b int) bool { return sorted[a].value > sorted[b].value })
	for _, c := range sorted {
		if len(out) >= 3 {
			break
		}
		out = append(out, c.why)
	}
	return out
}
