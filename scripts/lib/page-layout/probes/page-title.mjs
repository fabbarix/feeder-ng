// Probe "page-title" (in-page, B9-49, A11Y-01; P37). It fills
//   pageTitle: { title: string, h1: string | null }
// title is document.title; h1 is the text of the first visible <h1> (the page's own, or the visually hidden one of the board), null while a
// page has none (loading, failed). B9-55: path is location.pathname, the page actually shown (a scenario's setup can move from its start).
const source = `
(() => {
  const visible = (e) => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' }
  const h1 = [...document.querySelectorAll('h1')].find(visible)
  return { title: document.title, h1: h1 ? h1.textContent.replace(/\\s+/g, ' ').trim() : null, path: location.pathname }
})()`

export default { name: 'page-title', key: 'pageTitle', order: 195, source }
