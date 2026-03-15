import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import confetti from 'canvas-confetti';
import 'mathlive';
import { db, initPlayerStats } from './db';
import './App.css';
import gameData from './gameData.json';
import { ComputeEngine } from '@cortex-js/compute-engine';

const ce = new ComputeEngine();

if (typeof window !== 'undefined') {
  (window as any).MathfieldElement = (window as any).MathfieldElement || {};
  (window as any).MathfieldElement.fontsDirectory = "/fonts";
}

declare global { namespace JSX { interface IntrinsicElements { 'math-field': any; } } }

// 🎵 沉浸式音效引擎
const playSound = (type: 'correct' | 'wrong' | 'buy' | 'chest' | 'snap' | 'wire') => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gainNode = ctx.createGain();
  osc.connect(gainNode); gainNode.connect(ctx.destination);
  
  if (type === 'snap') {
    osc.type = 'triangle'; osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
  } else if (type === 'wire') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(1200, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.2, ctx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
  } else if (type === 'correct') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.5, ctx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  } else if (type === 'wrong') {
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.5, ctx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  } else if (type === 'buy' || type === 'chest') {
    osc.type = 'square'; osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.setValueAtTime(1800, ctx.currentTime + 0.1); osc.frequency.setValueAtTime(2400, ctx.currentTime + 0.2); 
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime); gainNode.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  }
  osc.start(); osc.stop(ctx.currentTime + 0.3);
};

const pulseAnimation = `@keyframes pulseGlow { 0% { box-shadow: 0 0 0 0 rgba(88, 204, 2, 0.7); transform: scale(1); } 70% { box-shadow: 0 0 0 15px rgba(88, 204, 2, 0); transform: scale(1.05); } 100% { box-shadow: 0 0 0 0 rgba(88, 204, 2, 0); transform: scale(1); } } .pulse-node { animation: pulseGlow 2s infinite; z-index: 10; }`;

// 🚀 EDA 引擎核心算法：并查集
class UnionFind {
  parent: Record<string, string> = {};
  find(i: string): string {
    if (!this.parent[i]) this.parent[i] = i;
    if (this.parent[i] !== i) this.parent[i] = this.find(this.parent[i]);
    return this.parent[i];
  }
  union(i: string, j: string) { this.parent[this.find(i)] = this.find(j); }
  getNets(): string[][] {
    const nets: Record<string, Set<string>> = {};
    for (const key of Object.keys(this.parent)) {
      const root = this.find(key);
      if (!nets[root]) nets[root] = new Set();
      nets[root].add(key);
    }
    return Object.values(nets).map(set => Array.from(set).sort());
  }
}

const parseCoord = (val: string, max: number) => (parseFloat(val) / 100) * max;

