package httpapi_test

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/auth/authtest"
	authhttp "github.com/fabbarix/feeder-ng/internal/auth/httpapi"
	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

const (
	waiting = "/waiting-for-approval"
	limited = "/waiting-for-approval?state=limited"
	full    = "/waiting-for-approval?state=full"
	cookie  = "feeder_access"
)

type rig struct {
	t    *testing.T
	env  *testkit.Env
	fake *authtest.Fake
	n    int
}

func start(t *testing.T) *rig {
	t.Helper()
	fake := authtest.New()
	t.Cleanup(authhttp.SetProvider(fake))
	env := testkit.Start(t, testkit.WithConfig(func(c *config.Config) { c.BaseURL = "https://feeder.example" }))
	return &rig{t: t, env: env, fake: fake}
}

// visit plays a whole Google sign-in for a new browser and returns it with the callback response.
func (g *rig) visit(email, name string, verified bool) (*testkit.Client, *testkit.Response) {
	g.t.Helper()
	g.n++
	code := fmt.Sprintf("code-%d", g.n)
	g.fake.Accept(code, auth.Identity{Email: email, EmailVerified: verified, Name: name, Picture: "https://lh3.googleusercontent.com/a/" + name})
	return g.visitWith(g.env.Anonymous(), code)
}

func (g *rig) visitWith(c *testkit.Client, code string) (*testkit.Client, *testkit.Response) {
	r := c.Get("/auth/google/login")
	u, _ := url.Parse(r.Header.Get("Location"))
	return c, c.Get("/auth/google/callback?state=" + url.QueryEscape(u.Query().Get("state")) + "&code=" + code)
}

func (g *rig) ask(email, name string) (*testkit.Client, *testkit.Response) {
	g.t.Helper()
	return g.visit(email, name, true)
}

type listed struct {
	Requests []struct {
		ID          int64  `json:"id"`
		Email       string `json:"email"`
		Name        string `json:"name"`
		Picture     string `json:"picture"`
		RequestedAt string `json:"requestedAt"`
		ExpiresAt   string `json:"expiresAt"`
	} `json:"requests"`
	Count int `json:"count"`
}

func (g *rig) pending(c *testkit.Client) listed {
	g.t.Helper()
	var l listed
	r := c.Get("/api/access-requests")
	if r.Status != 200 {
		g.t.Fatalf("GET /api/access-requests = %d %s", r.Status, r.Body)
	}
	r.MustJSON(g.t, &l)
	return l
}

func (g *rig) idOf(c *testkit.Client, email string) int64 {
	g.t.Helper()
	for _, r := range g.pending(c).Requests {
		if r.Email == email {
			return r.ID
		}
	}
	g.t.Fatalf("no pending request for %s", email)
	return 0
}

func where(r *testkit.Response) string { return r.Header.Get("Location") }

// --- sign-in outcomes ---

func TestAPreAddedAddressSignsInStraightAway(t *testing.T) {
	g := start(t)
	c, r := g.visit(testkit.UserEmail, "Una", true)
	if where(r) != "/" || c.Cookie(auth.CookieName) == nil {
		t.Fatalf("callback = %d -> %q", r.Status, where(r))
	}
	if r := c.Get("/api/me"); r.Status != 200 {
		t.Fatalf("/api/me = %d", r.Status)
	}
}

func TestAMemberLinkedAddressSignsInAndIsLinkedToTheMember(t *testing.T) {
	g := start(t)
	admin := g.env.LoginAdmin(t)
	var member struct {
		ID    int64  `json:"id"`
		Email string `json:"email"`
	}
	r := admin.Post("/api/members", map[string]any{"name": "Nonna", "colour": "#3366cc", "portionFactor": 1, "email": "Nonna@Example.test"})
	r.MustJSON(t, &member)
	if r.Status != 201 || member.Email != "nonna@example.test" {
		t.Fatalf("create Member with an email = %d %s (the Member carries a normalised sign-in email)", r.Status, r.Body)
	}
	c, cb := g.visit("nonna@example.test", "Nonna Rossi", true)
	if where(cb) != "/" || c.Cookie(auth.CookieName) == nil {
		t.Fatalf("callback = %d -> %q, want a session", cb.Status, where(cb))
	}
	var me struct{ ID int64 }
	c.Get("/api/me").MustJSON(t, &me)
	var members []struct {
		ID     int64  `json:"id"`
		UserID *int64 `json:"userId"`
	}
	admin.Get("/api/members").MustJSON(t, &members)
	if len(members) != 1 || members[0].UserID == nil || *members[0].UserID != me.ID || me.ID == 0 {
		t.Fatalf("the Member must be linked to the new User: members %+v, me %+v", members, me)
	}
	if n := g.pending(admin).Count; n != 0 {
		t.Fatalf("a Member's address leaves no Access Request, count = %d", n)
	}
}

