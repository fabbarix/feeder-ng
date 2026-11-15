// Probe "dialog" (in-page, B9-03), moved verbatim from scripts/check-page-layout.mjs. It fills the metrics field
//   dialog: { x, w, vw, vh } of the open modal dialog, or null (P8; from 768 px). vh (w2c): on a short viewport the sheet is SHORT-02's
//   640 px centred dialog.
// P8 is about a modal dialog (centred from 768 px). A non-modal sheet (dialog.show(): the Scan screen's Price keypad, docked under the
// camera from 768 px by design, shop-scan-proposals.md 13.4) is not :modal and places itself.
const dialogProbe = `(() => { const d = document.querySelector('dialog[open]:modal'); if (!d) return null; const b = d.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width), vw: innerWidth, vh: innerHeight } })()`

export default { name: 'dialog', key: 'dialog', order: 80, minWidth: 768, soft: true, source: dialogProbe }
