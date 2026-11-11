// Command fakeanthropic serves the fake Anthropic API for manual browser
// testing of the Recipe Assistant:
//
//	setsid nohup go run ./cmd/fakeanthropic -addr 127.0.0.1:18080 > build/fake.log 2>&1 &
//
// Then save base URL http://127.0.0.1:18080 and any API key in Settings.
package main

import (
	"flag"
	"log"
	"net"
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/recipeassistant/fakeanthropic"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:18080", "listen address (loopback only)")
	flag.Parse()
	host, _, err := net.SplitHostPort(*addr)
	if err != nil || (host != "127.0.0.1" && host != "localhost" && host != "::1") {
		log.Fatal("fakeanthropic: -addr must be a loopback address")
	}
	log.Fatal(http.ListenAndServe(*addr, fakeanthropic.Handler()))
}
