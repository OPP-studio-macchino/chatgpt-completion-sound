(function (root) {
  'use strict';
  // The state machine receives DOM metadata only, never conversation text.
  function completionIdentity(s) {
    return s.turn || s.message || '';
  }

  class CompletionDetector {
    constructor(settleMs = 2000) {
      this.settleMs = settleMs;
      this.route = null;
      this.user = null;
      this.active = false;
      this.cancelled = false;
      this.baseline = '';
      this.candidate = '';
      this.since = 0;
      this.candidateDelay = settleMs;
      this.seen = new Set();
    }
    cancel() { this.cancelled = true; this.candidate = ''; this.candidateDelay = this.settleMs; }
    reset(baseline = '') { this.active = false; this.cancelled = false; this.candidate = ''; this.candidateDelay = this.settleMs; this.baseline = baseline; }
    step(s, now, diagnostic) {
      const identity = completionIdentity(s);
      // Home -> newly created conversation is a normal transition during generation.
      const promoted = this.route !== null && !this.route.includes('/c/') && s.route.includes('/c/') &&
        this.active && (!this.user || this.user === s.user);
      const routeChanged = this.route !== null && this.route !== s.route && !promoted;
      const userChanged = !routeChanged && !!this.user && !!s.user && this.user !== s.user;
      const turnChanged = !routeChanged && !!s.turn && !!this.baseline && identity !== this.baseline;
      if (diagnostic) Object.assign(diagnostic, {
        routeChanged:!!routeChanged, promoted:!!promoted, userChanged, turnChanged,
        identitySeen:this.seen.has(identity), activeBefore:this.active,
        cancelledBefore:this.cancelled, baselinePresentBefore:!!this.baseline
      });
      let completed = false;
      try {
        if (routeChanged) this.reset(identity);
        else if (userChanged) {
          this.reset(identity);
          // A newly inserted user turn can precede ChatGPT's stop/streaming controls.
          // Treat that DOM transition as generation start only while no final answer is ready.
          if (!s.ready) {this.active = true; this.baseline = '';}
        }
        this.route = s.route;
        this.user = s.user;
        if (!s.enabled || s.error || s.blocked) { this.reset(identity); return null; }
        if (s.compatibility?.state === 'incompatible') {
          this.candidate = '';
          if (s.busy && !this.cancelled) this.active = true;
          return null;
        }
        if (identity && this.seen.has(identity) && (s.busy || s.ready)) { this.reset(identity); return null; }
        // A new opaque turn without final controls is a fallback for missing busy/user metadata.
        if (!this.active && !this.cancelled && turnChanged && !s.ready && !this.seen.has(identity)) this.active = true;
        if (s.busy) {
          if (!this.active) {
            this.active = true;
            this.baseline = s.ready ? identity : '';
          }
          this.candidate = '';
          this.candidateDelay = this.settleMs;
          return null;
        }
        if (this.cancelled) { this.reset(identity); return null; }
        if (!this.active) this.baseline = identity || this.baseline;
        if (!this.active || !s.ready || !identity || identity === this.baseline || this.seen.has(identity)) {
          this.candidate = '';
          this.candidateDelay = this.settleMs;
          return null;
        }
        const settleMs = Number.isFinite(s.settleMsOverride) && s.settleMsOverride >= 0 ? s.settleMsOverride : this.settleMs;
        const requiredDelay = s.provisional ? Math.max(this.settleMs, 4000) : settleMs;
        if (this.candidate !== identity) {
          this.candidate = identity;
          this.candidateDelay = requiredDelay;
          this.since = now;
          return null;
        }
        this.candidateDelay = Math.max(this.candidateDelay, requiredDelay);
        if (now - this.since < this.candidateDelay) return null;
        this.seen.add(identity);
        if (this.seen.size > 200) this.seen.delete(this.seen.values().next().value);
        this.reset(identity);
        completed = true;
        return identity;
      } finally {
        if (diagnostic) Object.assign(diagnostic, {
          activeAfter:this.active, cancelledAfter:this.cancelled, baselinePresentAfter:!!this.baseline,
          candidatePresent:!!this.candidate, completed
        });
      }
    }
  }
  root.ChappyCompletionDetector = CompletionDetector;
  if (typeof module !== 'undefined') module.exports = CompletionDetector;
})(globalThis);
