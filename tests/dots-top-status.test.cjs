const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseHTML} = require(require.resolve('linkedom', {paths:[process.env.CHAPPY_DOM_DEPENDENCIES || __dirname]}));
const {dotsTopStatus} = require('../extension/dom-reader.js');
const button = body => `<button class="group/aeon-status">${body}</button>`;
const panel = body => `<div role="dialog" data-orbit-profile="true" data-state="open">${body}</div>`;
function fixture(html, visibility = 'visible') {
  const {document, window} = parseHTML(`<html><body>${html}</body></html>`);
  window.Element.prototype.getClientRects = () => [{}];
  window.getComputedStyle = e => ({display:e.style.display || 'block', visibility:e.style.visibility || 'visible'});
  Object.defineProperty(document, 'visibilityState', {value:visibility});
  return document;
}
test('top status recognizes only fixed rendered labels including nested and hidden-tab DOM', () => {
  for (const [label, state] of [['Thinking','thinking'], ['思考中','thinking'], ['Active','active'], ['有効','active']]) {
    for (const visibility of ['visible','hidden']) {
      const result = dotsTopStatus(fixture(panel(button(`<span><span>${label}</span></span><span><svg></svg></span>`)), visibility));
      assert.deepEqual(result, {state, matchedVisibleStatusButtons:1, ignoredHiddenStatusButtons:0, ignoredHiddenNodes:0, spans:3, svgs:1});
    }
  }
});
test('invisible sizing placeholders never yield Active and hidden status buttons are counted', () => {
  for (const attr of ['class="invisible"','hidden','aria-hidden="true"','style="display:none"','style="visibility:hidden"']) {
    const html = panel(`<div ${attr}>${button('<span>有効</span>')}</div>` + button(`<span ${attr}>有効</span><span>思考中</span>`));
    const doc = fixture(html);
    for (const node of doc.querySelectorAll(`[hidden] span, .invisible span, [aria-hidden="true"] span, [style] span`)) {
      for (const child of node.childNodes) Object.defineProperty(child, 'nodeValue', {get() {throw Error('Hidden text read');}});
    }
    assert.deepEqual(dotsTopStatus(doc), {state:'thinking', matchedVisibleStatusButtons:1, ignoredHiddenStatusButtons:1, ignoredHiddenNodes:1, spans:1, svgs:0});
  }
  assert.equal(dotsTopStatus(fixture(panel(button('<span class="invisible">有効</span><span>PRIVATE_UNKNOWN</span>')))).state, 'unknown');
});
test('unknown labels never leak and missing or conflicting controls fail closed', () => {
  const unknown = dotsTopStatus(fixture(panel(button('<span>PRIVATE_TEXT https://private.invalid</span>'))));
  assert.equal(unknown.state, 'unknown');
  assert.doesNotMatch(JSON.stringify(unknown), /PRIVATE|https/);
  for (const html of ['', button('Thinking'), panel(button('Thinking')).replace('data-state="open"','data-state="closed"'), `<div hidden>${panel(button('Thinking'))}</div>`]) {
    assert.equal(dotsTopStatus(fixture(html)).state, 'missing');
  }
  for (const html of [panel(button('Thinking') + button('Active')), panel(button('Thinking')) + panel(button('Active')), panel(button('<span>Thinking</span><span>Active</span>'))]) {
    assert.equal(dotsTopStatus(fixture(html)).state, 'ambiguous');
  }
});
test('traversal budgets fail closed and conversation text is never scanned', () => {
  for (const body of ['<span>'.repeat(5)+'Thinking'+'</span>'.repeat(5), 'Thinking'+'<span></span>'.repeat(16)]) {
    assert.equal(dotsTopStatus(fixture(panel(button(body)))).state, 'unknown');
  }
  const doc = fixture('<article>PRIVATE_CONVERSATION</article>' + panel(button('<span>Thinking</span>')));
  for (const child of doc.querySelector('article').childNodes) Object.defineProperty(child, 'nodeValue', {get() {throw Error('Conversation read');}});
  assert.equal(dotsTopStatus(doc).state, 'thinking');
  const inside = fixture(panel(button('<article>Thinking</article>')));
  for (const child of inside.querySelector('article').childNodes) Object.defineProperty(child, 'nodeValue', {get() {throw Error('Conversation read');}});
  assert.equal(dotsTopStatus(inside).state, 'unknown');
});
