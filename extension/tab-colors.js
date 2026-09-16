(function (root) {
  'use strict';
  const LOOKS = {
    generating: {title:'チャッピー · 作業中', color:'yellow'},
    complete: {title:'チャッピー · 完了', color:'blue'}
  };
  // Serialize group edits separately from audio: long WAVs must not delay colors.
  class TabColors {
    constructor(api) {this.api = api; this.queue = Promise.resolve();}
    enqueue(action) {
      const job = this.queue.then(action);
      this.queue = job.catch(() => {});
      return job;
    }
    set(tabId, state, metadata = {}) {return this.enqueue(() => this.update(tabId, state, false, metadata));}
    ownerKey(tabId) {return '_chappy-owner-'+tabId;}
    legacyMigrationKey() {return '_chappy-legacy-owner-migration-0.2.9';}
    async migrateLegacyOwners() {
      return this.enqueue(async () => {
        const migrationKey = this.legacyMigrationKey();
        const local = await this.api.storage.local.get(null);
        if (local[migrationKey]) return 0;
        const history = ['0.2.4','0.2.5','0.2.6','0.2.7'].some(v => local['_chappy-legacy-owner-migration-'+v] === true);
        const knownGroups = new Set(Object.entries(local).filter(([k,v]) => /^_chappy-owner-\d+$/.test(k) && Number.isInteger(v?.groupId)).map(([,v]) => v.groupId));
        let migrated = 0;
        const recoveredIds = new Set();
        if (history || knownGroups.size) {
          for (const tab of await this.api.tabs.query({})) {
            if (!Number.isInteger(tab.id) || tab.pinned || tab.groupId === -1 || (Number.isInteger(tab.splitViewId) && tab.splitViewId !== -1)) continue;
            if (local[this.ownerKey(tab.id)]) continue;
            try {
              const group = await this.api.tabGroups.get(tab.groupId);
              const members = await this.api.tabs.query({groupId:tab.groupId});
              const canonical = Object.values(LOOKS).some(look => (group.title || '') === look.title && group.color === look.color);
              if (group.shared || !canonical || members.length !== 1 || members[0].id !== tab.id) continue;
              if (!history && !knownGroups.has(tab.groupId)) continue;
              await this.rememberOwner(tab.id,{groupId:tab.groupId,title:group.title || '',color:group.color});
              recoveredIds.add(tab.id);
              migrated++;
            } catch {}
          }
        }
        const entries = await this.api.storage.session.get(null);
        let eligible = 0;
        for (const [key, record] of Object.entries(entries)) {
          if (!/^tab-\d+$/.test(key) || record?.userOverride || !/^0\.2\.[0-8]$/.test(record?.version || '')) continue;
          eligible++;
          const tabId = Number(key.slice(4));
          try {
            const tab = await this.api.tabs.get(tabId);
            if (tab.pinned || tab.groupId === -1 || (Number.isInteger(tab.splitViewId) && tab.splitViewId !== -1)) continue;
            if ((await this.api.storage.local.get(this.ownerKey(tabId)))[this.ownerKey(tabId)]) {
              if (recoveredIds.has(tabId) && LOOKS[record.state]) await this.update(tabId,record.state,false,{version:record.version || '',visibility:record.visibility || 'visible'});
              continue;
            }
            const group = await this.api.tabGroups.get(tab.groupId);
            const members = await this.api.tabs.query({groupId:tab.groupId});
            const canonical = Object.values(LOOKS).some(look => (group.title || '') === look.title && group.color === look.color);
            if (group.shared || !canonical || members.length !== 1 || members[0].id !== tabId) continue;
            const owner = {groupId:tab.groupId,title:group.title || '',color:group.color};
            const adopted = {...record,owner,colorSkipped:'',colorError:''};
            await this.rememberOwner(tabId, owner);
            await this.save(tabId, adopted);
            if (LOOKS[record.state]) await this.update(tabId, record.state, false, {version:record.version || '',visibility:record.visibility || 'visible'});
            migrated++;
          } catch {}
        }
        // Mark the one-time migration only when legacy session evidence existed.
        if (eligible || history || knownGroups.size) await this.api.storage.local.set({[migrationKey]:true});
        return migrated;
      });
    }
    async rememberOwner(tabId, owner) {await this.api.storage.local.set({[this.ownerKey(tabId)]:owner});}
    async forgetOwner(tabId) {await this.api.storage.local.remove(this.ownerKey(tabId));}
    async recoverOwner(tabId, record) {
      if (record.owner || record.userOverride) return;
      const key = this.ownerKey(tabId);
      const owner = (await this.api.storage.local.get(key))[key];
      if (!owner) return;
      try {
        if (await this.owned(tabId, owner)) record.owner = owner;
        else await this.forgetOwner(tabId);
      } catch {await this.forgetOwner(tabId);}
    }
    async save(tabId, record) {
      await this.api.storage.session.set({['tab-'+tabId]:record});
      return record;
    }
    async owned(tabId, owner) {
      const tab = await this.api.tabs.get(tabId);
      if (tab.groupId !== owner.groupId) return false;
      const group = await this.api.tabGroups.get(owner.groupId);
      const members = await this.api.tabs.query({groupId:owner.groupId});
      // Chrome may omit the optional title on a newly-created unnamed group.
      return !group.shared && (group.title || '') === owner.title && group.color === owner.color &&
        members.length === 1 && members[0].id === tabId;
    }
    async release(tabId, record) {
      if (!record.owner) return;
      if (await this.owned(tabId, record.owner)) {
        // Chrome's vertical-tab UI can briefly retain the last look of an emptied group.
        // Neutralize our own singleton before ungrouping so manual stop/navigation/error
        // can never leave a stale blue completion marker on screen.
        try {await this.api.tabGroups.update(record.owner.groupId, {title:'', color:'grey'});} catch {}
        await this.api.tabs.ungroup(tabId);
      } else record.userOverride = true;
      delete record.owner;
      await this.forgetOwner(tabId);
    }
    async update(tabId, state, resetOverride = false, metadata = {}) {
      const key = 'tab-'+tabId;
      const entries = await this.api.storage.session.get(key);
      const record = {...entries[key], ...metadata, state, at:Date.now(), colorError:'', colorSkipped:''};
      if (resetOverride) delete record.userOverride;
      try {
        await this.recoverOwner(tabId, record);
        const config = await this.api.storage.local.get({enabled:false, colorTabs:false});
        if (!config.enabled || !config.colorTabs || !LOOKS[state]) {
          await this.release(tabId, record);
          return await this.save(tabId, record);
        }
        const permitted = await this.api.permissions.contains({permissions:['tabGroups']});
        if (!permitted) {record.colorSkipped = 'permission'; return await this.save(tabId, record);}
        if (record.userOverride) {record.colorSkipped = 'changed'; return await this.save(tabId, record);}
        const tab = await this.api.tabs.get(tabId);
        if (record.owner && !await this.owned(tabId, record.owner)) {
          delete record.owner;
          await this.forgetOwner(tabId);
          record.userOverride = true;
          record.colorSkipped = 'changed';
          return await this.save(tabId, record);
        }
        if (!record.owner) {
          if (tab.pinned) record.colorSkipped = 'pinned';
          else if (tab.groupId !== -1) record.colorSkipped = 'grouped';
          else if (Number.isInteger(tab.splitViewId) && tab.splitViewId !== -1) record.colorSkipped = 'split';
          if (record.colorSkipped) return await this.save(tabId, record);
          const groupId = await this.api.tabs.group({tabIds:[tabId], createProperties:{windowId:tab.windowId}});
          const group = await this.api.tabGroups.get(groupId);
          record.owner = {groupId, title:group.title || '', color:group.color};
          // Keep ownership through service-worker suspension or an API error.
          await this.save(tabId, record);
          await this.rememberOwner(tabId, record.owner);
          if (!await this.owned(tabId, record.owner)) {
            delete record.owner; await this.forgetOwner(tabId); record.userOverride = true; record.colorSkipped = 'changed';
            return await this.save(tabId, record);
          }
        }
        const look = LOOKS[state];
        if (record.owner.title !== look.title || record.owner.color !== look.color) {
          await this.api.tabGroups.update(record.owner.groupId, look);
          record.owner = {...record.owner, ...look};
          await this.rememberOwner(tabId, record.owner);
        }
      } catch (e) {
        // Tab closure races should not create dead entries or affect playback.
        try {await this.api.tabs.get(tabId);} catch {await this.api.storage.session.remove(key); return;}
        record.colorError = e.message || 'タブの色を変更できませんでした。';
      }
      return this.save(tabId, record);
    }
    refresh(resetOverride = false) {
      return this.enqueue(async () => {
        const entries = await this.api.storage.session.get(null);
        for (const [key, record] of Object.entries(entries)) {
          if (/^tab-\d+$/.test(key)) await this.update(Number(key.slice(4)), record.state, resetOverride);
        }
      });
    }
    reset(tabId) {
      return this.enqueue(async () => {
        const key = 'tab-'+tabId;
        if ((await this.api.storage.session.get(key))[key]) await this.update(tabId, 'watching');
      });
    }
    remove(tabId) {return this.enqueue(async () => {await this.api.storage.session.remove('tab-'+tabId);await this.forgetOwner(tabId);});}
  }
  root.ChappyTabColors = TabColors;
  if (typeof module !== 'undefined') module.exports = TabColors;
})(globalThis);
