(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.MeetNotebookTranscript=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const words=s=>String(s||'').trim().split(/\s+/).filter(Boolean);
  const norm=s=>String(s||'').toLocaleLowerCase().normalize('NFKC').replace(/[\p{P}\p{S}]/gu,'');
  const hasDigit=s=>/\d/.test(s);

  function lev(a,b){
    const m=a.length,n=b.length;if(!m)return n;if(!n)return m;
    let prev=new Array(n+1),cur=new Array(n+1);for(let j=0;j<=n;j++)prev[j]=j;
    for(let i=1;i<=m;i++){cur[0]=i;for(let j=1;j<=n;j++){cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));}[prev,cur]=[cur,prev];}
    return prev[n];
  }
  // Similarity of two normalized words. Meet keeps revising words it already showed
  // (e.g. "Indep" -> "Independ", "exp" -> "explain", "Friday" -> "Friday,"), so exact equality is too strict.
  function wordSim(x,y){
    if(x===y)return 1;if(!x||!y)return 0;if(hasDigit(x)||hasDigit(y))return 0;
    const s=x.length<=y.length?x:y,l=x.length<=y.length?y:x;
    if(s.length>=3&&l.startsWith(s))return .9;
    if(l.length>=4){const r=1-lev(s,l)/l.length;if(r>=.75)return r;}
    return 0;
  }

  // Find where the new caption window (b) lines up with the end of the existing text (a).
  function align(an,bn,minOverlap){
    let best=null;const start=Math.max(0,an.length-bn.length-40);
    for(let i=start;i<an.length;i++){
      const m=Math.min(an.length-i,bn.length);let match=0,exact=0,bad=0;
      for(let k=0;k<m;k++){const s=wordSim(an[i+k],bn[k]);if(s>=.75){match++;if(s===1)exact++;}else bad+=(hasDigit(an[i+k])||hasDigit(bn[k]))?3:1;}
      const score=match-2*bad;
      if(match<Math.min(minOverlap,m)||match/m<.7||score<1)continue;
      if(!best||score>best.score||(score===best.score&&m>best.m))best={i,m,match,exact,score};
    }
    return best;
  }

  // Remove an earlier copy of a phrase that was appended again later in the same text.
  function collapseRepeats(list,minRun=6){
    let w=list.slice(),guard=0,changed=true;
    while(changed&&guard++<25){
      changed=false;const n=w.map(x=>norm(x));const start=Math.max(0,w.length-160);
      for(let i=start;i<=w.length-minRun&&!changed;i++){
        for(let j=i+1;j<Math.min(w.length,i+90)&&!changed;j++){
          let L=0,exact=0;
          while(j+L<w.length&&i+L<j){const s=wordSim(n[i+L],n[j+L]);if(s<.75)break;if(s===1)exact++;L++;}
          if(L>=minRun&&exact>=L-2){w=w.slice(0,i).concat(w.slice(i+L));changed=true;}
        }
      }
    }
    return w;
  }

  // kind: 'none' (nothing shared, text appended), 'overlap' (stitched / corrected), 'contained' (already known)
  function mergeInfo(oldText,newText,opts={}){
    const minOverlap=opts.minOverlap||1;
    const a=words(oldText),b=words(newText);
    if(!a.length)return {text:b.join(' '),kind:'none'};
    if(!b.length)return {text:a.join(' '),kind:'contained'};
    const an=a.map(norm),bn=b.map(norm);
    const hit=align(an,bn,minOverlap);
    if(!hit)return {text:collapseRepeats(a.concat(b)).join(' '),kind:'none'};
    const end=hit.i+hit.m;
    if(end<an.length||(hit.m===bn.length&&hit.exact===hit.m))return {text:a.join(' '),kind:'contained'};
    const seg=[];for(let k=0;k<hit.m;k++){const o=a[hit.i+k];seg.push(an[hit.i+k].length>bn[k].length&&an[hit.i+k].startsWith(bn[k])?o:b[k]);}
    return {text:collapseRepeats(a.slice(0,hit.i).concat(seg,b.slice(hit.m))).join(' '),kind:'overlap'};
  }
  const mergeRollingText=(oldText,newText)=>mergeInfo(oldText,newText).text;

  const isMine=(speaker,myName)=>{const s=String(speaker||'').trim().toLowerCase();return /^you(\s*\(you\))?$/.test(s)||(!!myName&&s===String(myName).trim().toLowerCase());};

  // On-device dictation entries duplicate what Meet already captioned for the same person. Hide them when covered.
  function isCoveredByMeet(entry,all,myName){
    const lw=words(entry.text).map(norm).filter(Boolean);if(!lw.length)return false;
    const pool=[];for(const e of all){if(e.source==='local-asr'||e.source==='note')continue;if(!isMine(e.speaker,myName))continue;if(Math.abs((e.t||0)-(entry.t||0))>240)continue;pool.push(...words(e.text).map(norm).filter(Boolean));}
    if(!pool.length)return false;
    if(lw.length<3){const j=' '+pool.join(' ')+' ';return j.includes(' '+lw.join(' ')+' ');}
    const bg=new Set();for(let i=0;i<pool.length-1;i++)bg.add(pool[i]+'|'+pool[i+1]);
    let hit=0,tot=0;for(let i=0;i<lw.length-1;i++){tot++;if(bg.has(lw[i]+'|'+lw[i+1]))hit++;}
    return tot>0&&hit/tot>=.5;
  }
  function filterAuxiliary(entries,myName){
    const all=entries||[];return all.filter(e=>!(e&&e.source==='local-asr'&&isCoveredByMeet(e,all,myName)));
  }

  function buildTurns(entries,configuredName){
    const turns=[];for(const e of filterAuxiliary(entries,configuredName)){let name=String(e&&e.speaker||'').trim();if(/^you$/i.test(name))name=configuredName||'You';const text=String(e&&e.text||'').replace(/\s+/g,' ').trim();if(!name||!text)continue;const last=turns[turns.length-1];if(last&&last.name.toLowerCase()===name.toLowerCase())last.text=mergeRollingText(last.text,text);else turns.push({name,text,t:Math.max(0,Number(e.t)||0)});}return turns;
  }
  function formatPlainText(entries,configuredName){
    const turns=buildTurns(entries,configuredName);
    const clean=value=>String(value||'').replace(/\r\n?/g,' ').replace(/[ \t]+/g,' ').replace(/\s+/g,' ').trim();
    return turns.map(turn=>clean(turn.name)+' - '+clean(turn.text)).join('\n\n')+'\n';
  }
  return {mergeRollingText,mergeInfo,collapseRepeats,filterAuxiliary,isCoveredByMeet,isMine,buildTurns,formatPlainText};
});