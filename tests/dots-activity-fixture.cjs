// Synthetic structure from the bounded live inspection; no live labels or IDs.
const row = running => `<button aria-label="PRIVATE_TASK"><span aria-hidden="true">${running
  ? '<span><svg aria-hidden="true" class="motion-safe:animate-spin">' + '<path></path>'.repeat(9) + '</svg></span>'
  : '<svg aria-hidden="true"><path></path></svg>'}</span><span>PRIVATE_TASK</span><svg aria-hidden="true"><path></path></svg></button>`;
const panel = (states, heading = '最近のアクティビティ') => `<div role="dialog" data-orbit-profile="true" data-state="open" aria-modal="false"><h2>PRIVATE_PROFILE</h2><div><section><header><button aria-expanded="true"><span>${heading}</span><svg><path></path></svg></button></header><div aria-hidden="false"><div><div><div data-slot="synthetic-list">${states.map(row).join('')}</div><button aria-busy="false"><span>PRIVATE_MORE</span></button></div></div></div></section></div></div>`;
module.exports = {row, panel};
