const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseHTML} = require(require.resolve('linkedom', {paths:[process.env.CHAPPY_DOM_DEPENDENCIES || __dirname]}));
const {read} = require('../extension/dom-reader.js');
const {row, panel} = require('./dots-activity-fixture.cjs');
const {dotsWorkSpinners} = require('../extension/dom-reader.js');
function fixture(html, visibility = 'visible') {
  const {document, window} = parseHTML(`<html><body>${html}</body></html>`);
  window.Element.prototype.getClientRects = () => [{}];
  window.getComputedStyle = e => ({display:e.hasAttribute('hidden') ? 'none' : e.style.display || 'block', visibility:e.style.visibility || 'visible', opacity:'1'});
  Object.defineProperty(document, 'visibilityState', {value:visibility});
  return document;
}
function snapshot(doc) {
  const diagnostic = {dom:{}};
  const snap = read(doc, '/dots/fixture', true, diagnostic);
  return snap;
}
test('dots verified guards use rendered modal structure and exact fixed metadata without prose reads', () => {
  for (const [html, blocked, error] of [
    ['<div role="dialog"></div>', false, false],
    ['<div role="dialog" aria-modal="false"></div>', false, false],
    ['<div role="dialog" aria-modal="true"></div>', true, false],
    ['<div role="alertdialog"></div>', true, false],
    ['<div role="alertdialog" hidden></div>', false, false],
    ['<div role="dialog" aria-modal="true" data-orbit-profile="true"></div>', false, false],
    ['<div role="alert">error</div>', false, false],
    ['<div role="status" data-status="failed"></div>', false, true],
    ['<div role="alert" data-state="失敗"></div>', false, true],
    ['<div role="alert" aria-label="エラー"></div>', false, true],
    ['<div role="alert" data-state="error" hidden></div>', false, false],
    ['<div role="alert" data-state="PRIVATE_error" aria-label="PRIVATE_ERROR"></div>', false, false],
    ['<div data-state="error"></div>', false, false]
  ]) {
    const doc = fixture(html);
    for (const node of [doc, ...doc.querySelectorAll('*')]) {
      for (const name of ['textContent', 'innerText', 'innerHTML', 'value']) {
        Object.defineProperty(node, name, {get() {throw Error(`Forbidden read: ${name}`);}});
      }
    }
    const diagnostic = {dom:{}};
    const s = read(doc, '/dots/fixture', true, diagnostic);
    assert.equal(s.blocked, blocked, html);
    assert.equal(s.error, error, html);
    assert.equal(diagnostic.dom.verifiedBlocked, blocked);
    assert.equal(diagnostic.dom.verifiedError, error);
    assert.doesNotMatch(JSON.stringify({s, diagnostic}), /PRIVATE/);
  }
});

test('dots interruption with a returning spinner resumes the same lifecycle and a fresh settle', () => {
  const Detector = require('../extension/detector.js');
  for (const guard of ['blocked', 'error']) {
    const detector = new Detector();
    const s = {...snapshot(fixture(panel([true]))), dotsSession:'synthetic-document'};
    detector.step(s, 100);
    const lifecycle = detector.lifecycle, baseline = detector.baseline;
    s.verifiedWorkSpinnerCount = 0;
    detector.step(s, 200);
    s[guard] = true;
    assert.equal(detector.step(s, 300), null);
    assert.equal(detector.step(s, 30000), null);
    s[guard] = false;
    s.verifiedWorkSpinnerCount = 1;
    assert.equal(detector.step(s, 31000), null);
    assert.equal(detector.lifecycle, lifecycle);
    assert.equal(detector.baseline, baseline);
    assert.equal(detector.lifecycleInterrupted, false);
    s.verifiedWorkSpinnerCount = 0;
    assert.equal(detector.step(s, 32000), null);
    assert.equal(detector.step(s, 39999), null);
    assert.equal(detector.step(s, 40000), baseline);
    assert.equal(detector.step(s, 60000), null);
  }
});

test('dots spinner arming cannot cross document sessions', () => {
  const Detector = require('../extension/detector.js');
  const detector = new Detector();
  const s = {...snapshot(fixture(panel([true]))), dotsSession:'document-one'};
  assert.equal(detector.step(s, 100), null);
  assert.equal(detector.active, true);
  s.verifiedWorkSpinnerCount = 0;
  s.dotsVerifiedWorkSpinners = {structureValid:true};
  assert.equal(detector.step(s, 200), null);
  s.dotsSession = 'document-two';
  assert.equal(detector.step(s, 10000), null);
  assert.equal(detector.active, false);
  assert.equal(detector.step(s, 20000), null);
});

test('page-wide spinner union excludes composer/nav and unsupported standalone shapes without reading any text', () => {
  const doc = fixture('<main><article>' + row(true) + '</article><section>' + row(true) + '</section>' +
    '<nav>' + row(true) + '</nav><div data-codex-composer-root>' + row(true) + '</div>' +
    '<article hidden>' + row(true) + '</article>' +
    row(true).replace('motion-safe:animate-spin', 'animate-spin') +
    row(true).replace('<path></path>'.repeat(9), '<circle></circle>') + '</main>');
  for (const node of [doc, ...doc.querySelectorAll('*')]) {
    for (const name of ['innerText','textContent','value','innerHTML','className']) {
      Object.defineProperty(node, name, {get() {throw Error(`Forbidden read: ${name}`);}});
    }
    if (!node.getAttribute) continue;
    const get = node.getAttribute.bind(node);
    node.getAttribute = name => {
      if (['aria-label','title','id','href','src','data-slot','data-codex-composer-root'].includes(name)) throw Error(`Forbidden attribute: ${name}`);
      return get(name);
    };
  }
  assert.deepEqual(dotsWorkSpinners(doc, {available:false, rows:0}), {
    verifiedWorkSpinnerCount:3, bySignature:{sharedAnimateSpin:3, recentActivityVerified:0, ninePathVerified:2}
  });
});


test('page-wide spinner evidence families and conservative non-work exclusions', () => {
  const spin = '<svg class="motion-safe:animate-spin"><circle></circle></svg>';
  const primitive = '<svg class="motion-safe:animate-spin">' + '<path></path>'.repeat(9) + '</svg>';
  const work = '<button>' + spin + '</button><div role="button">' + spin + '</div>' + primitive +
    panel([]).replace('<section>', '<section>' + spin);
  const excluded = ['nav', 'aside', 'div role="navigation"', 'div role="complementary"',
    'div data-codex-composer-root', 'picture', 'div role="img"', 'div data-avatar',
    'div hidden', 'div style="display:none"'].map(tag =>
      '<' + tag + '><button>' + primitive + '</button></' + tag.split(' ')[0] + '>').join('');
  const composerForm = '<form><textarea></textarea><button>' + primitive + '</button></form>';
  assert.deepEqual(dotsWorkSpinners(fixture(work + excluded + composerForm + spin)), {
    verifiedWorkSpinnerCount:4,
    bySignature:{sharedAnimateSpin:4, recentActivityVerified:1, ninePathVerified:1}
  });
});
