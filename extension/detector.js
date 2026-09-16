(function (root) {
  'use strict';
  // The state machine receives DOM metadata only, never conversation text.
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
    reset() { this.active = false; this.cancelled = false; this.candidate = ''; this.candidateDelay = this.settleMs; this.baseline = ''; }
    step(s, now) {
      // Home -> newly created conversation is a normal transition during generation.
      const promoted = this.route !== null && !this.route.includes('/c/') && s.route.includes('/c/') &&
        this.active && (!this.user || this.user === s.user);
      const routeChanged = this.route !== null && this.route !== s.route && !promoted;
      const userChanged = !routeChanged && !!this.user && !!s.user && this.user !== s.user;
      if (routeChanged) this.reset();
      else if (userChanged) {
        this.reset();
        // A newly inserted user turn can precede ChatGPT's stop/streaming controls.
        // Treat that DOM transition as generation start only while no final answer is ready.
        if (!s.ready) {this.active = true; this.baseline = '';}
      }
      this.route = s.route;
      this.user = s.user;
      if (!s.enabled || s.error || s.blocked) { this.reset(); return null; }
      if (s.busy) {
        if (!this.active) {
          this.active = true;
          this.baseline = s.ready ? s.message : '';
        }
        this.candidate = '';
        this.candidateDelay = this.settleMs;
        return null;
      }
      if (this.cancelled) { this.reset(); return null; }
      if (!this.active || !s.ready || !s.message || s.message === this.baseline || this.seen.has(s.message)) {
        this.candidate = '';
        this.candidateDelay = this.settleMs;
        return null;
      }
      const requiredDelay = s.provisional ? Math.max(this.settleMs, 4000) : this.settleMs;
      if (this.candidate !== s.message) {
        this.candidate = s.message;
        this.candidateDelay = requiredDelay;
        this.since = now;
        return null;
      }
      this.candidateDelay = Math.max(this.candidateDelay, requiredDelay);
      if (now - this.since < this.candidateDelay) return null;
      this.seen.add(s.message);
      if (this.seen.size > 200) this.seen.delete(this.seen.values().next().value);
      this.reset();
      return s.message;
    }
  }
  root.ChappyCompletionDetector = CompletionDetector;
  if (typeof module !== 'undefined') module.exports = CompletionDetector;
})(globalThis);
