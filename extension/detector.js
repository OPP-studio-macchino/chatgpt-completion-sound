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
      this.userExplicit = null;
      this.active = false;
      this.cancelled = false;
      this.baseline = '';
      this.candidate = '';
      this.since = 0;
      this.candidateDelay = settleMs;
      this.seen = new Set();
      this.lifecycle = 0;
      this.incompatible = false;
      this.transportCompleted = false;
      this.transportCandidate = '';
      this.transportSince = 0;
      this.quietCandidate = '';
      this.quietSince = 0;
      this.generationEvidence = false;
      this.previousBusy = false;
      this.lifecycleInterrupted = false;
      this.startupHold = false;
      this.startupSince = 0;
      this.startupEvidenceLatched = false;
    }
    cancel() { this.startupHold = false; this.generationEvidence = false; this.quietCandidate = ''; this.lifecycle++; this.transportCompleted = false; this.transportCandidate = ''; this.cancelled = true; this.candidate = ''; this.candidateDelay = this.settleMs; }
    reset(baseline = '') { this.startupHold = false; this.startupEvidenceLatched = false; this.lifecycleInterrupted = false; this.generationEvidence = false; this.quietCandidate = ''; this.lifecycle++; this.transportCompleted = false; this.transportCandidate = ''; this.active = false; this.cancelled = false; this.candidate = ''; this.candidateDelay = this.settleMs; this.baseline = baseline; }
    stepDots(s, now, diagnostic) {
      if (this.route !== s.route) this.reset();
      this.route = s.route;
      if (this.dotsSession !== s.dotsSession) this.reset();
      this.dotsSession = s.dotsSession;
      const count = s.verifiedWorkSpinnerCount;
      const stable = Number.isInteger(count) && count >= 0;
      const startupEvidence = stable && count > 0 ? "spinner" :
        s.dotsTopStatus?.state === "thinking" ? "thinking" : s.visibleStop ? "stop" : "none";
      // One bounded bridge per startup; observations cannot extend its deadline.
      if (this.startupHold && now - this.startupSince >= 5000) this.startupHold = false;
      if (!this.startupHold && startupEvidence === "none") this.startupEvidenceLatched = false;
      let completed = null;
      if (!s.enabled) {
        this.reset();
      } else if (this.cancelled) {
        this.active = false;
        this.lifecycleInterrupted = false;
        if (stable && count === 0 && !s.busy) this.reset();
      } else if (s.error || s.blocked) {
        this.startupHold = false;
        this.startupEvidenceLatched = true;
        // Retain unresolved work, but invalidate all pre-interruption settling.
        if (this.active) this.lifecycleInterrupted = true;
        this.candidate = '';
      } else if (stable && count > 0) {
        this.startupHold = false;
        if (!this.active) {
          this.reset();
          this.active = true;
          // Local document correlation and sequence, never task prose.
          this.baseline = `${s.dotsSession}:dots:${this.lifecycle}`;
        }
        this.startupEvidenceLatched = true;
        this.lifecycleInterrupted = false;
        this.candidate = '';
      } else if (!stable) {
        // Invalid counts cannot establish an uninterrupted zero settle.
        this.candidate = '';
      } else if (this.active && !this.lifecycleInterrupted) {
        if (!this.candidate) {
          this.candidate = this.baseline;
          this.since = now;
          this.candidateDelay = 8000;
        } else if (now - this.since >= this.candidateDelay) {
          completed = this.baseline;
          this.active = false;
          this.candidate = '';
        }
      }
      if (s.enabled && !this.cancelled && !s.error && !s.blocked && !this.active && !completed &&
          !this.startupEvidenceLatched && (startupEvidence === "thinking" || startupEvidence === "stop")) {
        this.startupHold = true;
        this.startupSince = now;
        this.startupEvidenceLatched = true;
      }
      if (diagnostic) Object.assign(diagnostic, {startupHold:this.startupHold,
        startupHoldRemaining:this.startupHold ? Math.ceil(Math.max(0, 5000 - (now - this.startupSince)) / 1000) + "s" : "0s",
        startupEvidence, armedLifecycle:this.active, activeAfter:this.active,
        cancelledAfter:this.cancelled, candidatePresent:!!this.candidate, completed:!!completed,
        verifiedBlocked:!!s.blocked, verifiedError:!!s.error, lifecycleInterrupted:this.lifecycleInterrupted,
        zeroSettleActive:!!this.candidate, verifiedSpinnerCount:stable ? count : null});
      return completed;
    }

    step(s, now, diagnostic) {
      if (s.dots) return this.stepDots(s, now, diagnostic);
      const identity = completionIdentity(s);
      const activeBefore = this.active, lifecycleBefore = this.lifecycle;
      const initialized = this.route !== null;
      const transportEligible = this.active && !this.cancelled && this.route === s.route;
      if (this.transportCandidate !== identity || this.user !== s.user || this.route !== s.route || s.ready) this.transportCandidate = '';
      if (s.ready) this.transportCompleted = false;
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
        // Inferred search-unit identities can rotate or gain explicit roles
        // within a reply. Actual user-to-user changes start another lifecycle;
        // a ready inferred branch still suppresses historical answers.
        else if (userChanged && s.turn !== this.user && (!this.active ||
            (s.userExplicit !== false && this.userExplicit !== false) || (s.ready && s.userExplicit === false))) {
          this.reset(identity);
          // A newly inserted user turn can precede ChatGPT's stop/streaming controls.
          // Treat that DOM transition as generation start only while no final answer is ready.
          if (!s.ready) {this.active = true; this.baseline = '';}
        }
        this.route = s.route;
        this.user = s.user;
        this.userExplicit = s.userExplicit;
        if (promoted) {this.lifecycle++;this.transportCompleted = false;this.transportCandidate = '';}
        if (!s.enabled || s.error || s.blocked) { this.reset(identity); return null; }
        if (s.compatibility?.state === 'incompatible') {
          if (!this.incompatible) this.lifecycle++;
          this.incompatible = true;
          this.quietCandidate = '';
          this.generationEvidence = false;
          this.transportCompleted = false;
          this.candidate = '';
          this.transportCandidate = '';
          if (s.busy && !this.cancelled) this.active = true;
          return null;
        }
        this.incompatible = false;
        if (identity && this.seen.has(identity) && (s.busy || s.ready)) { this.reset(identity); return null; }
        // A new opaque turn without final controls is a fallback for missing busy/user metadata.
        if (!this.active && !this.cancelled && turnChanged && !s.ready && !this.seen.has(identity)) this.active = true;
        // Evidence belongs to the already-active lifecycle, independently of
        // the answer identity and DOM busy teardown.
        if (s.transportCompleted === true && !s.ready && transportEligible && this.lifecycle === lifecycleBefore) this.transportCompleted = true;
        // A sendable composer after observed generation is independent DOM
        // evidence even if streaming metadata survives Stop teardown. Otherwise
        // retain the existing transport-correlated quiet path.
        const quietEligible = this.generationEvidence && activeBefore && this.active && !this.cancelled &&
          this.lifecycle === lifecycleBefore && !promoted && !s.ready &&
          s.completionEligible === true && s.visibleStop === false && identity && identity !== this.baseline &&
          !this.seen.has(identity) && Number.isFinite(s.structuralChangedAt) &&
          (s.composerIdle === true || this.transportCompleted);
        if (!quietEligible) this.quietCandidate = '';
        else {
          if (this.quietCandidate !== identity) {
            this.quietCandidate = identity;
            this.quietSince = now;
          }
          this.quietSince = Math.max(this.quietSince, s.structuralChangedAt);
          if (now - this.quietSince >= (s.composerIdle === true ? 3000 : 6000)) {
            this.seen.add(identity);
            if (this.seen.size > 200) this.seen.delete(this.seen.values().next().value);
            this.reset(identity);
            completed = true;
            return identity;
          }
        }
        if (s.busy) {
          this.transportCandidate = '';
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
        if (!this.active || (!s.ready && !this.transportCompleted) || !identity || identity === this.baseline || this.seen.has(identity)) {
          this.transportCandidate = '';
          this.candidate = '';
          this.candidateDelay = this.settleMs;
          return null;
        }
        if (!s.ready) {
          this.candidate = '';
          this.candidateDelay = this.settleMs;
          if (this.transportCandidate !== identity) {
            this.transportCandidate = identity;
            this.transportSince = now;
            return null;
          }
          if (now - this.transportSince < 4000) return null;
        }
        const settleMs = Number.isFinite(s.settleMsOverride) && s.settleMsOverride >= 0 ? s.settleMsOverride : this.settleMs;
        const requiredDelay = s.provisional ? Math.max(this.settleMs, 4000) : settleMs;
        if (s.ready && this.candidate !== identity) {
          this.candidate = identity;
          this.candidateDelay = requiredDelay;
          this.since = now;
          return null;
        }
        if (s.ready) this.candidateDelay = Math.max(this.candidateDelay, requiredDelay);
        if (s.ready && now - this.since < this.candidateDelay) return null;
        this.seen.add(identity);
        if (this.seen.size > 200) this.seen.delete(this.seen.values().next().value);
        this.reset(identity);
        completed = true;
        return identity;
      } finally {
        if (!activeBefore && this.active && this.lifecycle === lifecycleBefore) this.lifecycle++;
        if (!this.active || this.cancelled || this.incompatible) this.generationEvidence = false;
        else if (s.visibleStop || (initialized && !routeChanged &&
            (!activeBefore || this.lifecycle !== lifecycleBefore) && (!s.busy || !this.previousBusy))) this.generationEvidence = true;
        this.previousBusy = s.busy;
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