func TestAnUnknownVerifiedAddressGetsAPendingRequestAndNoSession(t *testing.T) {
	g := start(t)
	c, r := g.ask("Zia@Example.test", "Zia Rosa")
	if where(r) != waiting {
		t.Fatalf("callback -> %q, want %s", where(r), waiting)
	}
	if c.Cookie(auth.CookieName) != nil {
		t.Fatal("a pending visitor must not get a session")
	}
	ck := c.Cookie(cookie)
	if ck == nil || !ck.HttpOnly || ck.Value == "" {
		t.Fatalf("waiting-page cookie = %+v, want a non-empty HttpOnly cookie", ck)
	}
	var sawSecure bool
	for _, sc := range r.Header.Values("Set-Cookie") {
		if strings.HasPrefix(sc, cookie+"=") {
			sawSecure = strings.Contains(sc, "Secure") && strings.Contains(sc, "SameSite=Lax") && strings.Contains(sc, "Path=/api/access-request")
		}
	}
	if !sawSecure {
		t.Errorf("the waiting-page cookie must be Secure (https base URL), SameSite=Lax, Path=/api/access-request: %v", r.Header.Values("Set-Cookie"))
	}
	if _, err := g.env.Auth.UserByEmail(t.Context(), "zia@example.test"); err == nil {
		t.Fatal("asking must not add a User")
	}
	l := g.pending(g.env.LoginUser(t))
	if l.Count != 1 || len(l.Requests) != 1 {
		t.Fatalf("list = %+v", l)
	}
	q := l.Requests[0]
	if q.Email != "zia@example.test" || q.Name != "Zia Rosa" || !strings.HasPrefix(q.Picture, "https://lh3.googleusercontent.com/") ||
		q.RequestedAt != testkit.StartTime.Format(time.RFC3339) || q.ExpiresAt != testkit.StartTime.Add(14*24*time.Hour).Format(time.RFC3339) {
		t.Fatalf("request = %+v", q)
	}
}

func TestAnUnverifiedAddressIsRefusedWithoutARequest(t *testing.T) {
	g := start(t)
	c, r := g.visit("zia@example.test", "Zia", false)
	if where(r) != "/email-not-verified" || c.Cookie(auth.CookieName) != nil || c.Cookie(cookie) != nil {
		t.Fatalf("callback -> %q, cookies session=%v waiting=%v", where(r), c.Cookie(auth.CookieName), c.Cookie(cookie))
	}
	if n := g.pending(g.env.LoginUser(t)).Count; n != 0 {
		t.Fatalf("count = %d", n)
	}
}

func TestRepeatSignInsKeepOneRequest(t *testing.T) {
	g := start(t)
	g.ask("zia@example.test", "Zia")
	g.env.Clock.Advance(time.Hour)
	_, r := g.ask("zia@example.test", "Zia Rosa")
	if where(r) != waiting {
		t.Fatalf("repeat -> %q", where(r))
	}
	l := g.pending(g.env.LoginUser(t))
	if l.Count != 1 || l.Requests[0].Name != "Zia Rosa" || l.Requests[0].RequestedAt != testkit.StartTime.Format(time.RFC3339) {
		t.Fatalf("list = %+v", l)
	}
}

// --- a pending visitor sees nothing ---

func TestAPendingVisitorGetsNoHouseholdData(t *testing.T) {
	g := start(t)
	c, _ := g.ask("zia@example.test", "Zia")
	paths := []string{
		"/api/me", "/api/members", "/api/household/settings", "/api/meal-slots", "/api/allowlist", "/api/access-requests",
		"/api/access-requests/history", "/api/recipes", "/api/ingredients", "/api/shopping/list", "/api/stock", "/api/events",
		"/api/notifications/devices", "/api/plan", "/api/today/streak",
	}
	for _, p := range paths {
		if r := c.Get(p); r.Status != http.StatusUnauthorized {
			t.Errorf("pending visitor GET %s = %d %.80s, want 401", p, r.Status, r.Body)
		}
	}
	for _, call := range [][2]string{{"POST", "/api/access-requests/1/approve"}, {"POST", "/api/access-requests/1/deny"}, {"POST", "/api/members"}} {
		if r := c.Do(call[0], call[1], nil); r.Status != http.StatusUnauthorized {
			t.Errorf("pending visitor %s %s = %d, want 401 (a visitor cannot approve themselves)", call[0], call[1], r.Status)
		}
	}
}

