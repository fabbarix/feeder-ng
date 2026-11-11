# Third-party notices

The Feeder itself is released under the licence in [LICENSE](LICENSE). It includes and links the open-source software listed below, each under its own licence. This file is copied into the container image as `/THIRD_PARTY_NOTICES.md`.

Licences were read from the Go module cache (`go.mod` requires) and from the installed npm packages (`pnpm -C web licenses list --prod`). Versions are the ones pinned in `go.mod` and `web/pnpm-lock.yaml`. Development-only tooling (compilers, linters, test runners, bundler) is not shipped and is not listed.

## Go modules

Every `require` in `go.mod`, direct and indirect.

| module | version | SPDX licence | notes |
|---|---|---|---|
| cloud.google.com/go/compute/metadata | v0.5.0 | Apache-2.0 |  |
| github.com/HugoSmits86/nativewebp | v1.3.0 | MIT |  |
| github.com/SherClockHolmes/webpush-go | v1.4.0 | MIT |  |
| github.com/anthropics/anthropic-sdk-go | v1.66.0 | MIT | Anthropic SDK (Recipe Assistant) |
| github.com/bahlo/generic-list-go | v0.2.0 | BSD-3-Clause | Anthropic SDK dependency |
| github.com/buger/jsonparser | v1.1.2 | MIT | Anthropic SDK / invopop dependency |
| github.com/dustin/go-humanize | v1.1.0 | MIT | MIT (confirmed from the module licence file) |
| github.com/golang-jwt/jwt/v5 | v5.2.1 | MIT | MIT (confirmed from the module licence file) |
| github.com/google/uuid | v1.6.0 | BSD-3-Clause |  |
| github.com/hashicorp/go-immutable-radix | v1.3.1 | MPL-2.0 | MPL-2.0, unmodified; source: https://github.com/hashicorp/go-immutable-radix |
| github.com/hashicorp/go-memdb | v1.3.5 | MPL-2.0 | MPL-2.0, unmodified; source: https://github.com/hashicorp/go-memdb |
| github.com/hashicorp/golang-lru | v0.5.4 | MPL-2.0 | MPL-2.0, unmodified; source: https://github.com/hashicorp/golang-lru |
| github.com/invopop/jsonschema | v0.14.0 | MIT | Anthropic SDK dependency |
| github.com/mattn/go-isatty | v0.0.24 | MIT | MIT (Expat) |
| github.com/ncruces/go-strftime | v1.1.0 | MIT |  |
| github.com/pb33f/ordered-map/v2 | v2.3.1 | Apache-2.0 | Anthropic SDK dependency |
| github.com/remyoudompheng/bigfft | v0.0.0-20230129092748-24d4a6f8daec | BSD-3-Clause |  |
| github.com/santhosh-tekuri/jsonschema/v6 | v6.0.3 | Apache-2.0 |  |
| github.com/standard-webhooks/standard-webhooks/libraries | v0.0.1 | MIT | Anthropic SDK dependency |
| github.com/tidwall/gjson | v1.18.0 | MIT | Anthropic SDK dependency |
| github.com/tidwall/match | v1.1.1 | MIT | Anthropic SDK dependency |
| github.com/tidwall/pretty | v1.2.1 | MIT | Anthropic SDK dependency |
| github.com/tidwall/sjson | v1.2.5 | MIT | Anthropic SDK dependency |
| go.yaml.in/yaml/v4 | v4.0.0-rc.2 | MIT AND Apache-2.0 | MIT and Apache-2.0; its NOTICE is reproduced below |
| golang.org/x/crypto | v0.58.0 | BSD-3-Clause |  |
| golang.org/x/image | v0.48.0 | BSD-3-Clause |  |
| golang.org/x/net | v0.62.0 | BSD-3-Clause |  |
| golang.org/x/oauth2 | v0.38.0 | BSD-3-Clause |  |
| golang.org/x/sync | v0.25.0 | BSD-3-Clause |  |
| golang.org/x/sys | v0.50.0 | BSD-3-Clause |  |
| golang.org/x/text | v0.44.0 | BSD-3-Clause |  |
| modernc.org/libc | v1.80.1 | BSD-3-Clause | Transpiled musl libc and other notices; see its LICENSE-3RD-PARTY.md |
| modernc.org/mathutil | v1.7.1 | BSD-3-Clause |  |
| modernc.org/memory | v1.12.1 | BSD-3-Clause | Includes mmap-go (BSD-3-Clause) and Go sources (BSD-3-Clause) |
| modernc.org/sqlite | v1.62.0 | BSD-3-Clause | Also bundles SQLite (public domain), sqlite-vec (MIT) and other notices; see its LICENSE-3RD-PARTY.md |

