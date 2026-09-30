(function (root) {
  'use strict';
  const STATES = {off:'通知オフ',waiting:'画面の準備待ち',error:'ChatGPTのエラーを検知',generating:'作業中を検知',complete:'完了を検知',watching:'次の作業を待機'};
  const SKIPS = {
    permission:'タブグループの権限がありません。設定で「タブの色も変える」をオンにして許可してください。',
    changed:'グループの管理状態を確認できないため、色を変更していません。',
    pinned:'固定タブのため、色を変更していません。',
    grouped:'既存のグループに入っているため、色を変更していません。',
    split:'分割表示のため、色を変更していません。'
  };
  function describe({config,record,probe,permitted,version,now = Date.now()}) {
    const result = {status:'',detail:'',color:'',probe:''};
    if (!config.soundName) return {...result,status:'音声が未設定です',detail:'設定でWAVを選び、自動通知をオンにしてください。'};
    if (!config.enabled) return {...result,status:'自動通知はオフです',detail:'音声と色の自動通知を使うには、上のスイッチをオンにしてください。'};
    if (!record) return {...result,status:'このタブから接続がありません',detail:'ChatGPTのタブで確認してください。更新直後は、進行中の応答が終わってからChatGPTを再読み込みしてください。'};
    if (record.version !== version) return {...result,status:'このタブの更新が必要です',detail:'進行中の応答が終わってからChatGPTを再読み込みしてください。拡張機能の更新だけでは、開いているタブに新版が反映されません。'};
    result.status = STATES[record.state] || '状態を確認できません';
    if (record.state === 'generating') {
      const issue = probe?.issue;
      if (issue === 'frozen' || issue === 'discarded') {
        result.status = 'Chromeがタブを休止しています';
        result.detail = 'この状態では完了を検知できません。タブが再開すると監視を再開します。';
      } else if (issue === 'no-reply') {
        result.status = 'タブから応答がありません';
        result.detail = 'バックグラウンドでの確認に失敗しました。30秒ごとに再試行します。この間の完了通知は保証できません。';
      } else if (probe && now - probe.at > 15000) {
        result.status = '監視の確認が遅れています';
        result.detail = '拡張機能からの確認結果が15秒以上届いていません。完了とは判定していません。';
      } else {
        result.detail = probe ? '拡張機能からこのタブを定期的に確認しています。' : 'バックグラウンドでの確認を開始しています。';
      }
      if (probe) result.probe = '最終確認：'+Math.max(0,Math.floor((now-probe.at)/1000))+'秒前'+(probe.visibility === 'hidden' ? '（非表示タブ）' : '');
    } else if (record.state === 'complete') result.detail = '完了を検知しました。音声の結果は再生回数とエラー欄で確認できます。';
    else if (record.state === 'watching') result.detail = '作業中の表示が現れると監視を開始します。';
    else if (record.state === 'error') result.detail = '完了音は鳴らしていません。ChatGPT側の表示を確認してください。';
    if (!config.colorTabs) result.color = '色の通知：オフ';
    else if (!permitted) result.color = SKIPS.permission;
    else if (record.colorError) result.color = '色を変更できませんでした：'+record.colorError;
    else if (record.colorSkipped) result.color = SKIPS[record.colorSkipped] || 'このタブの色は変更していません。';
    else if (record.owner?.color === 'yellow') result.color = '黄色のグループを設定済みです。';
    else if (record.owner?.color === 'blue') result.color = '青色のグループを設定済みです。';
    else if (record.state === 'generating' || record.state === 'complete') result.color = 'タブの色を確認中です。';
    return result;
  }
  function describeCompatibility(health) {
    const states = {healthy:'正常',degraded:'一部の信号が不足',incompatible:'構造を確認できません・完了通知を保留'};
    if (!health || !Object.hasOwn(states, health.state)) return '互換性シールド：状態を取得できません';
    return '互換性シールド / Compatibility Shield：'+states[health.state]+' · '+health.profileId+' / '+health.revisionId+
      ' · '+health.reasons.join(', ')+' · REMOTE_PROFILE_KEY_UNPROVISIONED';
  }
  root.ChappyDiagnostics = {describe, describeCompatibility};
  if (typeof module !== 'undefined') module.exports = {describe, describeCompatibility};
})(globalThis);