func TestTheWaitingPageStatusRevealsOnlyTheVisitorsOwnGoogleDetails(t *testing.T) {
	g := start(t)
	g.env.AddUser(t, "nonna@example.test", "Nonna", false)
	c, _ := g.ask("zia@example.test", "Zia Rosa")
	r := c.Get("/api/access-request/status")
	var got map[string]any
	r.MustJSON(t, &got)
	if r.Status != 200 || got["status"] != "pending" || got["email"] != "zia@example.test" || got["name"] != "Zia Rosa" {
		t.Fatalf("status = %d %s", r.Status, r.Body)
	}
	for k := range got {
		switch k {
		case "status", "email", "name", "requestedAt":
		default:
			t.Errorf("status leaks field %q", k)
		}
	}
	for _, secret := range []string{"admin@example.test", "user@example.test", "nonna@example.test", "Nonna"} {
		if strings.Contains(string(r.Body), secret) {
			t.Errorf("status mentions household detail %q", secret)
		}
	}
	if cc := r.Header.Get("Cache-Control"); !strings.Contains(cc, "no-store") {
		t.Errorf("Cache-Control = %q, want no-store", cc)
	}
	// Anyone without the cookie learns nothing, not even whether an address is pending.
	anon := g.env.Anonymous().Get("/api/access-request/status")
	var none map[string]any
	anon.MustJSON(t, &none)
	if anon.Status != 200 || none["status"] != "none" || len(none) != 1 {
		t.Fatalf("anonymous status = %d %s", anon.Status, anon.Body)
	}
	other, _ := g.ask("other@example.test", "Other")
	if r := other.Get("/api/access-request/status"); strings.Contains(string(r.Body), "zia@") {
		t.Fatal("one visitor's token must never show another's request")
	}
}

func TestTheSignedOutPagesServeNoHouseholdData(t *testing.T) {
	g := start(t)
	body := string(g.env.Anonymous().Get(waiting).Body)
	if strings.Contains(body, "example.test") {
		t.Fatalf("the SPA shell for the waiting page contains household data: %s", body)
	}
}

// --- approval ---

func TestAnyUserCanApproveAndThePersonThenSignsIn(t *testing.T) {
	g := start(t)
	g.ask("zia@example.test", "Zia Rosa")
	plain := g.env.LoginUser(t) // not an Admin
	id := g.idOf(plain, "zia@example.test")
	var u struct {
		ID          int64  `json:"id"`
		Email       string `json:"email"`
		DisplayName string `json:"displayName"`
		IsAdmin     bool   `json:"isAdmin"`
	}
	r := plain.Post(fmt.Sprintf("/api/access-requests/%d/approve", id), nil)
	r.MustJSON(t, &u)
	if r.Status != 200 || u.Email != "zia@example.test" || u.DisplayName != "Zia Rosa" || u.IsAdmin || u.ID == 0 {
		t.Fatalf("approve = %d %s", r.Status, r.Body)
	}
	if g.pending(plain).Count != 0 {
		t.Fatal("the request must be gone")
	}
	c, cb := g.ask("zia@example.test", "Zia Rosa")
	if where(cb) != "/" || c.Cookie(auth.CookieName) == nil {
		t.Fatalf("after approval, callback -> %q", where(cb))
	}
	if r := c.Get("/api/me"); r.Status != 200 {
		t.Fatalf("/api/me = %d", r.Status)
	}
	if r := plain.Post(fmt.Sprintf("/api/access-requests/%d/approve", id), nil); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Fatalf("approving twice = %d %s", r.Status, r.Body)
	}
}

