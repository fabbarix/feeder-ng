// b8-shop: the Feeder symbol (docs/brand/master/mark-small.svg), inline. Decorative: the word beside it names the app. Its colours
// come from the classes in shell.css (the accent body, the brand heart), so the markup holds no colour.
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <g transform="translate(-27.66 -10.48) scale(1.1080)">
        <path className="brand-mark__body" d="M84 236 A172 52 0 0 1 428 236 Z M164 272 H348 A60 60 0 0 1 408 332 V380 A60 60 0 0 1 348 440 H164 A60 60 0 0 1 104 380 V332 A60 60 0 0 1 164 272 Z M84 292 H100 A28 28 0 0 1 128 320 V320 A28 28 0 0 1 100 348 H84 A28 28 0 0 1 56 320 V320 A28 28 0 0 1 84 292 Z M412 292 H428 A28 28 0 0 1 456 320 V320 A28 28 0 0 1 428 348 H412 A28 28 0 0 1 384 320 V320 A28 28 0 0 1 412 292 Z" />
        <path className="brand-mark__heart" d="M 256 164 C 176 118 176 48 220 42 C 240 40 252 52 256 66 C 260 52 272 40 292 42 C 336 48 336 118 256 164 Z" />
      </g>
    </svg>
  )
}
