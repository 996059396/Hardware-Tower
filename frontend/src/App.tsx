import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import confetti from 'canvas-confetti';
import 'mathlive';
import { db, initPlayerStats } from './db';
import './App.css';
import gameData from './gameData.json';
import { ComputeEngine } from '@cortex-js/compute-engine';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

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
    osc.type = 'triangle'; osc.frequency.setValueAtTime(600, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
  } else if (type === 'wire') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(1200, ctx.currentTime); gainNode.gain.setValueAtTime(0.2, ctx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
  } else if (type === 'correct') {
    osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.5, ctx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  } else if (type === 'wrong') {
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, ctx.currentTime); gainNode.gain.setValueAtTime(0.5, ctx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  } else if (type === 'buy' || type === 'chest') {
    osc.type = 'square'; osc.frequency.setValueAtTime(1200, ctx.currentTime); osc.frequency.setValueAtTime(1800, ctx.currentTime + 0.1); osc.frequency.setValueAtTime(2400, ctx.currentTime + 0.2); 
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime); gainNode.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);
  }
  osc.start(); osc.stop(ctx.currentTime + 0.3);
};

const pulseAnimation = `@keyframes pulseGlow { 0% { box-shadow: 0 0 0 0 rgba(88, 204, 2, 0.7); transform: scale(1); } 70% { box-shadow: 0 0 0 15px rgba(88, 204, 2, 0); transform: scale(1.05); } 100% { box-shadow: 0 0 0 0 rgba(88, 204, 2, 0); transform: scale(1); } } .pulse-node { animation: pulseGlow 2s infinite; z-index: 10; }`;