func TestApprovalAndDenialNeedASignedInUser(t *testing.T) {
	g := start(t)
	g.ask("zia@example.test", "Zia")
	id := g.idOf(g.env.LoginUser(t), "zia@example.test")
	anon := g.env.Anonymous()
	for _, p := range []string{"/api/access-requests", fmt.Sprintf("/api/access-requests/%d/approve", id), fmt.Sprintf("/api/access-requests/%d/deny", id), "/api/access-requests/history"} {
		method := "POST"
		if !strings.HasSuffix(p, "approve") && !strings.HasSuffix(p, "deny") {
			method = "GET"
		}
		if r := anon.Do(method, p, nil); r.Status != 401 {
			t.Errorf("anonymous %s %s = %d, want 401", method, p, r.Status)
		}
	}
}

func TestApproveAndDenyCarryCSRFProtection(t *testing.T) {
	g := start(t)
	g.ask("zia@example.test", "Zia")
	user := g.env.LoginUser(t)
	id := g.idOf(user, "zia@example.test")
	for _, action := range []string{"approve", "deny"} {
		path := fmt.Sprintf("/api/access-requests/%d/%s", id, action)
		if r := rawPost(t, g.env, user, path, "", map[string]string{"Origin": "https://evil.example"}); r.Status != 403 || r.ErrorCode() != "cross_origin" {
			t.Errorf("%s from another origin = %d %s", action, r.Status, r.Body)
		}
		if r := rawPost(t, g.env, user, path, `{"x":1}`, map[string]string{"Content-Type": "text/plain"}); r.Status != 415 {
			t.Errorf("%s with a form body = %d", action, r.Status)
		}
		if g.pending(user).Count != 1 {
			t.Fatalf("a refused %s must leave the request pending", action)
		}
	}
	if r := rawPost(t, g.env, user, fmt.Sprintf("/api/access-requests/%d/approve", id), "", map[string]string{"Origin": "https://feeder.example"}); r.Status != 200 {
		t.Errorf("approve from the app's own origin = %d %s", r.Status, r.Body)
	}
}

func TestApproveAndDenyMustBePOST(t *testing.T) {
	g := start(t)
	g.ask("zia@example.test", "Zia")
	user := g.env.LoginUser(t)
	id := g.idOf(user, "zia@example.test")
	for _, m := range []string{"GET", "PUT", "DELETE"} {
		if r := user.Do(m, fmt.Sprintf("/api/access-requests/%d/approve", id), nil); r.Status == 200 || r.Status == 204 {
			t.Errorf("%s approve = %d: state must only change on POST", m, r.Status)
		}
	}
	if g.pending(user).Count != 1 {
		t.Fatal("still pending")
	}
}

func TestUnknownRequestIdsAre404(t *testing.T) {
	g := start(t)
	user := g.env.LoginUser(t)
	for _, p := range []string{"/api/access-requests/9999/approve", "/api/access-requests/9999/deny", "/api/access-requests/abc/approve"} {
		if r := user.Post(p, nil); r.Status != 404 {
			t.Errorf("POST %s = %d", p, r.Status)
		}
	}
}

// --- denial ---

func TestDenyRemovesTheRequestAndTheAddressMayAskAgainLater(t *testing.T) {
	g := start(t)
	g.ask("zia@example.test", "Zia")
	user := g.env.LoginUser(t)
	if r := user.Post(fmt.Sprintf("/api/access-requests/%d/deny", g.idOf(user, "zia@example.test")), nil); r.Status != 204 {
		t.Fatalf("deny = %d %s", r.Status, r.Body)
	}
	if g.pending(user).Count != 0 {
		t.Fatal("denied request must be removed")
	}
	g.env.Clock.Advance(2 * time.Hour)
	c, cb := g.ask("zia@example.test", "Zia")
	if where(cb) != limited || c.Cookie(auth.CookieName) != nil {
		t.Fatalf("asking again right away -> %q, want %s", where(cb), limited)
	}
	if g.pending(user).Count != 0 {
		t.Fatal("a limited attempt must not create a request")
	}
	g.env.Clock.Advance(23 * time.Hour)
	if _, cb := g.ask("zia@example.test", "Zia"); where(cb) != waiting {
		t.Fatalf("after the cooldown -> %q", where(cb))
	}
	if g.pending(user).Count != 1 {
		t.Fatal("the new request should be pending")
	}
}

// --- floods ---