### Go modules for build and test only

These sit in `go.mod` (the BDD tests use godog) but are not compiled into the server binary.

| module | version | SPDX licence | notes |
|---|---|---|---|
| github.com/cucumber/gherkin/go/v42 | v42.0.0 | MIT | Build and test only |
| github.com/cucumber/godog | v0.16.0 | MIT | Build and test only |
| github.com/cucumber/messages/go/v34 | v34.2.0 | MIT | Build and test only |
| github.com/spf13/pflag | v1.0.10 | BSD-3-Clause | Build and test only (godog) |

### MPL-2.0 modules (hashicorp)

`github.com/hashicorp/go-immutable-radix`, `github.com/hashicorp/go-memdb` and `github.com/hashicorp/golang-lru` are under the Mozilla Public License 2.0, a file-level copyleft licence. They are used unmodified, so the Feeder's own code stays under its own licence. The complete source of the versions used is available at:

- https://github.com/hashicorp/go-immutable-radix (v1.3.1)
- https://github.com/hashicorp/go-memdb (v1.3.5)
- https://github.com/hashicorp/golang-lru (v0.5.4)

The licence text is at https://www.mozilla.org/MPL/2.0/ and in each module's `LICENSE` file.

### go.yaml.in/yaml/v4 NOTICE

`go.yaml.in/yaml/v4` is covered by MIT and Apache-2.0 and ships a `NOTICE` file, reproduced here as the Apache-2.0 licence requires:

```
Copyright 2011-2016 Canonical Ltd.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

### SQLite and musl

`modernc.org/sqlite` is a transpiled SQLite (public domain, see its `LICENSE-SQLITE`) and also carries the sqlite-vec notice (MIT). `modernc.org/libc` carries musl libc and other upstream notices. Both are listed in full in the `LICENSE-3RD-PARTY.md` file of each module.

## npm packages (shipped in the web bundle)

The production `dependencies` of `web/package.json`.

| package | version | SPDX licence | notes |
|---|---|---|---|
| @fontsource/figtree | 5.3.0 | OFL-1.1 | Figtree font files |
| @phosphor-icons/react | 2.1.10 | MIT | icons |
| @tanstack/react-query | 5.107.1 | MIT |  |
| @zxing/browser | 0.2.1 | MIT | barcode scanner |
| idb | 8.0.4 | ISC |  |
| react | 19.3.1 | MIT |  |
| react-dom | 19.3.1 | MIT |  |
| react-router-dom | 7.18.5 | MIT |  |

### Transitive npm packages in the bundle

| package | version | SPDX licence |
|---|---|---|
| @tanstack/query-core | 5.107.1 | MIT |
| cookie | 1.1.1 | MIT |
| react-router | 7.18.5 | MIT |
| scheduler | 0.28.0 | MIT |
| set-cookie-parser | 2.7.3 | MIT |
| ts-custom-error | 3.3.1 | MIT |
| @zxing/library | 0.23.0 | Apache-2.0 |
| @zxing/text-encoding | 0.9.0 | Unlicense OR Apache-2.0 |
| csstype | 3.2.3 | MIT |
| @types/react | 19.3.0 | MIT |

`@zxing/text-encoding` is offered under `Unlicense OR Apache-2.0`; the Feeder uses it under Apache-2.0. `@types/react` and `csstype` are type definitions and add nothing to the bundle.

## HEIC support (to be added)

<!-- PLACEHOLDER (REL-1): the HEIC decoder is added by another team. When it merges, add these here:
     gen2brain/h265 v0.2.4 (MIT), with the carried notices of rust_h265 (Apache-2.0 OR MIT) and oxideav-h265 (MIT). -->

Not yet included: HEIC photo support (`github.com/gen2brain/h265` v0.2.4, MIT, which carries the notices of `rust_h265` under Apache-2.0 or MIT and `oxideav-h265` under MIT) will be listed here when it is added.
