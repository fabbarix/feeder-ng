package baserecipe

// FindCycle looks for a cycle through the saved Recipe in the "calls for" graph (Recipe id to the ids of the
// Base recipes its lines call for) and returns its names, closed: [Béchamel Roux Béchamel], a self call
// [Béchamel Béchamel]. nil when the saved Recipe is on no cycle (a cycle elsewhere is not reported).
func FindCycle(edges map[int64][]int64, names map[int64]string, saved int64) []string {
	visited := map[int64]bool{saved: true}
	path := []int64{saved}
	var dfs func(id int64) bool
	dfs = func(id int64) bool {
		for _, next := range edges[id] {
			if next == saved {
				path = append(path, saved)
				return true
			}
			if visited[next] {
				continue
			}
			visited[next] = true
			path = append(path, next)
			if dfs(next) {
				return true
			}
			path = path[:len(path)-1]
		}
		return false
	}
	if !dfs(saved) {
		return nil
	}
	out := make([]string, len(path))
	for i, id := range path {
		out[i] = names[id]
	}
	return out
}

// reachable returns the ids that can be reached from `from` by one or more edges.
func reachable(edges map[int64][]int64, from int64) map[int64]bool {
	seen := map[int64]bool{}
	stack := []int64{from}
	for len(stack) > 0 {
		id := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		for _, next := range edges[id] {
			if !seen[next] {
				seen[next] = true
				stack = append(stack, next)
			}
		}
	}
	return seen
}