func TestOneIPCannotFloodTheQueue(t *testing.T) {
	g := start(t)
	for i := range 10 {
		if _, r := g.ask(fmt.Sprintf("flood%d@example.test", i), "F"); where(r) != waiting {
			t.Fatalf("visitor %d -> %q", i, where(r))
		}
	}
	if _, r := g.ask("flood10@example.test", "F"); where(r) != limited {
		t.Fatalf("11th visitor from one address in an hour -> %q, want %s", where(r), limited)
	}
	if n := g.pending(g.env.LoginUser(t)).Count; n != 10 {
		t.Fatalf("count = %d", n)
	}
	g.env.Clock.Advance(61 * time.Minute)
	if _, r := g.ask("flood10@example.test", "F"); where(r) != waiting {
		t.Fatalf("an hour later -> %q", where(r))
	}
}

func TestThePendingQueueHasAGlobalCap(t *testing.T) {
	g := start(t)
	for i := range 50 {
		if i > 0 && i%10 == 0 {
			g.env.Clock.Advance(61 * time.Minute) // stay under the per-IP limit
		}
		if _, r := g.ask(fmt.Sprintf("cap%d@example.test", i), "C"); where(r) != waiting {
			t.Fatalf("visitor %d -> %q", i, where(r))
		}
	}
	g.env.Clock.Advance(61 * time.Minute)
	c, r := g.ask("one-too-many@example.test", "C")
	if where(r) != full || c.Cookie(auth.CookieName) != nil {
		t.Fatalf("51st -> %q, want %s", where(r), full)
	}
	user := g.env.LoginUser(t)
	if n := g.pending(user).Count; n != 50 {
		t.Fatalf("count = %d, want 50", n)
	}
	// Users are never locked out by a full queue.
	if _, r := g.visit(testkit.UserEmail, "Una", true); where(r) != "/" {
		t.Fatalf("a User with a full queue -> %q", where(r))
	}
	user.Post(fmt.Sprintf("/api/access-requests/%d/deny", g.idOf(user, "cap0@example.test")), nil)
	if _, r := g.ask("one-too-many@example.test", "C"); where(r) != waiting {
		t.Fatalf("after room is made -> %q", where(r))
	}
}

// --- expiry ---

func TestPendingRequestsExpireAfterFourteenDays(t *testing.T) {
	g := start(t)
	c, _ := g.ask("zia@example.test", "Zia")
	user := g.env.LoginUser(t)
	g.env.Clock.Advance(14*24*time.Hour - time.Minute)
	if g.pending(user).Count != 1 {
		t.Fatal("still pending just before 14 days")
	}
	g.env.Clock.Advance(2 * time.Minute)
	user = g.env.LoginUser(t) // a fresh session: the old one is still valid, this just avoids relying on it
	if l := g.pending(user); l.Count != 0 || len(l.Requests) != 0 {
		t.Fatalf("after 14 days: %+v", l)
	}
	var st map[string]any
	c.Get("/api/access-request/status").MustJSON(t, &st)
	if st["status"] != "none" {
		t.Fatalf("status = %v", st)
	}
	if r := user.Post("/api/access-requests/1/approve", nil); r.Status != 404 {
		t.Fatalf("approving an expired request = %d", r.Status)
	}
	if _, r := g.ask("zia@example.test", "Zia"); where(r) != waiting {
		t.Fatalf("asking again after expiry -> %q", where(r))
	}
}

// --- audit trail ---

func TestHistoryShowsWhoApprovedAndDeniedWhomAndWhen(t *testing.T) {
	g := start(t)
	g.ask("zia@example.test", "Zia")
	g.ask("rex@example.test", "Rex")
	user, admin := g.env.LoginUser(t), g.env.LoginAdmin(t)
	g.env.Clock.Advance(time.Hour)
	user.Post(fmt.Sprintf("/api/access-requests/%d/approve", g.idOf(user, "zia@example.test")), nil)
	g.env.Clock.Advance(time.Hour)
	admin.Post(fmt.Sprintf("/api/access-requests/%d/deny", g.idOf(admin, "rex@example.test")), nil)

	var h struct {
		Events []struct {
			Kind       string `json:"kind"`
			Email      string `json:"email"`
			At         string `json:"at"`
			ActorEmail string `json:"actorEmail"`
		} `json:"events"`
	}
	user.Get("/api/access-requests/history").MustJSON(t, &h)
	if len(h.Events) != 4 {
		t.Fatalf("events = %+v", h.Events)
	}
	if e := h.Events[0]; e.Kind != "denied" || e.Email != "rex@example.test" || e.ActorEmail != testkit.AdminEmail || e.At != testkit.StartTime.Add(2*time.Hour).Format(time.RFC3339) {
		t.Errorf("newest = %+v", e)
	}
	if e := h.Events[1]; e.Kind != "approved" || e.Email != "zia@example.test" || e.ActorEmail != testkit.UserEmail {
		t.Errorf("second = %+v", e)
	}
}

