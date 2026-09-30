(function (root) {
  'use strict';
  // Poll only observed active jobs. Timers live in the extension worker, never
  // in the hidden page. A Chrome alarm restores polling after worker restarts.
  class BackgroundWatch {
    static ALARM = 'chappy-active-jobs';
    constructor(api, clock = {}) {
      this.api = api;
      // Native browser timers require their global receiver, unlike the test clock.
      this.later = (clock.setTimeout || setTimeout).bind(root);
      this.cancel = (clock.clearTimeout || clearTimeout).bind(root);
      this.now = clock.now || Date.now;
      this.timers = new Map();
      this.running = new Set();
      this.queue = Promise.resolve();
    }
    enqueue(action) {
      const job = this.queue.then(action);
      this.queue = job.catch(() => {});
      return job;
    }
    key(id) {return 'watch-'+id;}
    schedule(id, delay = 2000) {
      if (this.timers.has(id) || this.running.has(id)) return;
      this.timers.set(id, this.later(() => {
        this.timers.delete(id);
        void this.probe(id).catch(() => {});
      }, delay));
    }
    async alarm() {
      const entries = await this.api.storage.session.get(null);
      const active = Object.keys(entries).some(k => /^watch-\d+$/.test(k));
      if (active) {
        if (!await this.api.alarms.get(BackgroundWatch.ALARM)) {
          await this.api.alarms.create(BackgroundWatch.ALARM, {periodInMinutes:0.5});
        }
      } else await this.api.alarms.clear(BackgroundWatch.ALARM);
    }
    track(id, state, documentId) {
      return this.enqueue(async () => {
        const key = this.key(id);
        const previous = (await this.api.storage.session.get(key))[key];
        const {enabled} = await this.api.storage.local.get({enabled:false});
        if (state === 'generating' && enabled) {
          const sameDocument = previous && previous.documentId === (documentId || '');
          if (!sameDocument) await this.api.storage.session.remove('probe-'+id);
          await this.api.storage.session.set({[key]:{documentId:documentId || '', startedAt:sameDocument ? previous.startedAt : this.now()}});
          this.schedule(id);
        } else if (!previous || !documentId || previous.documentId === documentId) {
          this.cancel(this.timers.get(id)); this.timers.delete(id);
          await this.api.storage.session.remove(key);
        }
        await this.alarm();
      });
    }
    async request(id, record) {
      let timeout;
      try {
        return await Promise.race([
          this.api.tabs.sendMessage(id, {type:'SCAN_NOW'}, record.documentId ? {documentId:record.documentId} : {frameId:0}),
          new Promise((_, reject) => {timeout=this.later(() => reject(new Error('no-reply')), 5000);})
        ]);
      } finally {this.cancel(timeout);}
    }
    async probe(id) {
      if (this.running.has(id)) return;
      this.running.add(id);
      let retry = 2000;
      try {
        await this.queue;
        const key = this.key(id);
        const record = (await this.api.storage.session.get(key))[key];
        if (!record) return;
        const {enabled} = await this.api.storage.local.get({enabled:false});
        if (!enabled) {await this.track(id, 'off', record.documentId); return;}
        const tab = await this.api.tabs.get(id);
        let result;
        if (tab.discarded || tab.frozen) {
          result = {issue:tab.discarded ? 'discarded' : 'frozen'}; retry = 30000;
        } else {
          try {
            const reply = await this.request(id, record);
            if (!reply?.ok) throw new Error('no-reply');
            result = {issue:'',visibility:reply.visibility === 'hidden' ? 'hidden' : 'visible',busy:reply.busy === true,ready:reply.ready === true};
          } catch {result={issue:'no-reply'}; retry=30000;}
        }
        // Diagnostic metadata only; never store the conversation text or URL.
        const current = (await this.api.storage.session.get(key))[key];
        if (current?.documentId === record.documentId && current.startedAt === record.startedAt) {
          await this.api.storage.session.set({['probe-'+id]:{...result,at:this.now()}});
        }
      } catch {
        await this.remove(id);
      } finally {
        this.running.delete(id);
        await this.queue;
        if ((await this.api.storage.session.get(this.key(id)))[this.key(id)]) this.schedule(id, retry);
      }
    }
    restore() {
      return this.enqueue(async () => {
        const {enabled} = await this.api.storage.local.get({enabled:false});
        const entries = await this.api.storage.session.get(null);
        for (const key of Object.keys(entries)) if (/^watch-\d+$/.test(key)) {
          const id = Number(key.slice(6));
          if (enabled) {
            try {await this.api.tabs.get(id);this.schedule(id, 0);}
            catch {this.cancel(this.timers.get(id));this.timers.delete(id);await this.api.storage.session.remove(key);await this.api.storage.session.remove('probe-'+id);}
          } else {this.cancel(this.timers.get(id));this.timers.delete(id);await this.api.storage.session.remove(key);await this.api.storage.session.remove('probe-'+id);}
        }
        await this.alarm();
      });
    }
    remove(id) {
      return this.enqueue(async () => {
        this.cancel(this.timers.get(id));this.timers.delete(id);
        await this.api.storage.session.remove(this.key(id));
        await this.api.storage.session.remove('probe-'+id);
        await this.alarm();
      });
    }
  }
  root.ChappyBackgroundWatch = BackgroundWatch;
  if (typeof module !== 'undefined') module.exports = BackgroundWatch;
})(globalThis);
