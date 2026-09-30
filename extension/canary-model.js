(function(root) {
  'use strict';
  const STATES = ['off','waiting','watching','generating','complete','error'];
  const REASONS = ['MAIN_MISSING','REQUEST_AMBIGUOUS','STRUCTURE_UNKNOWN','FINAL_CONTROLS_DEFERRED','MARKDOWN_COPY_MISSING','ROLE_SIGNALS_MISSING'];
  function health(value) {
    if (!value || !['healthy','degraded','incompatible'].includes(value.state) ||
        value.profileId !== 'chatgpt-dom' || value.revision !== 1 || value.revisionId !== 'packaged-1' ||
        !Array.isArray(value.reasons) || value.reasons.length > 6 || !value.reasons.every(r=>REASONS.includes(r)) ||
        !Array.isArray(value.matched) || value.matched.length > 14 || !value.matched.every(s=>root.ChappyCompatibility.SIGNALS.includes(s))) throw Error('HEALTH_INVALID');
    return {state:value.state,profileId:value.profileId,revision:value.revision,revisionId:value.revisionId,
      reasons:[...value.reasons],matched:[...value.matched]};
  }
  class Canary {
    constructor(now) {
      if (!Number.isSafeInteger(now) || now < 0 || now > 4102444800000) throw Error('TIME_INVALID');
      this.result={schemaVersion:1,extensionVersion:'0.3.0',status:'pending',reason:'WAITING_FOR_BASELINE',startedAt:now,
        humanHeardOnce:false,stages:[],samples:[]};
    }
    fail(reason) {this.result.status='fail';this.result.reason=reason;return this.result;}
    observe(input) {
      const r=this.result;
      if (r.status === 'fail') return r;
      if (!Number.isSafeInteger(input.at) || input.at < (r.samples.at(-1)?.at ?? r.startedAt) || input.at > 4102444800000 ||
          !STATES.includes(input.state) || !['visible','hidden'].includes(input.visibility) || typeof input.unfocused !== 'boolean' ||
          !['none','yellow','blue','other'].includes(input.color) || !Number.isSafeInteger(input.playbackDelta) || input.playbackDelta < 0 || input.playbackDelta > 1000000) return this.fail('SAMPLE_INVALID');
      let compatibility;try {compatibility=health(input.compatibility);} catch {return this.fail('HEALTH_INVALID');}
      // Explicit projection: no raw diagnostics, page data, tab IDs, URLs or filenames.
      const s={at:input.at,state:input.state,visibility:input.visibility,unfocused:input.unfocused,
        color:input.color,playbackDelta:input.playbackDelta,compatibility};
      r.samples.push(s);if (r.samples.length > 120) r.samples.shift();
      if (s.at-r.startedAt > 600000 && r.status !== 'pass') return this.fail('TIMEOUT');
      if (s.playbackDelta > 1) return this.fail('DUPLICATE_PLAYBACK');
      const mark=name=>r.stages.push({name,at:s.at});
      const stage=r.stages.length;
      if (!stage) {
        if (!['waiting','watching'].includes(s.state) || s.playbackDelta !== 0 || s.color === 'blue') return this.fail('BASELINE_INVALID');
        mark('waiting');r.reason='WAITING_FOR_GENERATION';
      } else if (stage === 1 && s.state === 'generating' && s.color === 'yellow') {
        mark('generating-yellow');r.reason='WAITING_FOR_BACKGROUND';
      } else if (stage === 2 && s.state === 'generating' && s.color === 'yellow' && s.visibility === 'hidden' && s.unfocused) {
        mark('background-unfocused');r.reason='WAITING_FOR_COMPLETION';
      }
      if (s.playbackDelta && r.stages.length < 3) return this.fail('PLAYBACK_BEFORE_BACKGROUND');
      if (s.state === 'complete' && r.stages.length < 3) return this.fail('COMPLETED_BEFORE_BACKGROUND');
      if (r.stages.length >= 3 && (s.visibility !== 'hidden' || !s.unfocused)) return this.fail('TARGET_REFOCUSED');
      if (s.state === 'error' || s.state === 'off') return this.fail('JOB_INTERRUPTED');
      if (r.stages.length === 3 && s.state === 'complete' && s.color === 'blue' && s.playbackDelta === 1 && compatibility.state !== 'incompatible') {
        mark('complete-blue-once');r.reason='WAITING_FOR_QUIET_WINDOW_AND_HUMAN';
      }
      if (r.stages.length === 4) {
        if (s.state !== 'complete' || s.color !== 'blue' || s.playbackDelta !== 1 || compatibility.state === 'incompatible') return this.fail('COMPLETION_UNSTABLE');
        if (s.at-r.stages[3].at >= 5000 && r.humanHeardOnce) {r.status='pass';r.reason='OBSERVED';}
      }
      return r;
    }
    confirmAudio(heard) {
      this.result.humanHeardOnce=heard === true && this.result.stages.length === 4;
      if (!this.result.humanHeardOnce && this.result.status === 'pass') {
        this.result.status='pending';this.result.reason='WAITING_FOR_QUIET_WINDOW_AND_HUMAN';
      }
    }
  }
  root.ChappyCanary={Canary};
  if (typeof module !== 'undefined') module.exports=root.ChappyCanary;
})(globalThis);