// --- live updates ---

func TestMountedUnderTheAccessModule(t *testing.T) {
	// The routes live in internal/access/httpapi and are registered as module "access"; /api/ falls through to a
	// 404 not_found JSON when they are not mounted.
	g := start(t)
	r := g.env.Anonymous().Get("/api/access-requests")
	if r.Status != 401 {
		t.Fatalf("GET /api/access-requests anonymous = %d %s, want 401 (route mounted, auth required)", r.Status, r.Body)
	}
}

// rawPost sends a POST with explicit headers, like the BDD "with the header" step.
func rawPost(t *testing.T, env *testkit.Env, c *testkit.Client, path, body string, headers map[string]string) *testkit.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, env.URL()+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	if ck := c.Cookie(auth.CookieName); ck != nil {
		req.AddCookie(ck)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data := make([]byte, 0, 512)
	buf := make([]byte, 512)
	for {
		n, err := resp.Body.Read(buf)
		data = append(data, buf[:n]...)
		if err != nil {
			break
		}
	}
	return &testkit.Response{Status: resp.StatusCode, Header: resp.Header, Body: data}
}

func idString(id int64) string { return fmt.Sprint(id) }

// --- review send-back ---

// A9: the address got in (Admin allowlist) after the request was made. Denying it must not "succeed".
func TestDenyOfARequestWhoseAddressIsAlreadyAUserIs409AlreadyAUser(t *testing.T) {
	g := start(t)
	g.ask("zia@example.test", "Zia")
	admin := g.env.LoginAdmin(t)
	id := g.idOf(admin, "zia@example.test")
	if r := admin.Post("/api/allowlist", map[string]any{"email": "zia@example.test"}); r.Status != 201 {
		t.Fatalf("allowlist add = %d %s", r.Status, r.Body)
	}
	r := admin.Post(fmt.Sprintf("/api/access-requests/%d/deny", id), nil)
	if r.Status != 409 || r.ErrorCode() != "already_a_user" {
		t.Fatalf("deny = %d %s, want 409 already_a_user", r.Status, r.Body)
	}
	if g.pending(admin).Count != 0 {
		t.Fatal("the request must be cleared")
	}
	var h struct {
		Events []struct{ Kind, Email string } `json:"events"`
	}
	admin.Get("/api/access-requests/history").MustJSON(t, &h)
	for _, e := range h.Events {
		if e.Kind == "denied" {
			t.Fatalf("history has a denied line for a User: %+v", h.Events)
		}
	}
	if _, cb := g.ask("zia@example.test", "Zia"); where(cb) != "/" {
		t.Fatalf("the new User must sign in, callback -> %q", where(cb))
	}
}

func TestTheListDropsARequestWhoseAddressIsAlreadyAUser(t *testing.T) {
	g := start(t)
	g.ask("zia@example.test", "Zia")
	g.ask("rex@example.test", "Rex")
	admin := g.env.LoginAdmin(t)
	admin.Post("/api/allowlist", map[string]any{"email": "zia@example.test"})
	l := g.pending(admin)
	if l.Count != 1 || len(l.Requests) != 1 || l.Requests[0].Email != "rex@example.test" {
		t.Fatalf("list = %+v, want only Rex", l)
	}
}

// Nit: once the person is in, the waiting-page cookie is dead weight. The SignedIn callback clears it.
func TestSigningInClearsTheWaitingPageCookie(t *testing.T) {
	g := start(t)
	g.ask("zia@example.test", "Zia")
	admin := g.env.LoginAdmin(t)
	admin.Post(approvePath(g.idOf(admin, "zia@example.test")), nil)
	_, cb := g.ask("zia@example.test", "Zia")
	if where(cb) != "/" {
		t.Fatalf("callback -> %q", where(cb))
	}
	var cleared *http.Cookie
	for _, ck := range (&http.Response{Header: cb.Header}).Cookies() {
		if ck.Name == cookie {
			cleared = ck
		}
	}
	if cleared == nil || cleared.Value != "" || cleared.MaxAge >= 0 || cleared.Path != "/api/access-request" || !cleared.HttpOnly {
		t.Fatalf("feeder_access cookie on sign-in = %+v, want an expiring empty cookie on the same path", cleared)
	}
}