// 🚀 EDA 引擎核心算法：并查集
class UnionFind {
  parent: Record<string, string> = {};
  find(i: string): string { if (!this.parent[i]) this.parent[i] = i; if (this.parent[i] !== i) this.parent[i] = this.find(this.parent[i]); return this.parent[i]; }
  union(i: string, j: string) { this.parent[this.find(i)] = this.find(j); }
  getNets(): string[][] {
    const nets: Record<string, Set<string>> = {};
    for (const key of Object.keys(this.parent)) { const root = this.find(key); if (!nets[root]) nets[root] = new Set(); nets[root].add(key); }
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

  const [currentView, setCurrentView] = useState<'menu' | 'quiz' | 'review'>('menu');
  const [activeNodeIndex, setActiveNodeIndex] = useState(0);    
  const [subQuestionIndex, setSubQuestionIndex] = useState(0);  
  
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]); 
  const [blankAnswers, setBlankAnswers] = useState<string[]>([]); 
  const [isShaking, setIsShaking] = useState(false);
  const [reviewQuestions, setReviewQuestions] = useState<any[]>([]);
  // ==========================================
  // 🛠️ 极客工作台专属状态 (战役四：综合应用题)
  // ==========================================
  const [compText, setCompText] = useState(''); // 用户的综合文字作答
  const [memoText, setMemoText] = useState(() => localStorage.getItem('ht_memo') || ''); // 备忘录/草稿本 (持久化)
  const [calcInput, setCalcInput] = useState(''); // 计算器输入
  const [calcResult, setCalcResult] = useState(''); // 计算器输出

  // ==========================================
  // 🤖 AI 阅卷引擎专属状态 (战役三)
  // ==========================================
  const [llmUrl, setLlmUrl] = useState(() => localStorage.getItem('ht_llm_url') || 'https://api.openai.com/v1/chat/completions');
  const [llmKey, setLlmKey] = useState(() => localStorage.getItem('ht_llm_key') || '');
  const [llmModel, setLlmModel] = useState(() => localStorage.getItem('ht_llm_model') || 'gpt-3.5-turbo');
  const [isCallingAI, setIsCallingAI] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<{score: number, feedback: string} | null>(null);

  // 保存 AI 配置
  const handleSaveLLM = (key: string, val: string) => {
    if (key === 'url') { setLlmUrl(val); localStorage.setItem('ht_llm_url', val); }
    if (key === 'key') { setLlmKey(val); localStorage.setItem('ht_llm_key', val); }
    if (key === 'model') { setLlmModel(val); localStorage.setItem('ht_llm_model', val); }
  };
  
  // 用于综合题里的“插入公式”虚拟键盘
  const compMathContainerRef = useRef<HTMLDivElement>(null);
  const compMfInstanceRef = useRef<any>(null);

  // 备忘录自动保存机制
  useEffect(() => {
    localStorage.setItem('ht_memo', memoText);
  }, [memoText]);

  // 极客计算器求值逻辑 (复用 Cortex-js 引擎)
  const handleCalculate = () => {
    if (!calcInput.trim()) { setCalcResult(''); return; }
    try {
      // 解析表达式并求出浮点数结果
      const res = ce.parse(calcInput).N().valueOf();
      setCalcResult(isNaN(Number(res)) ? '运算错误' : String(res));
    } catch(e) {
      setCalcResult('语法错误');
    }
  };

  // -------------------------
  // 📚 存档库与云同步专属状态 (战役三：数据持久化升维)
  // -------------------------
  const [showSettings, setShowSettings] = useState(false);
  const [showHelpDoc, setShowHelpDoc] = useState(false);
  
  // 从 LocalStorage 初始化存档库
  const [saveLibrary, setSaveLibrary] = useState<any[]>(() => {
    const lib = localStorage.getItem('ht_save_library');
    return lib ? JSON.parse(lib) : [];
  });
  
  const [ghToken, setGhToken] = useState(() => localStorage.getItem('ht_github_token') || '');
  const [gistId, setGistId] = useState(() => localStorage.getItem('ht_gist_id') || '');
  const [syncStatus, setSyncStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveToken = (val: string) => { setGhToken(val); localStorage.setItem('ht_github_token', val); };
  const handleSaveGist = (val: string) => { setGistId(val); localStorage.setItem('ht_gist_id', val); };

  const updateLibrary = (newLib: any[]) => {
    setSaveLibrary(newLib);
    localStorage.setItem('ht_save_library', JSON.stringify(newLib));
  };

  // 📝 核心功能 1：将当前进度存入存档库
  const saveCurrentToLibrary = async () => {
    const name = prompt("请输入存档名称 (例如: 第一章打完保存)：", `存档 ${new Date().toLocaleDateString()}`);
    if (!name) return;
    const notes = prompt("可补充辅助信息/备注 (例如: 尝试了新接法)：", "") || "";

    const stats = await db.playerStats.toArray();
    const errors = await db.errorBook.toArray();
    
    const newSave = {
      _meta: { 
        saveId: crypto.randomUUID(), 
        timestamp: Date.now(), 
        appVersion: "7.1",
        name: name,
        notes: notes,
        summary: `XP: ${stats[0]?.xp || 0} | 错题: ${errors.length}`
      },
      playerStats: stats[0] || {},
      errorBook: errors
    };

    updateLibrary([newSave, ...saveLibrary]);
    alert("已成功加入存档库！");
  };

  // 🔃 核心功能 2：从存档库加载到当前游戏
  const loadFromLibrary = async (saveObj: any) => {
    if (!window.confirm(`确定要加载存档 [${saveObj._meta.name}] 吗？当前未保存的进度将被覆盖！`)) return;
    if (parseFloat(saveObj._meta.appVersion) > 7.1) { alert("该存档版本过高，请先更新软件！"); return; }
    
    if (saveObj.playerStats) await db.playerStats.put(saveObj.playerStats);
    if (saveObj.errorBook) {
      await db.errorBook.clear();
      await db.errorBook.bulkPut(saveObj.errorBook);
    }
    alert("存档加载成功！即将刷新页面...");
    window.location.reload();
  };

  // 🗑️ 删除存档库中的某项
  const deleteFromLibrary = (id: string) => {
    if (window.confirm("确定要删除这条存档吗？")) {
      updateLibrary(saveLibrary.filter(s => s._meta.saveId !== id));
    }
  };

  // 💾 本地导出单体/整个库 (生成 JSON 文件)
  const exportLibraryLocal = () => {
    const blob = new Blob([JSON.stringify(saveLibrary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `HW_Tower_Library_${new Date().getTime()}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  // 📥 本地导入 (解析 JSON 文件加入存档库)
  const importLocalToLibrary = (event: any) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        let importedCount = 0;
        let newLib = [...saveLibrary];
        
        // 兼容单体存档和数组存档库
        const items = Array.isArray(data) ? data : [data];
        items.forEach(item => {
          if (item._meta && item.playerStats) {
             // 避免重复导入相同的 ID
             if (!newLib.some(s => s._meta.saveId === item._meta.saveId)) {
                newLib.push(item);
                importedCount++;
             }
          }
        });
        
        if (importedCount > 0) {
          updateLibrary(newLib);
          alert(`成功导入 ${importedCount} 个存档到库中！`);
        } else {
          alert("没有检测到有效或新的存档格式。");
        }
      } catch (err) { alert("❌ 存档文件损坏或格式错误！"); }
    };
    reader.readAsText(file);
    // 重置 input，方便下次导入同名文件
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ⬆️ 将整个存档库推送到 GitHub Gist
  const pushLibraryToCloud = async () => {
    if (!ghToken) return alert("请先填写 GitHub Token");
    setSyncStatus('🔄 正在打包整个存档库推送到云端...');
    try {
      let method = gistId ? 'PATCH' : 'POST';
      let url = gistId ? `https://api.github.com/gists/${gistId}` : `https://api.github.com/gists`;

      const response = await fetch(url, {
        method,
        headers: { 'Authorization': `token ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' },
        body: JSON.stringify({
          description: "Hardware Tower Save Library (Do not delete)",
          public: false,
          files: { "ht_save_library.json": { content: JSON.stringify(saveLibrary, null, 2) } }
        })
      });

      if (!response.ok) throw new Error("Sync failed");
      const resData = await response.json();
      if (!gistId) handleSaveGist(resData.id);
      
      setSyncStatus(`✅ 成功将 ${saveLibrary.length} 个存档同步至云端！`);
      setTimeout(() => setSyncStatus(''), 4000);
    } catch (err) {
      console.error(err); setSyncStatus('❌ 同步失败，请检查 Token 权限或网络。');
    }
  };

  // ⬇️ 从 GitHub Gist 拉取并合并到存档库
  const pullLibraryFromCloud = async () => {
    if (!ghToken || !gistId) return alert("请填写 Token 和 Gist ID");
    setSyncStatus('🔄 正在拉取云端存档库...');
    try {
      const response = await fetch(`https://api.github.com/gists/${gistId}`, { headers: { 'Authorization': `token ${ghToken}` } });
      if (!response.ok) throw new Error("Pull failed");
      
      const gist = await response.json();
      const content = gist.files["ht_save_library.json"].content;
      const cloudLib = JSON.parse(content);

      if (!Array.isArray(cloudLib)) throw new Error("Invalid cloud library format");

      // 智能合并：保留本地最新的同名存档，加入云端独有的存档
      let newLib = [...saveLibrary];
      let added = 0;
      cloudLib.forEach(cloudSave => {
        const existingIndex = newLib.findIndex(s => s._meta.saveId === cloudSave._meta.saveId);
        if (existingIndex === -1) { newLib.push(cloudSave); added++; } 
        else if (cloudSave._meta.timestamp > newLib[existingIndex]._meta.timestamp) {
          newLib[existingIndex] = cloudSave; // 云端更新，覆盖本地同ID存档
        }
      });
      
      updateLibrary(newLib);
      setSyncStatus(`✅ 云端拉取完成！合并了 ${added} 个新存档。`);
      setTimeout(() => setSyncStatus(''), 4000);
    } catch (err) {
      console.error(err); setSyncStatus('❌ 拉取失败，请检查 Gist ID 或网络。');
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
    if (JSON.stringify(currentRecord.comps) === JSON.stringify(newComps) && JSON.stringify(currentRecord.wires) === JSON.stringify(newWires)) return; 
    const newRecord = { comps: JSON.parse(JSON.stringify(newComps)), wires: JSON.parse(JSON.stringify(newWires)) };
    setHistory(prev => { const nextHistory = prev.slice(0, historyStep + 1); nextHistory.push(newRecord); return nextHistory; });
    setHistoryStep(prev => prev + 1);
  };

  const handleUndo = () => { if (historyStep > 0) { const step = historyStep - 1; setHistoryStep(step); setCanvasComps(history[step].comps); setWires(history[step].wires); playSound('snap'); } };
  const handleRedo = () => { if (historyStep < history.length - 1) { const step = historyStep + 1; setHistoryStep(step); setCanvasComps(history[step].comps); setWires(history[step].wires); playSound('snap'); } };

  const mathContainerRef = useRef<HTMLDivElement>(null);
  const mfInstanceRef = useRef<any>(null);

  let currentQuestion: any = null;
  if (currentView === 'quiz') {
    const currentNode: any = gameData.campaign[activeNodeIndex];
    if (currentNode && currentNode.type === 'LESSON') {
      const qId = currentNode.questions[subQuestionIndex];
      currentQuestion = (gameData.pool as any)[qId];
    }
  } else if (currentView === 'review') { currentQuestion = reviewQuestions[subQuestionIndex]; }

  useEffect(() => {
    if (currentQuestion?.type === 'MATH' && mathContainerRef.current) {
      mathContainerRef.current.innerHTML = ''; const mf = new (window as any).MathfieldElement(); mfInstanceRef.current = mf;
      mf.style.fontSize = '32px'; mf.style.minHeight = '64px'; mf.style.width = '100%'; mf.style.boxSizing = 'border-box'; mf.style.padding = '10px 15px'; mf.style.borderRadius = '12px'; mf.style.backgroundColor = '#fff'; mf.style.color = '#000'; mf.style.outline = 'none'; mf.style.border = '2px solid #1cb0f6';
      mathContainerRef.current.appendChild(mf); return () => { mf.remove(); mfInstanceRef.current = null; };
    }
  }, [subQuestionIndex, activeNodeIndex, currentView, currentQuestion]);

  useEffect(() => {
    const mf = mfInstanceRef.current;
    if (mf) {
      mf.readOnly = isAnswered;
      if (isAnswered) { mf.style.border = `2px solid ${isCorrect ? '#58cc02' : '#ff4b4b'}`; mf.style.cursor = 'default'; } else { mf.style.border = '2px solid #1cb0f6'; mf.style.cursor = 'text'; }
    }
  }, [isAnswered, isCorrect]);
  // ==========================================
  // 🛠️ 综合应用题专属：挂载公式输入键盘
  // ==========================================
  useEffect(() => {
    if (currentQuestion?.type === 'COMPREHENSIVE' && compMathContainerRef.current) {
      compMathContainerRef.current.innerHTML = ''; 
      const mf = new (window as any).MathfieldElement(); 
      compMfInstanceRef.current = mf;
      mf.style.fontSize = '20px'; 
      mf.style.width = '100%'; 
      mf.style.padding = '8px'; 
      mf.style.borderRadius = '6px'; 
      mf.style.border = '1px solid #555';
      mf.style.background = '#111';
      mf.style.color = '#ffc800';
      mf.style.boxSizing = 'border-box';
      compMathContainerRef.current.appendChild(mf);
      return () => { mf.remove(); compMfInstanceRef.current = null; };
    }
  }, [subQuestionIndex, activeNodeIndex, currentView, currentQuestion]);

  const getSvgPoint = (e: React.PointerEvent | PointerEvent) => { if (!svgRef.current) return { x: 0, y: 0 }; const pt = svgRef.current.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svgRef.current.getScreenCTM()!.inverse()); };
  const handlePointerMove = (e: React.PointerEvent) => { const pt = getSvgPoint(e); setMousePos({ x: pt.x, y: pt.y }); if (draggedComp && edaMode === 'SELECT' && !isAnswered) { setCanvasComps(prev => ({ ...prev, [draggedComp]: { ...prev[draggedComp], x: pt.x, y: pt.y } })); } };
  const handlePointerUp = () => { if (draggedComp) { playSound('snap'); commitToHistory(canvasComps, wires); setDraggedComp(null); } };

  const handleTerminalClick = (e: React.MouseEvent, terminalId: string) => {
    e.stopPropagation(); if (isAnswered) return;
    if (edaMode === 'SELECT') {
      const compId = terminalId.split('.')[0];
      if (canvasComps[compId]) { const newComps = { ...canvasComps, [compId]: { ...canvasComps[compId], rotation: (canvasComps[compId].rotation + 90) % 360 } }; setCanvasComps(newComps); commitToHistory(newComps, wires); playSound('snap'); }
    } else if (edaMode === 'WIRE') {
      if (!wiringStart) { setWiringStart(terminalId); playSound('wire'); } else {
        if (wiringStart !== terminalId) {
          const exists = wires.some(w => (w[0] === wiringStart && w[1] === terminalId) || (w[0] === terminalId && w[1] === wiringStart));
          if (!exists) { const newWires = [...wires, [wiringStart, terminalId] as [string, string]]; setWires(newWires); commitToHistory(canvasComps, newWires); playSound('snap'); }
        }
        setWiringStart(null);
      }
    }
  };

  const getTerminalCoords = (terminalId: string) => {
    const node = currentQuestion?.nodes?.find((n: any) => n.id === terminalId); if (node) return { x: parseCoord(node.x, 800), y: parseCoord(node.y, 600) };
    const [compId, pinId] = terminalId.split('.'); const compData = currentQuestion?.components?.find((c: any) => c.id === compId); const placed = canvasComps[compId];
    if (compData && placed) {
      const pin = compData.pins.find((p: any) => p.id === pinId);
      if (pin) {
        const w = compData.width || 80; const h = compData.height || 60;
        const px = parseCoord(pin.x, w) - w / 2; const py = parseCoord(pin.y, h) - h / 2;
        const rad = (placed.rotation * Math.PI) / 180; const rx = px * Math.cos(rad) - py * Math.sin(rad); const ry = px * Math.sin(rad) + py * Math.cos(rad);
        return { x: placed.x + rx, y: placed.y + ry };
      }
    }
    return { x: 0, y: 0 };
  };

  const evaluateNetlist = () => {
    if (!currentQuestion.targetNetlist || currentQuestion.targetNetlist.length === 0) return true;
    const ufUser = new UnionFind(); currentQuestion.nodes.forEach((n:any) => ufUser.find(n.id));
    Object.keys(canvasComps).forEach(cId => { const comp = currentQuestion.components.find((c:any) => c.id === cId); comp.pins.forEach((p:any) => ufUser.find(`${cId}.${p.id}`)); });
    wires.forEach(([a, b]) => ufUser.union(a, b)); const userNets = ufUser.getNets();

    const ufTarget = new UnionFind(); currentQuestion.targetNetlist.forEach((net: string[]) => { for (let i = 1; i < net.length; i++) ufTarget.union(net[0], net[i]); });
    const targetNets = ufTarget.getNets();

    const serializeNets = (nets: string[][]) => nets.map(n => n.sort().join('|')).sort();
    const tSig = serializeNets(targetNets).join('||'); const uSig = serializeNets(userNets).join('||'); if (tSig === uSig) return true;

    const nonPolarComps = Object.keys(canvasComps).filter(cId => { const c = currentQuestion.components.find((comp:any)=>comp.id===cId); return c && !c.polar && c.pins.length === 2; });
    if (nonPolarComps.length <= 5) {
      const maxMask = 1 << nonPolarComps.length;
      for (let mask = 0; mask < maxMask; mask++) {
        const ufTest = new UnionFind();
        wires.forEach(([a, b]) => {
          let mapA = a; let mapB = b;
          nonPolarComps.forEach((cId, idx) => { if ((mask & (1 << idx)) !== 0) { if (a.startsWith(`${cId}.`)) mapA = a.endsWith('.p1') ? `${cId}.p2` : `${cId}.p1`; if (b.startsWith(`${cId}.`)) mapB = b.endsWith('.p1') ? `${cId}.p2` : `${cId}.p1`; } });
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

  const resetEdaState = () => { setCanvasComps({}); setWires([]); setWiringStart(null); setEdaMode('SELECT'); setHistory([{comps: {}, wires: []}]); setHistoryStep(0); };

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
    setIsAnswered(false); setIsCorrect(null); setSelectedOptions([]); setBlankAnswers([]); setCompText(''); setAiFeedback(null); resetEdaState();
  };

  const handleOptionClick = (optionText: string) => {
    if (isAnswered) return;
    const isMultiSelect = currentQuestion.answer.length > 1;
    if (!isMultiSelect) {
      setSelectedOptions([optionText]);
      submitAnswer(optionText.charAt(0) === currentQuestion.answer);
    } else {
      if (selectedOptions.includes(optionText)) setSelectedOptions(selectedOptions.filter(o => o !== optionText));
      else setSelectedOptions([...selectedOptions, optionText]);
    }
  };

  const submitMultiSelect = () => {
    if (selectedOptions.length === 0) return;
    const userAns = selectedOptions.map(o => o.charAt(0)).sort().join('');
    const correctAns = currentQuestion.answer.split('').sort().join('');
    submitAnswer(userAns === correctAns);
  };
  const getProgressText = () => { if (currentView === 'review') return `🏥 急救复习`; const currentNode: any = gameData.campaign[activeNodeIndex]; return `📖 ${currentNode.title}: 进度 ${subQuestionIndex + 1} / ${currentNode.questions.length}`; };

  const isMulti = currentQuestion?.type === 'MCQ' && currentQuestion?.answer.length > 1;
  // ==========================================
  // 🎮 UI 渲染层: 主菜单界面 (新增存档库与云同步面板)
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
          {/* 1. 错题急救 */}
          <button onClick={async () => { 
            const errors = await db.errorBook.toArray(); 
            if (errors.length === 0) { alert("没有错题要复习！"); return; } 
            const expandedQueue = errors.flatMap(err => { const q = (gameData.pool as any)[err.questionId]; return q ? Array(err.failCount).fill(q) : []; });
            setReviewQuestions(expandedQueue); setSubQuestionIndex(0); setCurrentView('review'); 
          }} style={{ flex: 1, minWidth: '110px', padding: '15px', borderRadius: '12px', background: '#1cb0f6', color: '#fff', border: 'none', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 0 #1899d6' }}>
            🏥 急救 ({errorCount})
          </button>
          
          {/* 2. 恢复买心按钮！ */}
          <button onClick={buyHeart} style={{ flex: 1, minWidth: '110px', padding: '15px', borderRadius: '12px', background: '#ffc800', color: '#000', border: 'none', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 0 #d6a800' }}>
            🛍️ 买 ❤️
          </button>

          {/* 3. 存档库与云端 */}
          <button onClick={() => setShowSettings(true)} style={{ flex: 1, minWidth: '110px', padding: '15px', borderRadius: '12px', background: '#9b59b6', color: '#fff', border: 'none', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 0 #732d91' }}>
            📚 存档/云
          </button>
        </div>

        {/* 关卡节点树 */}
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
                    if (playerStats.hearts <= 0) { alert("红心耗尽！去急救站复习可以回血！"); return; }
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
        

        {/* ========================================== */}
        {/* 📚 存档库与云同步 模态框 */}
        {/* ========================================== */}
        {showSettings && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '5vh', overflowY: 'auto' }}>
            <div className="modal-pop" style={{ background: '#1e1e1e', border: '2px solid #444', borderRadius: '16px', padding: '25px', width: '90%', maxWidth: '500px', textAlign: 'left', boxShadow: '0 20px 50px rgba(0,0,0,0.7)', marginBottom: '5vh' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', color: '#fff' }}>📚 存档管理库</h2>
                <button onClick={() => setShowSettings(false)} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '24px', cursor: 'pointer' }}>✖</button>
              </div>

              {/* 当前游戏进度控制 */}
              <div style={{ marginBottom: '20px', padding: '15px', background: '#2a2a2a', borderRadius: '12px' }}>
                <h3 style={{ fontSize: '14px', color: '#aaa', margin: '0 0 10px 0' }}>当前进度操作</h3>
                <button onClick={saveCurrentToLibrary} style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#58cc02', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 0 #46a302' }}>
                  💾 将当前进度存入存档库
                </button>
              </div>

              {/* 存档列表 */}
              <h3 style={{ fontSize: '14px', color: '#aaa', marginBottom: '10px' }}>本地存档列表 ({saveLibrary.length}/20)</h3>
              <div style={{ maxHeight: '250px', overflowY: 'auto', background: '#111', borderRadius: '12px', border: '1px solid #333', padding: '10px', marginBottom: '20px' }}>
                {saveLibrary.length === 0 ? (
                  <div style={{ color: '#666', textAlign: 'center', padding: '20px 0' }}>存档库空空如也...</div>
                ) : (
                  saveLibrary.map((save: any) => (
                    <div key={save._meta.saveId} style={{ background: '#222', border: '1px solid #444', borderRadius: '8px', padding: '12px', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', color: '#fff', fontSize: '16px' }}>{save._meta.name}</span>
                        <span style={{ fontSize: '12px', color: '#1cb0f6', background: 'rgba(28,176,246,0.1)', padding: '2px 6px', borderRadius: '4px' }}>v{save._meta.appVersion}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#888' }}>{new Date(save._meta.timestamp).toLocaleString()}</div>
                      <div style={{ fontSize: '13px', color: '#aaa' }}>📊 {save._meta.summary}</div>
                      {save._meta.notes && <div style={{ fontSize: '13px', color: '#ffc800', fontStyle: 'italic' }}>📝 "{save._meta.notes}"</div>}
                      
                      <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                        <button onClick={() => loadFromLibrary(save)} style={{ flex: 1, padding: '8px', background: '#1cb0f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>加载</button>
                        <button onClick={() => deleteFromLibrary(save._meta.saveId)} style={{ padding: '8px 15px', background: '#ff4b4b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>删除</button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* 批量离线导出导入 */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '25px' }}>
                <button onClick={exportLibraryLocal} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#333', color: '#fff', border: '1px solid #555', cursor: 'pointer', fontWeight: 'bold' }}>📤 导出整个库</button>
                <button onClick={() => fileInputRef.current?.click()} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#333', color: '#fff', border: '1px solid #555', cursor: 'pointer', fontWeight: 'bold' }}>📥 导入存档包</button>
                <input type="file" ref={fileInputRef} onChange={importLocalToLibrary} accept=".json" style={{ display: 'none' }} />
              </div>

              {/* GitHub Gist 云同步 */}
              <div style={{ background: '#242424', padding: '15px', borderRadius: '12px', border: '1px solid #333' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ fontSize: '14px', color: '#1cb0f6', margin: 0 }}>☁️ 整个存档库云同步 (Gist)</h3>
                  <button onClick={() => setShowHelpDoc(true)} style={{ background: 'transparent', border: '1px solid #1cb0f6', color: '#1cb0f6', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</button>
                </div>
                
                <input type="password" placeholder="输入 GitHub Personal Access Token (PAT)" value={ghToken} onChange={(e) => handleSaveToken(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '8px', border: '1px solid #555', background: '#111', color: '#fff', marginBottom: '10px', fontSize: '14px' }} />
                
                <input type="text" placeholder="Gist ID (首次上传将自动生成并绑定)" value={gistId} onChange={(e) => handleSaveGist(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '8px', border: '1px solid #555', background: '#111', color: '#fff', marginBottom: '15px', fontSize: '14px', fontFamily: 'monospace' }} />

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={pushLibraryToCloud} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'rgba(88, 204, 2, 0.2)', color: '#58cc02', border: '1px solid #58cc02', cursor: 'pointer', fontWeight: 'bold' }}>⬆️ 打包上云</button>
                  <button onClick={pullLibraryFromCloud} style={{ flex: 1, padding: '12px', borderRadius: '8px', background: 'rgba(28, 176, 246, 0.2)', color: '#1cb0f6', border: '1px solid #1cb0f6', cursor: 'pointer', fontWeight: 'bold' }}>⬇️ 合并拉取</button>
                </div>

                {syncStatus && (
                  <div style={{ marginTop: '15px', fontSize: '13px', color: syncStatus.includes('❌') ? '#ff4b4b' : syncStatus.includes('✅') ? '#58cc02' : '#ffc800', textAlign: 'center', fontWeight: 'bold' }}>
                    {syncStatus}
                  </div>
                )}
              </div>
              {/* 🤖 AI 老专家阅卷引擎配置 */}
              <div style={{ background: '#242424', padding: '15px', borderRadius: '12px', border: '1px solid #333', marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ fontSize: '14px', color: '#9b59b6', margin: 0 }}>🤖 AI 老专家阅卷引擎 (兼容 OpenAI 格式)</h3>
                </div>
                
                <input type="text" placeholder="API Base URL (如: https://api.deepseek.com/v1/chat/completions)" value={llmUrl} onChange={(e) => handleSaveLLM('url', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '8px', border: '1px solid #555', background: '#111', color: '#fff', marginBottom: '10px', fontSize: '13px', fontFamily: 'monospace' }} />
                
                <input type="password" placeholder="API Key (Bearer Token)" value={llmKey} onChange={(e) => handleSaveLLM('key', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '8px', border: '1px solid #555', background: '#111', color: '#fff', marginBottom: '10px', fontSize: '13px' }} />
                
                <input type="text" placeholder="模型名称 (如: deepseek-chat, gpt-4o)" value={llmModel} onChange={(e) => handleSaveLLM('model', e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '8px', border: '1px solid #555', background: '#111', color: '#fff', fontSize: '13px', fontFamily: 'monospace' }} />
                
                <div style={{ fontSize: '12px', color: '#888', marginTop: '10px', lineHeight: '1.4' }}>
                  提示：支持任意 OpenAI 兼容接口。填入配置后，在综合应用题中即可呼叫 AI 架构师进行极其硬核的主观题图文/公式推演阅卷。数据仅在本地浏览器与你配置的 API 之间流转。
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* 📖 官方保姆级教程：如何获取 GitHub Token */}
        {/* ========================================== */}
        {showHelpDoc && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '5vh', overflowY: 'auto' }}>
            <div className="modal-pop" style={{ background: '#1e1e1e', border: '2px solid #1cb0f6', borderRadius: '16px', padding: '25px', width: '90%', maxWidth: '600px', textAlign: 'left', color: '#ddd', lineHeight: '1.6', marginBottom: '5vh' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #333', paddingBottom: '10px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', color: '#1cb0f6' }}>📖 获取 GitHub Token 教程</h2>
                <button onClick={() => setShowHelpDoc(false)} style={{ background: '#333', border: 'none', color: '#fff', padding: '5px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>返回</button>
              </div>
              
              <div style={{ background: 'rgba(255,200,0,0.1)', borderLeft: '4px solid #ffc800', padding: '10px 15px', marginBottom: '20px', borderRadius: '0 8px 8px 0', fontSize: '13px' }}>
                <strong>🛡️ 教程有效性声明</strong><br/>
                基于 GitHub 官方 API 策略编写。本方案完全免费、极度隐私。<br/>
                <em>截止确认有效日期：2026年12月31日</em>
              </div>

              <ol style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <li>
                  <strong>登录 GitHub 并进入设置：</strong><br/>
                  打开 <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" style={{ color: '#1cb0f6' }}>GitHub Tokens (Classic) 页面</a>。
                </li>
                <li>
                  <strong>生成新 Token：</strong><br/>
                  点击右上角的 <code>Generate new token</code> -&gt; <code>Generate new token (classic)</code>。
                </li>
                <li>
                  <strong>填写基本信息：</strong><br/>
                  * <strong>Note:</strong> 填入 <code>Hardware Tower Sync</code>（名字随意）。<br/>
                  * <strong>Expiration:</strong> 建议选择 <code>No expiration</code>（永不过期），避免以后频繁更换。
                </li>
                <li>
                  <strong style={{ color: '#ff4b4b' }}>⚠️ 极其重要的权限设置 (安全第一)：</strong><br/>
                  在下方的 <strong>Select scopes</strong> 权限列表中，<strong>什么都不要乱勾！什么都不要乱勾！</strong><br/>
                  向下滚动，<strong>仅仅勾选 <code>gist</code> 这一项即可</strong>（Create gists）。<br/>
                  <em>(本软件利用代码片段 Gist 充当云盘，绝不需要触碰你的代码仓库和私人数据，这是最安全的做法！)</em>
                </li>
                <li>
                  <strong>保存并复制：</strong><br/>
                  滑到最底部点击 <code>Generate token</code>。你会看到一串以 <code>ghp_</code> 开头的超长字符串。<strong>立刻复制它</strong>（离开页面后就再也看不到了）。
                </li>
                <li>
                  <strong>回到本软件：</strong><br/>
                  将这串 Token 粘贴进咱们的设置面板。点击【⬆️ 打包上云】，系统会自动为你创建一个隐藏的 Gist 云盘，并把生成的 Gist ID 绑定到你的输入框里。大功告成！
                </li>
              </ol>
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
        <button onClick={() => { setCurrentView('menu'); setIsAnswered(false); setSelectedOptions([]); setBlankAnswers([]); setCompText(''); setAiFeedback(null); resetEdaState(); }} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '24px' }}>✖</button>
        <div style={{ fontSize: '18px', fontWeight: 'bold' }}><span style={{ color: '#ff4b4b', marginRight: '15px' }}>❤️ {playerStats.hearts}</span><span style={{ color: '#ffc800' }}>⚡ {playerStats.xp} XP</span></div>
      </div>
      
      <div style={{ color: currentView === 'review' ? '#1cb0f6' : '#888', fontWeight: 'bold', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{getProgressText()}</span>
        <div style={{display: 'flex', gap: '10px'}}>
          {isMulti && <span style={{ color: '#ffc800', background: '#443a00', padding: '2px 8px', borderRadius: '8px', fontSize: '14px' }}>多选题</span>}
          {currentQuestion?.type === 'INTERACTIVE_EDA' && <span style={{ color: '#9b59b6', background: '#3b214a', padding: '4px 10px', borderRadius: '8px', fontSize: '14px', border: '1px solid #9b59b6' }}>微型 EDA 连线</span>}
        </div>
      </div>

      {/* 动态隐藏原题干，因为填空题的题干自带了交互插槽 */}
      {currentQuestion?.type !== 'BLANK_FILL' && (
        <div style={{ marginBottom: '30px' }}><h2 style={{ marginTop: 0, lineHeight: '1.4' }}>{currentQuestion?.prompt}</h2></div>
      )}

      {currentQuestion?.type === 'BLANK_FILL' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* 交互式题干渲染区 (加入 || "" 防崩机制) */}
          <div style={{ fontSize: '18px', lineHeight: '2.2', background: '#242424', padding: '25px', borderRadius: '12px', border: '1px solid #444', color: '#ddd' }}>
            {(currentQuestion?.prompt || "题干解析失败，请检查 questions.md 格式！").split(/(【空\d+】)/g).map((part: string, i: number) => {
               if (part.match(/【空\d+】/)) {
                  const match = part.match(/【空(\d+)】/);
                  const idx = match ? parseInt(match[1], 10) - 1 : 0;
                  const filledValue = blankAnswers[idx];
                  const answerArray = currentQuestion?.answer || [];
                  
                  return (
                    <span 
                      key={i} 
                      onClick={() => {
                        if (isAnswered || !filledValue) return;
                        const newAnswers = [...blankAnswers];
                        newAnswers[idx] = ''; // 点击已填入的词，退回词汇池
                        setBlankAnswers(newAnswers);
                        playSound('snap');
                      }}
                      style={{
                        display: 'inline-block', minWidth: '100px', padding: '2px 12px', margin: '0 6px',
                        border: `2px ${filledValue ? 'solid' : 'dashed'} ${isAnswered ? (isCorrect ? '#58cc02' : (answerArray[idx] === filledValue ? '#58cc02' : '#ff4b4b')) : '#1cb0f6'}`,
                        borderRadius: '8px', color: filledValue ? '#fff' : '#888',
                        backgroundColor: filledValue ? (isAnswered ? (answerArray[idx] === filledValue ? '#58cc02' : '#ff4b4b') : '#1cb0f6') : 'rgba(28, 176, 246, 0.05)',
                        cursor: (isAnswered || !filledValue) ? 'default' : 'pointer',
                        fontWeight: 'bold', textAlign: 'center',
                        boxShadow: filledValue && !isAnswered ? '0 4px 0 #1899d6' : 'none',
                        transform: filledValue && !isAnswered ? 'translateY(-2px)' : 'none',
                        transition: 'all 0.15s'
                      }}
                    >
                      {filledValue || part}
                    </span>
                  );
               }
               return <strong key={i}>{part}</strong>;
            })}
          </div>

          {/* 候选词汇池 (Options Pool) (加入 || [] 防崩机制) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', background: '#1e1e1e', padding: '20px', borderRadius: '12px', border: '2px dashed #444' }}>
            <div style={{ width: '100%', fontSize: '14px', color: '#888', marginBottom: '5px' }}>👇 点击下方词汇填入上方的空缺处</div>
            {(currentQuestion?.options || []).map((opt: string, idx: number) => {
               const isUsed = blankAnswers.includes(opt);
               return (
                 <button 
                   key={idx} disabled={isUsed || isAnswered}
                   onClick={() => {
                      if (isAnswered || isUsed) return;
                      const answerArray = currentQuestion?.answer || [];
                      const answerLen = answerArray.length;
                      let newAnswers = [...blankAnswers];
                      if (newAnswers.length < answerLen) newAnswers = newAnswers.concat(Array(answerLen - newAnswers.length).fill(''));
                      
                      const firstEmptyIdx = newAnswers.findIndex(v => !v);
                      if (firstEmptyIdx !== -1) {
                          newAnswers[firstEmptyIdx] = opt;
                          setBlankAnswers(newAnswers);
                          playSound('snap');
                      }
                   }}
                   style={{
                     padding: '10px 16px', borderRadius: '8px',
                     background: isUsed ? '#2a2a2a' : '#333', color: isUsed ? '#555' : '#fff',
                     border: `2px solid ${isUsed ? '#333' : '#1cb0f6'}`,
                     cursor: isUsed || isAnswered ? 'not-allowed' : 'pointer',
                     fontWeight: 'bold', opacity: isUsed ? 0.4 : 1, transition: 'all 0.1s',
                     transform: isUsed ? 'none' : 'translateY(-2px)',
                     boxShadow: isUsed ? 'none' : '0 4px 0 #1899d6'
                   }}
                 >
                   {opt}
                 </button>
               )
            })}
          </div>

          {!isAnswered && (
            <button 
              onClick={() => {
                const answerArray = currentQuestion?.answer || [];
                const answerLen = answerArray.length;
                let newAnswers = [...blankAnswers];
                if (newAnswers.length < answerLen) newAnswers = newAnswers.concat(Array(answerLen - newAnswers.length).fill(''));
                if (newAnswers.includes('')) { alert("⚠️ 请填完所有的空！"); return; }
                
                const isRight = JSON.stringify(newAnswers) === JSON.stringify(answerArray);
                submitAnswer(isRight);
              }}
              style={{ padding: '16px', borderRadius: '12px', background: '#1cb0f6', color: '#fff', border: 'none', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 0 #1899d6', marginTop: '10px' }}
            >
              提交逻辑链
            </button>
          )}
        </div>
      ) : 

      /* ========================================== */
      /* 🛠️ 新增：COMPREHENSIVE 综合应用题 (极客工作台) */
      /* ========================================== */
      currentQuestion?.type === 'COMPREHENSIVE' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* 题干展示区 */}
          <div style={{ padding: '20px', background: '#242424', borderRadius: '12px', borderLeft: '4px solid #9b59b6', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#9b59b6', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🛠️</span> 工程实战沙盘
            </h3>
            <div style={{ color: '#ddd', lineHeight: '1.8', fontSize: '15px' }}>{currentQuestion.prompt}</div>
          </div>

          {/* 工作台主网格 */}
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'stretch' }}>
            
            {/* 左侧：主答题区 (包含公式输入器) */}
            <div style={{ flex: 2, minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ background: '#1e1e1e', border: '1px solid #444', borderRadius: '12px', padding: '15px', display: 'flex', flexDirection: 'column', flexGrow: 1, boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ color: '#aaa', fontWeight: 'bold', fontSize: '14px' }}>📝 分析与计算论证过程</span>
                  <button onClick={() => {
                      const val = compMfInstanceRef.current?.value;
                      if (val) setCompText(prev => prev + ` \\(${val}\\) `);
                  }} style={{ background: 'rgba(28, 176, 246, 0.15)', color: '#1cb0f6', border: '1px solid #1cb0f6', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', transition: 'all 0.2s' }}>
                    ⬇️ 插入公式至正文
                  </button>
                </div>
                {/* 挂载 MathLive */}
                <div style={{ marginBottom: '12px' }} ref={compMathContainerRef}></div>
                {/* 正文输入 */}
                <textarea
                  value={compText}
                  onChange={e => setCompText(e.target.value)}
                  placeholder="作为架构师，请在这里写下你的排查思路、推导过程和最终结论..."
                  style={{ width: '100%', flexGrow: 1, minHeight: '220px', background: '#111', color: '#fff', border: '1px solid #333', borderRadius: '8px', padding: '15px', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '14px', resize: 'vertical', lineHeight: '1.6' }}
                  readOnly={isAnswered}
                />
              </div>
            </div>

            {/* 右侧：辅助工具栈 */}
            <div style={{ flex: 1, minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              
              {/* 工具1：极客计算器 */}
              <div style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '12px', padding: '15px', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
                <div style={{ color: '#ffc800', fontWeight: 'bold', marginBottom: '12px', fontSize: '14px' }}>🧮 Cortex-JS 极客计算器</div>
                <input 
                  type="text" value={calcInput} 
                  onChange={e => setCalcInput(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && handleCalculate()} 
                  placeholder="表达式，如: 12 / (10 + 2)" 
                  style={{ width: '100%', background: '#111', border: '1px solid #555', color: '#fff', padding: '10px', borderRadius: '6px', boxSizing: 'border-box', marginBottom: '10px', fontFamily: 'monospace', fontSize: '14px' }} 
                />
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={handleCalculate} style={{ flex: 1, background: '#444', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px', cursor: 'pointer', fontWeight: 'bold' }}>= 计算</button>
                  <div style={{ flex: 2, background: '#0a0a0a', border: '1px inset #222', color: '#58cc02', borderRadius: '6px', padding: '8px 10px', display: 'flex', alignItems: 'center', overflowX: 'auto', fontFamily: 'monospace', fontSize: '16px', fontWeight: 'bold' }}>
                    {calcResult || '0.00'}
                  </div>
                </div>
              </div>

              {/* 工具2：持久化备忘录 */}
              <div style={{ background: '#2a2a2a', border: '1px solid #444', borderRadius: '12px', padding: '15px', flexGrow: 1, display: 'flex', flexDirection: 'column', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
                <div style={{ color: '#1cb0f6', fontWeight: 'bold', marginBottom: '12px', fontSize: '14px' }}>📌 跨题备忘录 (LocalStorage)</div>
                <textarea 
                  value={memoText} 
                  onChange={e => setMemoText(e.target.value)} 
                  placeholder="随手记下关键数据、中间变量或灵感，刷新网页也不会丢失..." 
                  style={{ width: '100%', flexGrow: 1, minHeight: '120px', background: '#111', color: '#ffc800', border: '1px solid #555', borderRadius: '6px', padding: '12px', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '13px', resize: 'vertical', lineHeight: '1.5' }} 
                />
              </div>
            </div>
          </div>

          {/* ========================================== */}
          {/* ⚖️ 薛定谔的仲裁庭 (双核提交区) */}
          {/* ========================================== */}
          {!isAnswered && (
            <div style={{ display: 'flex', gap: '15px', marginTop: '10px', flexWrap: 'wrap', flexDirection: 'column' }}>
              
              {/* 操作按钮区 */}
              <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                <button onClick={() => {
                  if (!compText.trim()) return alert("写点分析过程吧，工程师！");
                  
                  // === 算法 Core 1: 本地关键词正则扫描 ===
                  let score = 0;
                  let hitWords: string[] = [];
                  const keywords = currentQuestion.keywords || [];
                  
                  if (keywords.length > 0) {
                    keywords.forEach((kw: string) => {
                      const regex = new RegExp(kw, 'i');
                      if (regex.test(compText)) { score += (100 / keywords.length); hitWords.push(kw); }
                    });
                    score = Math.min(100, Math.round(score));
                  } else {
                    score = compText.length > 50 ? 100 : 60;
                  }
                  
                  const isPass = score >= 60;
                  const feedback = `🔍 【本地正则仲裁庭】扫描完毕\n\n得分: ${score} / 100\n命中核心概念: ${hitWords.length ? hitWords.join(' | ') : '无'}\n\n${isPass ? '✅ 逻辑链完整，允许通关！' : '❌ 关键知识点缺失，再想想！'}`;
                  
                  if (window.confirm(feedback + "\n\n是否接受此得分并提交答卷？")) { submitAnswer(isPass); }
                }} disabled={isCallingAI} style={{ flex: 1, minWidth: '200px', padding: '16px', borderRadius: '12px', background: '#58cc02', color: '#fff', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: isCallingAI ? 'not-allowed' : 'pointer', boxShadow: '0 4px 0 #46a302', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', opacity: isCallingAI ? 0.5 : 1 }}>
                  <span>🔍 本地算法扫描</span><span style={{ background: '#fff', color: '#58cc02', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>极速</span>
                </button>
                
                <button onClick={async () => {
                  if (!llmKey || !llmUrl) { alert("⚠️ 请先在主菜单的【📚 存档库与云端】中配置 AI 引擎的 URL 和 API Key！"); return; }
                  if (!compText.trim()) { alert("写点分析过程吧，不然 AI 会直接给你 0 分的！"); return; }
                  
                  setIsCallingAI(true);
                  setAiFeedback(null);
                  
                  try {
                    // === 算法 Core 2: 赛博老专家 (LLM Scorer) 极严苛 Prompt ===
                    const sysPrompt = `你是一个极其严苛、经验丰富的硬件架构师。正在审查一名初级硬件工程师（用户）对工程故障的综合分析报告。
                    【当前题目】: ${currentQuestion.prompt}
                    【绝对标准答案】: ${Array.isArray(currentQuestion.answer) ? currentQuestion.answer.join(' ') : currentQuestion.answer}
                    【深度解析参考】: ${currentQuestion.explanation || '无'}
                    
                    你的任务：基于上述绝对标准，审查用户提交的分析文本。
                    要求：
                    1. 检查其逻辑是否闭环，计算是否准确，是否踩中了核心痛点。
                    2. 语气要像资深技术总监：犀利、专业、一针见血。对于致命的常识错误要狠狠指出。
                    3. 你必须严格返回一个合法的 JSON 对象，不要输出任何额外的 markdown 标记（如 \`\`\`json ），格式如下：
                    {
                      "score": <0到100的整数，60分及格>,
                      "feedback": "<一段不少于50字的深度技术点评>"
                    }`;

                    const response = await fetch(llmUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${llmKey}` },
                      body: JSON.stringify({
                        model: llmModel,
                        messages: [
                          { role: 'system', content: sysPrompt },
                          { role: 'user', content: `我的排查报告：\n${compText}` }
                        ],
                        temperature: 0.1
                      })
                    });

                    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
                    
                    const data = await response.json();
                    let rawContent = data.choices[0].message.content;
                    // 清理可能带有 ```json 的 markdown 格式
                    rawContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
                    const parsed = JSON.parse(rawContent);
                    
                    if (parsed.score !== undefined && parsed.feedback) {
                      setAiFeedback({ score: parsed.score, feedback: parsed.feedback });
                      playSound('snap');
                    } else {
                      throw new Error("大模型返回的数据格式不符合要求");
                    }
                  } catch (err: any) {
                    console.error(err);
                    alert("❌ 呼叫 AI 架构师失败，请检查 API 配置或网络环境。\n错误信息：" + err.message);
                  } finally {
                    setIsCallingAI(false);
                  }
                }} disabled={isCallingAI} style={{ flex: 1, minWidth: '200px', padding: '16px', borderRadius: '12px', background: '#9b59b6', color: '#fff', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: isCallingAI ? 'not-allowed' : 'pointer', boxShadow: '0 4px 0 #732d91', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
                  <span>{isCallingAI ? '📡 正在连接高维意识...' : '🤖 呼叫 AI 架构师审查'}</span><span style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>耗时</span>
                </button>
              </div>

              {/* AI 审判结果反馈面板 */}
              {aiFeedback && (
                <div style={{ marginTop: '10px', background: '#1a1a1a', border: `2px solid ${aiFeedback.score >= 60 ? '#58cc02' : '#ff4b4b'}`, borderRadius: '12px', padding: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', animation: 'pulseGlow 1s ease-out' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '10px', marginBottom: '15px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: aiFeedback.score >= 60 ? '#58cc02' : '#ff4b4b' }}>
                      👨‍💻 架构师阅卷结果：{aiFeedback.score >= 60 ? 'PASS (通过)' : 'FAIL (打回重做)'}
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: '900', color: aiFeedback.score >= 60 ? '#58cc02' : '#ff4b4b', textShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                      {aiFeedback.score} <span style={{fontSize: '16px'}}>分</span>
                    </div>
                  </div>
                  
                  <div style={{ color: '#ddd', lineHeight: '1.7', fontSize: '15px', background: '#222', padding: '15px', borderRadius: '8px', fontStyle: 'italic', borderLeft: '4px solid #555' }}>
                    “ {aiFeedback.feedback} ”
                  </div>

                  <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
                    <button onClick={() => submitAnswer(aiFeedback.score >= 60)} style={{ flex: 2, padding: '14px', borderRadius: '8px', background: aiFeedback.score >= 60 ? '#58cc02' : '#ff4b4b', color: '#fff', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: `0 4px 0 ${aiFeedback.score >= 60 ? '#46a302' : '#cc3c3c'}` }}>
                      {aiFeedback.score >= 60 ? '✅ 接受得分并通关！' : '🩸 愿赌服输，接受挂科扣血'}
                    </button>
                    <button onClick={() => setAiFeedback(null)} style={{ flex: 1, padding: '14px', borderRadius: '8px', background: '#444', color: '#fff', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>
                      取消，我再改改
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : 

      currentQuestion?.type === 'MCQ' ? (
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
                const currentVal = mfInstanceRef.current?.value || ''; let isRight = false;
                const rawInput = currentVal.replace(/\s/g, ''); const rawAnswer = currentQuestion.answer.replace(/\s/g, '');

                let counter = 0; const subMap: Record<string, string> = {};
                const sanitizeLatex = (latex: string) => {
                  let s = latex.replace(/_\{([a-zA-Z0-9])\}/g, '_$1');
                  return s.replace(/_\{([a-zA-Z0-9]+)\}/g, (_match, p1) => {
                    if (!subMap[p1]) { subMap[p1] = String.fromCharCode(65 + counter); counter++; }
                    return `_${subMap[p1]}`;
                  });
                };

                const astInput = sanitizeLatex(currentVal); const astAnswer = sanitizeLatex(currentQuestion.answer);

                if (rawInput === rawAnswer) { isRight = true; } 
                else {
                  try {
                    const checkEquivalent = (node1: any, node2: any) => { if (!node1 || !node2) return false; return node1.isEqual(node2) || ce.box(['Subtract', node1, node2]).simplify().isZero === true; };
                    if (astInput.includes('=') && astAnswer.includes('=')) {
                      const [uL, ...uR_arr] = astInput.split('='); const [tL, ...tR_arr] = astAnswer.split('=');
                      const uR = uR_arr.join('='); const tR = tR_arr.join('=');
                      const nodeUL = ce.parse(uL); const nodeUR = ce.parse(uR); const nodeTL = ce.parse(tL); const nodeTR = ce.parse(tR);
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
                          const subs: Record<string, number> = {}; allVars.forEach(v => { subs[v] = Math.random() * 9 + 1; });
                          const valUser = Number(exprUser.subs(subs).N().valueOf()); const valTarget = Number(exprTarget.subs(subs).N().valueOf());
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
              {!isCorrect && currentQuestion.type !== 'INTERACTIVE_EDA' && <p style={{ margin: '8px 0 0 0', color: '#ff4b4b', fontWeight: 'bold', lineHeight: '1.5' }}>标准答案：<br/><span style={{background: '#fff', color: '#000', padding: '4px 8px', borderRadius: '6px', display: 'inline-block', marginTop: '5px'}}>{Array.isArray(currentQuestion.answer) ? currentQuestion.answer.join(' ➔ ') : currentQuestion.answer}</span></p>}
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