function App() {
  useEffect(() => { initPlayerStats(); }, []);
  
  const statsArray = useLiveQuery(() => db.playerStats.toArray());
  const playerStats = statsArray && statsArray.length > 0 ? statsArray[0] : { xp: 0, hearts: 5, id: 1, campaignProgress: {} };
  const currentHash = (gameData as any).campaignHash || 'default_hash';
  const progressMap = playerStats.campaignProgress || {};
  const currentSavedLevel = progressMap[currentHash] || 0;
  const errorCount = useLiveQuery(() => db.errorBook.count()) || 0;

  // -------------------------
  // 🌐 全局状态机
  // -------------------------
  const [currentView, setCurrentView] = useState<'menu' | 'quiz' | 'review'>('menu');
  const [activeNodeIndex, setActiveNodeIndex] = useState(0);    
  const [subQuestionIndex, setSubQuestionIndex] = useState(0);  
  
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]); 
  const [isShaking, setIsShaking] = useState(false);
  const [reviewQuestions, setReviewQuestions] = useState<any[]>([]);

  // -------------------------
  // ☁️ 云同步与存档专属状态 (战役三：数据持久化)
  // -------------------------
  const [showSettings, setShowSettings] = useState(false);
  const [ghToken, setGhToken] = useState(() => localStorage.getItem('ht_github_token') || '');
  const [gistId, setGistId] = useState(() => localStorage.getItem('ht_gist_id') || '');
  const [syncStatus, setSyncStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveToken = (val: string) => { setGhToken(val); localStorage.setItem('ht_github_token', val); };
  const handleSaveGist = (val: string) => { setGistId(val); localStorage.setItem('ht_gist_id', val); };

  // 💾 本地导出 (生成 JSON 文件)
  const exportLocalSave = async () => {
    const stats = await db.playerStats.toArray();
    const errors = await db.errorBook.toArray();
    const saveData = {
      _meta: { saveId: crypto.randomUUID(), timestamp: Date.now(), appVersion: "7.0" },
      playerStats: stats[0] || {},
      errorBook: errors
    };
    const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Hardware_Tower_Save_${new Date().getTime()}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  // 📥 本地导入 (解析 JSON 文件)
  const importLocalSave = (event: any) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data._meta && parseFloat(data._meta.appVersion) > 7.0) {
            alert("存档版本过高，请先更新软件！"); return;
        }
        if (data.playerStats) await db.playerStats.put(data.playerStats);
        if (data.errorBook) {
          await db.errorBook.clear();
          await db.errorBook.bulkPut(data.errorBook);
        }
        alert("🎉 本地存档导入成功！");
        window.location.reload();
      } catch (err) { alert("❌ 存档文件损坏或格式错误！"); }
    };
    reader.readAsText(file);
  };

  // ⬆️ 推送到 GitHub Gist
  const pushToCloud = async () => {
    if (!ghToken) return alert("请先填写 GitHub Personal Access Token");
    setSyncStatus('🔄 正在打包推送到云端...');
    try {
      const stats = await db.playerStats.toArray();
      const errors = await db.errorBook.toArray();
      const saveData = {
        _meta: { saveId: crypto.randomUUID(), timestamp: Date.now(), appVersion: "7.0" },
        playerStats: stats[0] || {},
        errorBook: errors
      };

      let method = gistId ? 'PATCH' : 'POST';
      let url = gistId ? `https://api.github.com/gists/${gistId}` : `https://api.github.com/gists`;

      const response = await fetch(url, {
        method,
        headers: { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' },
        body: JSON.stringify({
          description: "Hardware Tower Save Data (Do not delete)",
          public: false,
          files: { "hardware_tower_save.json": { content: JSON.stringify(saveData, null, 2) } }
        })
      });

      if (!response.ok) throw new Error("Sync failed");
      const resData = await response.json();
      
      if (!gistId) {
        handleSaveGist(resData.id); // 首次创建，保存新生成的 Gist ID
      }
      setSyncStatus('✅ 成功覆盖云端存档！');
      setTimeout(() => setSyncStatus(''), 3000);
    } catch (err) {
      console.error(err);
      setSyncStatus('❌ 同步失败，请检查 Token 权限或网络。');
    }
  };

  // ⬇️ 从 GitHub Gist 拉取
  const pullFromCloud = async () => {
    if (!ghToken || !gistId) return alert("请填写 Token 和 Gist ID 才能拉取");
    setSyncStatus('🔄 正在从云端拉取数据...');
    try {
      const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: { 'Authorization': `token ${ghToken}` }
      });
      if (!response.ok) throw new Error("Pull failed");
      
      const gist = await response.json();
      const content = gist.files["hardware_tower_save.json"].content;
      const data = JSON.parse(content);

      if (data._meta && parseFloat(data._meta.appVersion) > 7.0) {
          alert("云端存档版本过高，请先更新本地软件！"); setSyncStatus(''); return;
      }
      if (data.playerStats) await db.playerStats.put(data.playerStats);
      if (data.errorBook) {
        await db.errorBook.clear();
        await db.errorBook.bulkPut(data.errorBook);
      }
      setSyncStatus('✅ 云端数据覆盖成功！即将刷新...');
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      console.error(err);
      setSyncStatus('❌ 拉取失败，确保 Gist ID 正确且包含合法存档。');
    }
  };

  // -------------------------
  // 🔌 EDA 引擎专属状态与历史栈
  // -------------------------
  const svgRef = useRef<SVGSVGElement>(null);
  const [edaMode, setEdaMode] = useState<'SELECT' | 'WIRE'>('SELECT');
  const [canvasComps, setCanvasComps] = useState<Record<string, {x: number, y: number, rotation: number}>>({});
  const [wires, setWires] = useState<[string, string][]>([]);
  const [wiringStart, setWiringStart] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [draggedComp, setDraggedComp] = useState<string | null>(null);
  const [pinLabelMode, setPinLabelMode] = useState<0 | 1 | 2>(0);
  const lastTapRef = useRef<Record<string, number>>({});

  const [history, setHistory] = useState<{comps: any, wires: any}[]>([{comps: {}, wires: []}]);
  const [historyStep, setHistoryStep] = useState(0);

  const commitToHistory = (newComps: any, newWires: any) => {
    const currentRecord = history[historyStep];
    if (JSON.stringify(currentRecord.comps) === JSON.stringify(newComps) && 
        JSON.stringify(currentRecord.wires) === JSON.stringify(newWires)) return; 
    
    const newRecord = { comps: JSON.parse(JSON.stringify(newComps)), wires: JSON.parse(JSON.stringify(newWires)) };
    setHistory(prev => {
      const nextHistory = prev.slice(0, historyStep + 1);
      nextHistory.push(newRecord);
      return nextHistory;
    });
    setHistoryStep(prev => prev + 1);
  };

  const handleUndo = () => {
    if (historyStep > 0) {
      const step = historyStep - 1; setHistoryStep(step);
      setCanvasComps(history[step].comps); setWires(history[step].wires); playSound('snap');
    }
  };

  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      const step = historyStep + 1; setHistoryStep(step);
      setCanvasComps(history[step].comps); setWires(history[step].wires); playSound('snap');
    }
  };

  // -------------------------
  // 🧠 MathLive 挂载
  // -------------------------
  const mathContainerRef = useRef<HTMLDivElement>(null);
  const mfInstanceRef = useRef<any>(null);

  let currentQuestion: any = null;
  if (currentView === 'quiz') {
    const currentNode: any = gameData.campaign[activeNodeIndex];
    if (currentNode && currentNode.type === 'LESSON') {
      const qId = currentNode.questions[subQuestionIndex];
      currentQuestion = (gameData.pool as any)[qId];
    }
  } else if (currentView === 'review') {
    currentQuestion = reviewQuestions[subQuestionIndex];
  }

  useEffect(() => {
    if (currentQuestion?.type === 'MATH' && mathContainerRef.current) {
      mathContainerRef.current.innerHTML = ''; 
      const mf = new (window as any).MathfieldElement(); mfInstanceRef.current = mf;
      mf.style.fontSize = '32px'; mf.style.minHeight = '64px'; mf.style.width = '100%'; mf.style.boxSizing = 'border-box'; mf.style.padding = '10px 15px'; mf.style.borderRadius = '12px'; mf.style.backgroundColor = '#fff'; mf.style.color = '#000'; mf.style.outline = 'none'; mf.style.border = '2px solid #1cb0f6';
      mathContainerRef.current.appendChild(mf);
      return () => { mf.remove(); mfInstanceRef.current = null; };
    }
  }, [subQuestionIndex, activeNodeIndex, currentView, currentQuestion]);

  useEffect(() => {
    const mf = mfInstanceRef.current;
    if (mf) {
      mf.readOnly = isAnswered;
      if (isAnswered) { mf.style.border = `2px solid ${isCorrect ? '#58cc02' : '#ff4b4b'}`; mf.style.cursor = 'default'; } 
      else { mf.style.border = '2px solid #1cb0f6'; mf.style.cursor = 'text'; }
    }
  }, [isAnswered, isCorrect]);

  // -------------------------
  // 🔌 EDA 事件监听系统
  // -------------------------
  const getSvgPoint = (e: React.PointerEvent | PointerEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svgRef.current.getScreenCTM()!.inverse());
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const pt = getSvgPoint(e);
    setMousePos({ x: pt.x, y: pt.y });
    if (draggedComp && edaMode === 'SELECT' && !isAnswered) {
      setCanvasComps(prev => ({ ...prev, [draggedComp]: { ...prev[draggedComp], x: pt.x, y: pt.y } }));
    }
  };

  const handlePointerUp = () => {
    if (draggedComp) { playSound('snap'); commitToHistory(canvasComps, wires); setDraggedComp(null); }
  };

  const handleTerminalClick = (e: React.MouseEvent, terminalId: string) => {
    e.stopPropagation();
    if (isAnswered) return;
    if (edaMode === 'SELECT') {
      const compId = terminalId.split('.')[0];
      if (canvasComps[compId]) {
        const newComps = { ...canvasComps, [compId]: { ...canvasComps[compId], rotation: (canvasComps[compId].rotation + 90) % 360 } };
        setCanvasComps(newComps); commitToHistory(newComps, wires); playSound('snap');
      }
    } else if (edaMode === 'WIRE') {
      if (!wiringStart) {
        setWiringStart(terminalId); playSound('wire');
      } else {
        if (wiringStart !== terminalId) {
          const exists = wires.some(w => (w[0] === wiringStart && w[1] === terminalId) || (w[0] === terminalId && w[1] === wiringStart));
          if (!exists) { 
            const newWires = [...wires, [wiringStart, terminalId] as [string, string]];
            setWires(newWires); commitToHistory(canvasComps, newWires); playSound('snap'); 
          }
        }
        setWiringStart(null);
      }
    }
  };

  const getTerminalCoords = (terminalId: string) => {
    const node = currentQuestion?.nodes?.find((n: any) => n.id === terminalId);
    if (node) return { x: parseCoord(node.x, 800), y: parseCoord(node.y, 600) };
    const [compId, pinId] = terminalId.split('.');
    const compData = currentQuestion?.components?.find((c: any) => c.id === compId);
    const placed = canvasComps[compId];
    if (compData && placed) {
      const pin = compData.pins.find((p: any) => p.id === pinId);
      if (pin) {
        const w = compData.width || 80; const h = compData.height || 60;
        const px = parseCoord(pin.x, w) - w / 2; const py = parseCoord(pin.y, h) - h / 2;
        const rad = (placed.rotation * Math.PI) / 180;
        const rx = px * Math.cos(rad) - py * Math.sin(rad);
        const ry = px * Math.sin(rad) + py * Math.cos(rad);
        return { x: placed.x + rx, y: placed.y + ry };
      }
    }
    return { x: 0, y: 0 };
  };

  // -------------------------
  // 🧠 各题型判题算法
  // -------------------------
  const evaluateNetlist = () => {
    if (!currentQuestion.targetNetlist || currentQuestion.targetNetlist.length === 0) return true;
    const ufUser = new UnionFind();
    currentQuestion.nodes.forEach((n:any) => ufUser.find(n.id));
    Object.keys(canvasComps).forEach(cId => {
      const comp = currentQuestion.components.find((c:any) => c.id === cId);
      comp.pins.forEach((p:any) => ufUser.find(`${cId}.${p.id}`));
    });
    wires.forEach(([a, b]) => ufUser.union(a, b));
    const userNets = ufUser.getNets();

    const ufTarget = new UnionFind();
    currentQuestion.targetNetlist.forEach((net: string[]) => {
      for (let i = 1; i < net.length; i++) ufTarget.union(net[0], net[i]);
    });
    const targetNets = ufTarget.getNets();

    const serializeNets = (nets: string[][]) => nets.map(n => n.sort().join('|')).sort();
    const tSig = serializeNets(targetNets).join('||');
    const uSig = serializeNets(userNets).join('||');

    if (tSig === uSig) return true;

    const nonPolarComps = Object.keys(canvasComps).filter(cId => {
      const c = currentQuestion.components.find((comp:any)=>comp.id===cId);
      return c && !c.polar && c.pins.length === 2;
    });

    const numComps = nonPolarComps.length;
    if (numComps <= 5) {
      const maxMask = 1 << numComps;
      for (let mask = 0; mask < maxMask; mask++) {
        const ufTest = new UnionFind();
        wires.forEach(([a, b]) => {
          let mapA = a; let mapB = b;
          nonPolarComps.forEach((cId, idx) => {
            if ((mask & (1 << idx)) !== 0) { 
              if (a.startsWith(`${cId}.`)) mapA = a.endsWith('.p1') ? `${cId}.p2` : `${cId}.p1`;
              if (b.startsWith(`${cId}.`)) mapB = b.endsWith('.p1') ? `${cId}.p2` : `${cId}.p1`;
            }
          });
          ufTest.union(mapA, mapB);
        });
        if (serializeNets(ufTest.getNets()).join('||') === tSig) return true;
      }
    }
    return false;
  };

  const buyHeart = async () => {
    if (playerStats.hearts >= 5) { alert("红心已满！"); return; }
    if (playerStats.xp < 50) { alert("XP 不够 50！"); return; }
    playSound('buy'); confetti({ particleCount: 30, spread: 50, origin: { y: 0.1, x: 0.5 }, colors: ['#ff4b4b'] });
    await db.playerStats.update(playerStats.id!, { xp: playerStats.xp - 50, hearts: playerStats.hearts + 1 });
  };

  const submitAnswer = async (isRight: boolean) => {
    if (isAnswered) return;
    setIsAnswered(true); setIsCorrect(isRight);
    if ((window as any).mathVirtualKeyboard) (window as any).mathVirtualKeyboard.hide();

    if (isRight) {
      playSound('correct');
      if (currentView === 'quiz') await db.playerStats.update(playerStats.id!, { xp: playerStats.xp + 15 });
      else if (currentView === 'review') {
        await db.playerStats.update(playerStats.id!, { hearts: Math.min(5, playerStats.hearts + 1) });
        const existingError = await db.errorBook.get(currentQuestion.id);
        if (existingError && existingError.failCount > 1) { await db.errorBook.update(currentQuestion.id, { failCount: existingError.failCount - 1 }); } 
        else { await db.errorBook.delete(currentQuestion.id); }
      }
    } else {
      playSound('wrong'); setIsShaking(true); setTimeout(() => setIsShaking(false), 400);
      if (currentView === 'quiz') {
        await db.playerStats.update(playerStats.id!, { hearts: Math.max(0, playerStats.hearts - 1) });
        const existingError = await db.errorBook.get(currentQuestion.id);
        if (!existingError) await db.errorBook.add({ questionId: currentQuestion.id, topic: currentQuestion.topic, failCount: 1, lastFailedAt: Date.now() });
        else await db.errorBook.update(currentQuestion.id, { failCount: existingError.failCount + 1 });
      }
    }
  };

  const resetEdaState = () => {
    setCanvasComps({}); setWires([]); setWiringStart(null); setEdaMode('SELECT');
    setHistory([{comps: {}, wires: []}]); setHistoryStep(0);
  };

  const handleNext = async () => {
    let isNodeFinished = false;
    if (currentView === 'quiz') {
      const currentNode: any = gameData.campaign[activeNodeIndex];
      if (subQuestionIndex < currentNode.questions.length - 1) setSubQuestionIndex(subQuestionIndex + 1);
      else {
        isNodeFinished = true;
        if (activeNodeIndex === currentSavedLevel) {
          const newProgress = { ...progressMap }; newProgress[currentHash] = currentSavedLevel + 1;
          await db.playerStats.update(playerStats.id!, { campaignProgress: newProgress });
        }
      }
    } else if (currentView === 'review') {
      if (subQuestionIndex < reviewQuestions.length - 1) setSubQuestionIndex(subQuestionIndex + 1);
      else isNodeFinished = true;
    }

    if (isNodeFinished) { confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#58cc02', '#ffc800'] }); setCurrentView('menu'); }
    setIsAnswered(false); setIsCorrect(null); setSelectedOptions([]); resetEdaState();
  };

  const handleOptionClick = (optionText: string) => { /* 略 */ };
  const submitMultiSelect = () => { /* 略 */ };
  const getProgressText = () => {
    if (currentView === 'review') return `🏥 急救复习: 进度 ${subQuestionIndex + 1} / ${reviewQuestions.length}`;
    const currentNode: any = gameData.campaign[activeNodeIndex];
    return `📖 ${currentNode.title}: 进度 ${subQuestionIndex + 1} / ${currentNode.questions.length}`;
  };

  // 确保 isMulti 变量存在！
  const isMulti = currentQuestion?.type === 'MCQ' && currentQuestion?.answer.length > 1;

  // ==========================================
  // 🎮 UI 渲染层: 主菜单界面 (新增云同步面板)
  // ==========================================
  if (currentView === 'menu') {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', textAlign: 'center' }}>
        <style>{pulseAnimation}</style>
        
        {/* 顶部状态栏 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#242424', padding: '15px 25px', borderRadius: '20px', position: 'sticky', top: '10px', zIndex: 100, boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold' }}><span style={{ color: '#ff4b4b' }}>❤️ {playerStats.hearts}</span> / 5</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ffc800' }}>⚡ {playerStats.xp}</div>
        </div>

        {/* 核心操作区 */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', marginBottom: '30px', flexWrap: 'wrap' }}>
          <button onClick={async () => { 
            const errors = await db.errorBook.toArray(); 
            if (errors.length === 0) { alert("没有错题要复习！"); return; } 
            const expandedQueue = errors.flatMap(err => {
              const q = (gameData.pool as any)[err.questionId]; 
              return q ? Array(err.failCount).fill(q) : [];
            });
            setReviewQuestions(expandedQueue); setSubQuestionIndex(0); setCurrentView('review'); 
          }} style={{ flex: 1, minWidth: '140px', padding: '15px', borderRadius: '12px', background: '#1cb0f6', color: '#fff', border: 'none', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 0 #1899d6' }}>
            🏥 错题急救 ({errorCount})
          </button>
          <button onClick={buyHeart} style={{ flex: 1, minWidth: '140px', padding: '15px', borderRadius: '12px', background: '#ffc800', color: '#000', border: 'none', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 0 #d6a800' }}>
            🛍️ 买 ❤️ (50XP)
          </button>
          {/* 🚀 新增：打开设置与云同步面板 */}
          <button onClick={() => setShowSettings(true)} style={{ flex: 1, minWidth: '140px', padding: '15px', borderRadius: '12px', background: '#9b59b6', color: '#fff', border: 'none', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 0 #732d91' }}>
            ⚙️ 数据与云备份
          </button>
        </div>

        {/* 关卡节点树 (保持不变) */}
        <div style={{ position: 'relative', padding: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '30px' }}>
          <div style={{ position: 'absolute', width: '4px', height: '100%', background: '#444', left: '50%', transform: 'translateX(-50%)', zIndex: 0 }}></div>
          {gameData.campaign.map((node: any, i: number) => {
            const isPassed = i < currentSavedLevel; const isCurrent = i === currentSavedLevel; const isLocked = i > currentSavedLevel || node.type === 'LOCKED';
            const offset = i % 2 === 0 ? '-60px' : '60px'; const isChest = node.type === 'CHEST';

            return (
              <div key={node.id} style={{ position: 'relative', zIndex: 1, marginLeft: offset, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <button 
                  onClick={async () => {
                    if (isLocked) { alert("请先通关前面的节点！"); return; }
                    if (isChest && isCurrent) {
                      playSound('chest'); confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 }, colors: ['#ffc800', '#fff'] }); alert(`🎉 打开宝箱！获得了 ${node.rewardXP} XP！`);
                      const newProgress = { ...progressMap }; newProgress[currentHash] = i + 1;
                      await db.playerStats.update(playerStats.id!, { xp: playerStats.xp + (node.rewardXP || 0), campaignProgress: newProgress }); return;
                    }
                    if (isChest && isPassed) { alert("这个宝箱已经被掏空啦！"); return; }
                    if (playerStats.hearts <= 0) { alert("红心耗尽！请用 XP 购买或去急救站！"); return; }
                    setActiveNodeIndex(i); setSubQuestionIndex(0); setCurrentView('quiz'); resetEdaState();
                  }}
                  className={isCurrent ? 'pulse-node' : ''}
                  style={{ width: '80px', height: '80px', borderRadius: '50%', fontSize: '36px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: isLocked ? 'not-allowed' : 'pointer', background: isPassed ? '#ffc800' : isCurrent ? (isChest ? '#9b59b6' : '#58cc02') : '#333', border: `4px solid ${isPassed || isCurrent ? '#fff' : '#555'}`, boxShadow: isLocked ? 'none' : `0 6px 0 ${isPassed ? '#d6a800' : isChest ? '#8e44ad' : '#46a302'}`, transform: isLocked ? 'scale(0.9)' : 'scale(1)', transition: 'all 0.2s', filter: isLocked ? 'grayscale(100%)' : 'none' }}
                >
                  {isPassed && !isChest ? '⭐' : node.icon}
                </button>
                <div style={{ marginTop: '15px', fontWeight: 'bold', color: isLocked ? '#666' : '#fff', background: '#242424', padding: '5px 12px', borderRadius: '12px', border: '2px solid #333' }}>{node.title}</div>
              </div>
            );
          })}
        </div>

        {/* 🚀 设置与云同步模态框 */}
        {showSettings && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
            <div className="modal-pop" style={{ background: '#1e1e1e', border: '2px solid #444', borderRadius: '16px', padding: '25px', width: '100%', maxWidth: '450px', textAlign: 'left', boxShadow: '0 20px 50px rgba(0,0,0,0.7)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', color: '#fff' }}>⚙️ 数据与云同步</h2>
                <button onClick={() => setShowSettings(false)} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '24px', cursor: 'pointer' }}>✖</button>
              </div>

              {/* 本地离线 I/O */}
              <div style={{ marginBottom: '25px' }}>
                <h3 style={{ fontSize: '14px', color: '#aaa', marginBottom: '10px' }}>💾 本地离线备份 (JSON)</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={exportLocalSave} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: '#333', color: '#fff', border: '1px solid #555', cursor: 'pointer', fontWeight: 'bold' }}>📤 导出本地进度</button>
                  <button onClick={() => fileInputRef.current?.click()} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: '#333', color: '#fff', border: '1px solid #555', cursor: 'pointer', fontWeight: 'bold' }}>📥 导入本地存档</button>
                  <input type="file" ref={fileInputRef} onChange={importLocalSave} accept=".json" style={{ display: 'none' }} />
                </div>
              </div>

              {/* GitHub Gist 云同步 */}
              <div style={{ background: '#242424', padding: '15px', borderRadius: '12px', border: '1px solid #333' }}>
                <h3 style={{ fontSize: '14px', color: '#1cb0f6', margin: '0 0 15px 0', display: 'flex', justifyContent: 'space-between' }}>
                  <span>☁️ GitHub Gist 拾荒者同步</span>
                  <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" style={{ color: '#888', textDecoration: 'underline', fontSize: '12px' }}>获取 Token</a>
                </h3>
                
                <input type="password" placeholder="输入 GitHub Personal Access Token (PAT)" value={ghToken} onChange={(e) => handleSaveToken(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '8px', border: '1px solid #555', background: '#111', color: '#fff', marginBottom: '10px', fontSize: '14px' }} />
                
                <input type="text" placeholder="Gist ID (首次同步将自动生成)" value={gistId} onChange={(e) => handleSaveGist(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '8px', border: '1px solid #555', background: '#111', color: '#fff', marginBottom: '15px', fontSize: '14px', fontFamily: 'monospace' }} />

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={pushToCloud} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'rgba(88, 204, 2, 0.2)', color: '#58cc02', border: '1px solid #58cc02', cursor: 'pointer', fontWeight: 'bold' }}>⬆️ 覆盖云端</button>
                  <button onClick={pullFromCloud} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'rgba(28, 176, 246, 0.2)', color: '#1cb0f6', border: '1px solid #1cb0f6', cursor: 'pointer', fontWeight: 'bold' }}>⬇️ 拉取云端</button>
                </div>

                {syncStatus && (
                  <div style={{ marginTop: '15px', fontSize: '13px', color: syncStatus.includes('❌') ? '#ff4b4b' : syncStatus.includes('✅') ? '#58cc02' : '#ffc800', textAlign: 'center', fontWeight: 'bold' }}>
                    {syncStatus}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // 🎮 答题渲染层 (MCQ, MATH, INTERACTIVE_EDA)
  // ==========================================
  return (
    <div className={isShaking ? 'shake-animation' : ''} style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'left', padding: '20px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '10px', borderBottom: '2px solid #333' }}>
        <button onClick={() => { setCurrentView('menu'); setIsAnswered(false); setSelectedOptions([]); resetEdaState(); }} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '24px' }}>✖</button>
        <div style={{ fontSize: '18px', fontWeight: 'bold' }}><span style={{ color: '#ff4b4b', marginRight: '15px' }}>❤️ {playerStats.hearts}</span><span style={{ color: '#ffc800' }}>⚡ {playerStats.xp} XP</span></div>
      </div>
      
      <div style={{ color: currentView === 'review' ? '#1cb0f6' : '#888', fontWeight: 'bold', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{getProgressText()}</span>
        <div style={{display: 'flex', gap: '10px'}}>
          {isMulti && <span style={{ color: '#ffc800', background: '#443a00', padding: '2px 8px', borderRadius: '8px', fontSize: '14px' }}>多选题</span>}
          {currentQuestion?.type === 'INTERACTIVE_EDA' && <span style={{ color: '#9b59b6', background: '#3b214a', padding: '4px 10px', borderRadius: '8px', fontSize: '14px', border: '1px solid #9b59b6' }}>微型 EDA 连线</span>}
        </div>
      </div>

      <div style={{ marginBottom: '30px' }}><h2 style={{ marginTop: 0, lineHeight: '1.4' }}>{currentQuestion?.prompt}</h2></div>

      {currentQuestion?.type === 'MCQ' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {currentQuestion?.options.map((option: string, index: number) => {
            const isSelected = selectedOptions.includes(option);
            const isCorrectAns = currentQuestion.answer.includes(option.charAt(0));
            let bgColor = 'transparent'; let borderColor = '#555'; let textColor = 'inherit'; let boxShadow = '0 4px 0 #333';
            
            if (isAnswered) {
              if (isSelected) {
                bgColor = isCorrectAns ? 'rgba(88, 204, 2, 0.1)' : 'rgba(255, 75, 75, 0.1)'; borderColor = isCorrectAns ? '#58cc02' : '#ff4b4b'; textColor = isCorrectAns ? '#58cc02' : '#ff4b4b'; boxShadow = isCorrectAns ? '0 4px 0 rgba(88, 204, 2, 0.4)' : '0 4px 0 rgba(255, 75, 75, 0.4)';
              } else if (isCorrectAns) { borderColor = '#58cc02'; textColor = '#58cc02'; boxShadow = '0 4px 0 rgba(88, 204, 2, 0.4)'; }
            } else if (isSelected) {
              borderColor = '#1cb0f6'; textColor = '#1cb0f6'; boxShadow = '0 4px 0 rgba(28, 176, 246, 0.4)'; bgColor = 'rgba(28, 176, 246, 0.1)';
            }

            return (
              <button key={index} onClick={() => handleOptionClick(option)} style={{ textAlign: 'left', padding: '16px 20px', fontSize: '16px', fontWeight: 'bold', cursor: isAnswered ? 'default' : 'pointer', borderRadius: '16px', border: `2px solid ${borderColor}`, backgroundColor: bgColor, color: textColor, boxShadow: boxShadow, transform: isSelected && !isAnswered ? 'translateY(2px)' : 'none', transition: 'all 0.1s ease-out', display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: isMulti ? '4px' : '50%', border: `2px solid ${borderColor}`, background: isSelected ? borderColor : 'transparent', flexShrink: 0 }}></div>
                {option}
              </button>
            );
          })}
          {!isAnswered && isMulti && selectedOptions.length > 0 && (
            <button onClick={submitMultiSelect} style={{ marginTop: '10px', padding: '16px', borderRadius: '12px', background: '#1cb0f6', color: '#fff', border: 'none', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 0 #1899d6' }}>提交多选答案</button>
          )}
        </div>
      ) : 
      
      currentQuestion?.type === 'MATH' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div ref={mathContainerRef} style={{ width: '100%' }}></div>
          {!isAnswered && (
             <button onClick={() => {
                const currentVal = mfInstanceRef.current?.value || '';
                let isRight = false;
                const rawInput = currentVal.replace(/\s/g, ''); const rawAnswer = currentQuestion.answer.replace(/\s/g, '');

                let counter = 0; const subMap: Record<string, string> = {};
                const sanitizeLatex = (latex: string) => {
                  let s = latex.replace(/_\{([a-zA-Z0-9])\}/g, '_$1');
                  s = s.replace(/_\{([a-zA-Z0-9]+)\}/g, (_match, p1) => {
                    if (!subMap[p1]) { subMap[p1] = String.fromCharCode(65 + counter); counter++; }
                    return `_${subMap[p1]}`;
                  });
                  return s;
                };

                const astInput = sanitizeLatex(currentVal); const astAnswer = sanitizeLatex(currentQuestion.answer);

                if (rawInput === rawAnswer) { isRight = true; } 
                else {
                  try {
                    const checkEquivalent = (node1: any, node2: any) => {
                      if (!node1 || !node2) return false;
                      return node1.isEqual(node2) || ce.box(['Subtract', node1, node2]).simplify().isZero === true;
                    };
                    if (astInput.includes('=') && astAnswer.includes('=')) {
                      const [uL, ...uR_arr] = astInput.split('='); const [tL, ...tR_arr] = astAnswer.split('=');
                      const uR = uR_arr.join('='); const tR = tR_arr.join('=');
                      const nodeUL = ce.parse(uL); const nodeUR = ce.parse(uR);
                      const nodeTL = ce.parse(tL); const nodeTR = ce.parse(tR);
                      if ((checkEquivalent(nodeUL, nodeTL) && checkEquivalent(nodeUR, nodeTR)) || (checkEquivalent(nodeUL, nodeTR) && checkEquivalent(nodeUR, nodeTL))) { isRight = true; }
                    } else {
                      if (checkEquivalent(ce.parse(astInput), ce.parse(astAnswer))) isRight = true;
                    }
                  } catch (e) { console.warn('AST 降级', e); }

                  if (!isRight) {
                    try {
                      const toExpr = (latex: string) => latex.includes('=') ? `${latex.split('=')[0]} - (${latex.split('=')[1]})` : latex;
                      const exprUser = ce.parse(toExpr(astInput)); const exprTarget = ce.parse(toExpr(astAnswer));
                      const allVars = Array.from(new Set([...(exprTarget.unknowns || []), ...(exprUser.unknowns || [])]));
                      if (allVars.length > 0) {
                        let passedAll = true;
                        for (let i = 0; i < 5; i++) {
                          const subs: Record<string, number> = {};
                          allVars.forEach(v => { subs[v] = Math.random() * 9 + 1; });
                          const valUser = Number(exprUser.subs(subs).N().valueOf());
                          const valTarget = Number(exprTarget.subs(subs).N().valueOf());
                          if (isNaN(valUser) || isNaN(valTarget)) { passedAll = false; break; }
                          if (Math.abs(valUser - valTarget) > 1e-5 && Math.abs(valUser + valTarget) > 1e-5) { passedAll = false; break; }
                        }
                        if (passedAll) isRight = true;
                      }
                    } catch (e) { console.warn('蒙特卡洛降级', e); }
                  }
                }
                submitAnswer(isRight);
             }} style={{ padding: '16px', borderRadius: '12px', background: '#1cb0f6', color: '#fff', border: 'none', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 0 #1899d6' }}>提交公式</button>
          )}
        </div>
      ) : 

      currentQuestion?.type === 'INTERACTIVE_EDA' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          <div style={{ display: 'flex', gap: '10px', background: '#242424', padding: '10px', borderRadius: '12px', flexWrap: 'wrap' }}>
            <button onClick={() => { setEdaMode('SELECT'); setWiringStart(null); }} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: edaMode === 'SELECT' ? '#1cb0f6' : '#333', color: '#fff', fontWeight: 'bold', cursor: 'pointer', transition: 'background 0.2s' }}>
              👆 摆放 / 双击旋转
            </button>
            <button onClick={() => setEdaMode('WIRE')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: edaMode === 'WIRE' ? '#58cc02' : '#333', color: '#fff', fontWeight: 'bold', cursor: 'pointer', transition: 'background 0.2s' }}>
              🔌 连线模式
            </button>
            <button onClick={() => setPinLabelMode(p => (p + 1) % 3 as 0 | 1 | 2)} style={{ padding: '10px', borderRadius: '8px', border: '2px solid #ffc800', background: 'transparent', color: '#ffc800', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>
              {pinLabelMode === 0 ? '👁️ 隐藏引脚' : pinLabelMode === 1 ? '🏷️ 显示引脚序号' : '📝 序号+全名'}
            </button>
            <button disabled={historyStep === 0 || isAnswered} onClick={handleUndo} style={{ padding: '10px 15px', borderRadius: '8px', border: 'none', background: historyStep > 0 && !isAnswered ? '#f39c12' : '#555', color: '#fff', fontWeight: 'bold', cursor: historyStep > 0 && !isAnswered ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>
              ↩️ 撤销
            </button>
            <button disabled={historyStep === history.length - 1 || isAnswered} onClick={handleRedo} style={{ padding: '10px 15px', borderRadius: '8px', border: 'none', background: historyStep < history.length - 1 && !isAnswered ? '#f39c12' : '#555', color: '#fff', fontWeight: 'bold', cursor: historyStep < history.length - 1 && !isAnswered ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>
              ↪️ 重做
            </button>
            <button onClick={() => { setWires([]); setWiringStart(null); commitToHistory(canvasComps, []); }} disabled={isAnswered} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: isAnswered ? '#555' : '#ff4b4b', color: '#fff', fontWeight: 'bold', cursor: isAnswered ? 'not-allowed' : 'pointer' }}>
              清空连线
            </button>
          </div>

          <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', borderRadius: '12px', overflow: 'hidden', border: `2px solid ${isAnswered ? (isCorrect ? '#58cc02' : '#ff4b4b') : '#444'}`, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <svg ref={svgRef} viewBox="0 0 800 600" style={{ width: '100%', height: '100%', touchAction: 'none', backgroundColor: '#1e1e1e' }} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
              {currentQuestion.background && <image href={currentQuestion.background} x="0" y="0" width="800" height="600" preserveAspectRatio="none" style={{ opacity: 0.8 }} />}

              {currentQuestion.nodes?.map((node: any) => {
                const isWiringActive = wiringStart === node.id;
                return (
                  <g key={node.id} onPointerDown={(e) => handleTerminalClick(e, node.id)} style={{ cursor: edaMode === 'WIRE' ? 'crosshair' : 'default' }}>
                    <circle cx={parseCoord(node.x, 800)} cy={parseCoord(node.y, 600)} r="20" fill="transparent" />
                    <circle cx={parseCoord(node.x, 800)} cy={parseCoord(node.y, 600)} r={edaMode === 'WIRE' ? (isWiringActive ? 12 : 10) : 8} fill={isWiringActive ? '#58cc02' : '#ffc800'} stroke={isWiringActive ? '#fff' : '#fff'} strokeWidth="2" style={{ transition: 'all 0.2s' }} />
                    <text x={parseCoord(node.x, 800)} y={parseCoord(node.y, 600) - 15} fill="#aaa" fontSize="12" textAnchor="middle">{node.label}</text>
                  </g>
                );
              })}

              {wires.map((w, idx) => {
                const ptA = getTerminalCoords(w[0]); const ptB = getTerminalCoords(w[1]);
                return (
                  <g key={idx} style={{ cursor: isAnswered ? 'default' : 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); if (isAnswered) return; const newWires = wires.filter((_, i) => i !== idx); setWires(newWires); commitToHistory(canvasComps, newWires); playSound('snap'); }}
                    onPointerEnter={(e) => { if (isAnswered) return; const line = e.currentTarget.querySelector('.wire-visual'); if (line) { line.setAttribute('stroke', '#ff4b4b'); line.setAttribute('stroke-width', '8'); } }}
                    onPointerLeave={(e) => { if (isAnswered) return; const line = e.currentTarget.querySelector('.wire-visual'); if (line) { line.setAttribute('stroke', '#58cc02'); line.setAttribute('stroke-width', '4'); } }}>
                    <line x1={ptA.x} y1={ptA.y} x2={ptB.x} y2={ptB.y} stroke="transparent" strokeWidth="20" />
                    <line className="wire-visual" x1={ptA.x} y1={ptA.y} x2={ptB.x} y2={ptB.y} stroke="#58cc02" strokeWidth="4" strokeLinecap="round" style={{ transition: 'all 0.1s' }} />
                  </g>
                );
              })}

              {wiringStart && <line x1={getTerminalCoords(wiringStart).x} y1={getTerminalCoords(wiringStart).y} x2={mousePos.x} y2={mousePos.y} stroke="#58cc02" strokeWidth="4" strokeDasharray="8 8" />}

              {Object.keys(canvasComps).map(cId => {
                const placed = canvasComps[cId]; const comp = currentQuestion.components.find((c:any) => c.id === cId);
                if (!comp) return null;
                const isDragging = draggedComp === cId; const w = comp.width || 80; const h = comp.height || 60;

                return (
                  <g key={cId} transform={`translate(${placed.x}, ${placed.y}) rotate(${placed.rotation})`}
                    onPointerDown={(e) => { 
                      if (edaMode === 'SELECT' && !isAnswered) { 
                        e.stopPropagation(); const now = Date.now(); const last = lastTapRef.current[cId] || 0;
                        if (now - last < 300) { 
                          const newComps = { ...canvasComps, [cId]: { ...canvasComps[cId], rotation: (canvasComps[cId].rotation + 90) % 360 } };
                          setCanvasComps(newComps); commitToHistory(newComps, wires); playSound('snap'); lastTapRef.current[cId] = 0; setDraggedComp(null);
                        } else { lastTapRef.current[cId] = now; setDraggedComp(cId); }
                      } 
                    }} style={{ cursor: edaMode === 'SELECT' ? 'grab' : 'default', transition: isDragging ? 'none' : 'transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
                    
                    <rect x={-w/2} y={-h/2} width={w} height={h} fill="rgba(255,255,255,0.01)" rx="4" stroke={isDragging ? '#1cb0f6' : 'transparent'} strokeWidth="1" />
                    
                    {comp.type === 'RESISTOR' ? <path d={`M ${-w/2} 0 L -25 0 L -20 -10 L -10 10 L 0 -10 L 10 10 L 20 -10 L 25 0 L ${w/2} 0`} fill="none" stroke="#1cb0f6" strokeWidth="3" strokeLinejoin="round" />
                    : comp.type === 'CAPACITOR' ? <g><line x1={-w/2} y1="0" x2="-8" y2="0" stroke="#9b59b6" strokeWidth="3" /><line x1="-8" y1="-15" x2="-8" y2="15" stroke="#9b59b6" strokeWidth="4" /><line x1="8" y1="-15" x2="8" y2="15" stroke="#9b59b6" strokeWidth="4" /><line x1="8" y1="0" x2={w/2} y2="0" stroke="#9b59b6" strokeWidth="3" />{comp.polar && <text x="-20" y="-12" fill="#9b59b6" fontSize="14" fontWeight="bold">+</text>}</g>
                    : comp.type === 'DIODE' ? <g><line x1={-w/2} y1="0" x2="-15" y2="0" stroke="#ff4b4b" strokeWidth="3" /><polygon points="-15,-15 -15,15 15,0" fill="#ff4b4b" /><line x1="15" y1="-15" x2="15" y2="15" stroke="#ff4b4b" strokeWidth="4" /><line x1="15" y1="0" x2={w/2} y2="0" stroke="#ff4b4b" strokeWidth="3" /></g>
                    : comp.type === 'TRANSISTOR' ? <g><line x1={-w/2} y1="0" x2="-25" y2="0" stroke="#ffc800" strokeWidth="3" /><line x1="-25" y1="-20" x2="-25" y2="20" stroke="#ffc800" strokeWidth="4" /><line x1="-25" y1="-10" x2="0" y2="-30" stroke="#ffc800" strokeWidth="3" /><line x1="0" y1="-30" x2="0" y2={-h/2} stroke="#ffc800" strokeWidth="3" /><line x1="-25" y1="10" x2="0" y2="30" stroke="#ffc800" strokeWidth="3" /><polygon points="-5,22 5,22 0,30" fill="#ffc800" /><line x1="0" y1="30" x2="0" y2={h/2} stroke="#ffc800" strokeWidth="3" /></g>
                    : comp.type === 'OPAMP' ? <g><polygon points="-25,-35 -25,35 35,0" fill="#2a2a2a" stroke="#1cb0f6" strokeWidth="3" /><text x="-15" y="-10" fill="#1cb0f6" fontSize="16" fontWeight="bold">-</text><text x="-15" y="20" fill="#1cb0f6" fontSize="16" fontWeight="bold">+</text><line x1={-w/2} y1="-15" x2="-25" y2="-15" stroke="#1cb0f6" strokeWidth="3" /><line x1={-w/2} y1="15" x2="-25" y2="15" stroke="#1cb0f6" strokeWidth="3" /><line x1="35" y1="0" x2={w/2} y2="0" stroke="#1cb0f6" strokeWidth="3" /><line x1="0" y1="-20" x2="0" y2={-h/2} stroke="#ff4b4b" strokeWidth="2" strokeDasharray="4 2" /><line x1="0" y1="20" x2="0" y2={h/2} stroke="#58cc02" strokeWidth="2" strokeDasharray="4 2" /></g>
                    : comp.type === 'IC_DIP8' ? <g><rect x="-30" y="-40" width="60" height="80" fill="#111" stroke="#555" strokeWidth="2" rx="4" /><path d="M -10 -40 A 10 10 0 0 0 10 -40" fill="#333" /><text x="0" y="5" fill="#888" fontSize="14" textAnchor="middle" fontWeight="bold">IC</text>{[-25, -10, 5, 20].map((y, i) => (<React.Fragment key={i}><line x1="-30" y1={y} x2={-w/2} y2={y} stroke="#ccc" strokeWidth="4" /><line x1="30" y1={y} x2={w/2} y2={y} stroke="#ccc" strokeWidth="4" /></React.Fragment>))}</g> : null}
                    
                    <text x="0" y={-h/2 - 8} fill="#fff" fontSize="12" textAnchor="middle" fontWeight="bold">{comp.label}</text>

                    {comp.pins.map((pin: any) => {
                      const px = parseCoord(pin.x, w) - w/2; const py = parseCoord(pin.y, h) - h/2;
                      const terminalId = `${cId}.${pin.id}`; const isWiringActive = wiringStart === terminalId;
                      return (
                        <g key={pin.id} onPointerDown={(e) => handleTerminalClick(e, terminalId)}>
                          <circle cx={px} cy={py} r="15" fill="transparent" style={{ cursor: edaMode === 'WIRE' ? 'crosshair' : 'default' }} />
                          <circle cx={px} cy={py} r={edaMode === 'WIRE' ? (isWiringActive ? 10 : 8) : 4} fill={isWiringActive ? '#58cc02' : '#fff'} stroke={isWiringActive ? '#fff' : '#1cb0f6'} strokeWidth="2" style={{ transition: 'all 0.2s', cursor: edaMode === 'WIRE' ? 'crosshair' : 'default' }} />
                          {pinLabelMode > 0 && <text x={px} y={py + 18} fill="#ffc800" fontSize="12" fontWeight="bold" textAnchor="middle" style={{ pointerEvents: 'none', userSelect: 'none', textShadow: '0px 2px 2px rgba(0,0,0,0.8)' }}>{pinLabelMode === 1 ? pin.label : `${pin.id}(${pin.label})`}</text>}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </div>

          <div style={{ background: '#242424', padding: '15px', borderRadius: '12px', border: '2px solid #333', display: 'flex', gap: '15px', overflowX: 'auto', minHeight: '90px' }}>
            {currentQuestion.components.map((comp: any) => {
              if (canvasComps[comp.id]) return null; 
              return (
                <button key={comp.id} disabled={isAnswered}
                  onClick={() => { const newComps = { ...canvasComps, [comp.id]: { x: 400, y: 300, rotation: 0 } }; setCanvasComps(newComps); commitToHistory(newComps, wires); playSound('snap'); }}
                  style={{ background: '#333', border: `2px solid ${comp.polar ? '#9b59b6' : '#1cb0f6'}`, borderRadius: '8px', padding: '10px', minWidth: '80px', height: '70px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'transform 0.1s' }}
                  onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'} onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>{comp.label}</div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>点击放置</div>
                </button>
              );
            })}
            {Object.keys(canvasComps).length === currentQuestion.components.length && <div style={{ color: '#888', fontStyle: 'italic', margin: 'auto' }}>所有元件已部署到工作区</div>}
          </div>

          {!isAnswered && (
             <button onClick={() => submitAnswer(evaluateNetlist())} style={{ padding: '16px', borderRadius: '12px', background: '#9b59b6', color: '#fff', border: 'none', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 0 #732d91' }}>连线完毕，上电通电测试！</button>
          )}
        </div>
      ) : null}

      {isAnswered && (
        <div className="modal-pop" style={{ marginTop: '30px', padding: '20px', borderRadius: '16px', backgroundColor: isCorrect ? 'rgba(88, 204, 2, 0.15)' : 'rgba(255, 75, 75, 0.15)', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, color: isCorrect ? '#58cc02' : '#ff4b4b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isCorrect ? (currentQuestion?.type === 'INTERACTIVE_EDA' ? '✔ 网表拓扑完美匹配！' : '✔ 完全正确！') : (currentQuestion?.type === 'INTERACTIVE_EDA' ? '✖ 短路/开路警报！连线错误。' : '✖ 答错了')}
              </h2>
              {!isCorrect && currentQuestion.type !== 'INTERACTIVE_EDA' && <p style={{ margin: '8px 0 0 0', color: '#ff4b4b', fontWeight: 'bold' }}>标准答案：<span style={{background: '#fff', color: '#000', padding: '2px 6px', borderRadius: '4px', marginLeft: '5px'}}>{currentQuestion.answer}</span></p>}
            </div>
            <button onClick={handleNext} style={{ backgroundColor: isCorrect ? '#58cc02' : '#ff4b4b', color: 'white', border: 'none', padding: '14px 28px', fontSize: '18px', fontWeight: 'bold', borderRadius: '12px', cursor: 'pointer', boxShadow: isCorrect ? '0 4px 0 #46a302' : '0 4px 0 #cc3c3c' }}>继续</button>
          </div>
          {currentQuestion.explanation && (
            <div style={{ padding: '15px', background: 'rgba(0,0,0,0.4)', borderRadius: '12px', borderLeft: `4px solid ${isCorrect ? '#58cc02' : '#ff4b4b'}`, color: '#ddd', fontSize: '15px', lineHeight: '1.6' }}><strong>💡 深度解析：</strong><br/>{currentQuestion.explanation}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;