const fixture=document.getElementById('fixture'),result=document.getElementById('results');
document.getElementById('run').onclick=()=>{
 const outcomes=[];function test(name,fn){try{fn();outcomes.push('PASS '+name);}catch(e){outcomes.push('FAIL '+name+': '+e.message);}}
 function eq(a,b){if(a!==b)throw Error(String(a)+' !== '+String(b));}
 const user='<section data-turn="user"><div data-message-author-role="user" data-message-id="user">fixture question</div><button data-testid="copy-turn-action-button">Copy user</button></section>';
 const answer='<section data-turn="assistant"><div data-message-author-role="assistant" data-message-id="answer">fixture answer</div><button data-testid="copy-turn-action-button">Copy answer</button></section>';
 const stop='<button data-testid="stop-button" aria-label="回答を停止">Stop</button>';
 function read(){return ChappyDOM.read(document,'/c/fixture',true);}
 test('現行ChatGPTのsection構造で完了を検出',()=>{fixture.innerHTML=user+answer;eq(read().ready,true);eq(read().message,'answer');eq(read().user,'user');eq(read().busy,false);});
 test('role要素が無い現行ターンでもturn-idと最終操作で完了を検出',()=>{fixture.innerHTML=user+'<section data-turn="assistant" data-turn-id="turn-answer"><button data-testid="copy-turn-action-button">Copy answer</button></section>';eq(read().ready,true);eq(read().message,'turn-answer');eq(read().busy,false);});
 test('生成中のstop-buttonを検出',()=>{fixture.innerHTML=user+answer+stop;eq(read().busy,true);});
 test('過去の回答があっても最新userへの応答待ちは未完了',()=>{fixture.innerHTML=answer+user;eq(read().ready,false);eq(read().message,'');});
 test('Workの途中sectionに本文も最終操作もなければ未完了',()=>{fixture.innerHTML=user+'<section data-turn="assistant"><button>ツールを使用しました</button></section>'+stop;eq(read().ready,false);eq(read().busy,true);});
 test('コピー操作のない途中出力は未完了',()=>{fixture.innerHTML=user+'<section data-turn="assistant"><div data-message-author-role="assistant" data-message-id="partial">working</div></section>';eq(read().ready,false);});
 test('非表示のstop-buttonを無視',()=>{fixture.innerHTML=user+answer+'<div style="display:none">'+stop+'</div>';eq(read().busy,false);});
 test('透明なstop-buttonを無視',()=>{fixture.innerHTML=user+answer+stop;fixture.querySelector('[data-testid="stop-button"]').style.opacity='0';eq(read().busy,false);});
 test('ホバーまで透明なコピー操作を許容',()=>{fixture.innerHTML=user+answer;fixture.querySelector('[data-turn="assistant"] button').style.opacity='0';eq(read().ready,true);});
 test('非表示の最終操作では完了しない',()=>{fixture.innerHTML=user+answer;fixture.querySelector('[data-turn="assistant"] button').style.display='none';eq(read().ready,false);});
 test('承認ダイアログ表示中は待機',()=>{fixture.innerHTML=user+answer+'<div role="dialog">fixture approval</div>';eq(read().blocked,true);});
 test('エラーUIを検出',()=>{fixture.innerHTML=user+answer+'<div role="alert">ネットワークエラーが発生しました</div>';eq(read().error,true);});
 test('回答にerrorという単語があってもエラーにしない',()=>{fixture.innerHTML=user+answer.replace('fixture answer','Something went wrong is an error message');eq(read().error,false);});
 test('DOMから検出器までの通常応答フロー',()=>{const d=new ChappyCompletionDetector(2000);fixture.innerHTML=user+stop;eq(d.step(read(),0),null);fixture.innerHTML=user+answer;eq(d.step(read(),100),null);eq(d.step(read(),2100),'answer');eq(d.step(read(),5000),null);});
 test('二つ目の新規応答も一度だけ通知',()=>{const d=new ChappyCompletionDetector();fixture.innerHTML=user+stop;d.step(read(),0);fixture.innerHTML=user+answer;d.step(read(),10);eq(d.step(read(),2010),'answer');fixture.innerHTML=user+answer+user.replaceAll('"user"','"user2"').replace('data-turn="user2"','data-turn="user"').replace('data-message-author-role="user2"','data-message-author-role="user"')+stop;d.step(read(),3000);fixture.innerHTML=user+answer+user.replace('data-message-id="user"','data-message-id="user2"')+answer.replace('data-message-id="answer"','data-message-id="answer2"');d.step(read(),3100);eq(d.step(read(),5100),'answer2');});
 test('非表示タブでは最終操作未描画でもassistant message-id確定後を暫定完了にする',()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});fixture.innerHTML=user+'<section data-turn="assistant" data-turn-id="turn-bg"><div data-message-author-role="assistant" data-message-id="answer-bg"></div></section>';const x=read();eq(x.ready,true);eq(x.provisional,true);eq(x.busy,false);Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});});
 test('前面タブでは最終操作のないassistant message-idだけで完了にしない',()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});fixture.innerHTML=user+'<section data-turn="assistant" data-turn-id="turn-front"><div data-message-author-role="assistant" data-message-id="answer-front"></div></section>';const x=read();eq(x.ready,false);eq(x.provisional,false);});
 test('非表示でもstop表示中は暫定完了にしない',()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});fixture.innerHTML=user+'<section data-turn="assistant" data-turn-id="turn-busy"><div data-message-author-role="assistant" data-message-id="answer-busy"></div></section>'+stop;const x=read();eq(x.busy,true);eq(x.ready,false);eq(x.provisional,false);Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});});
 fixture.innerHTML='';result.textContent=outcomes.join('\n')+'\nTOTAL '+outcomes.length+' / FAIL '+outcomes.filter(x=>x.startsWith('FAIL')).length;
};
