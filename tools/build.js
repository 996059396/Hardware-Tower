import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

console.log("====================================");
console.log("🚀 硬件学院智能编译器 V7.0 (网表连线 EDA 版)");
console.log("====================================");

function buildData() {
  console.log("⏳ 正在编译数据...");
  
  try {
    const rawText = fs.readFileSync('./questions.md', 'utf-8');
    const blocks = rawText.split('---');
    const questionsPool = {};

    blocks.forEach((block) => {
      if (block.trim() === '') return;
      
      const idMatch = block.match(/#\s*(Q\d+)/);
      const typeMatch = block.match(/\[Type\]\s*(.*)/);
      const topicMatch = block.match(/\[Topic\]\s*(.*)/);
      const explanationMatch = block.match(/\[Explanation\]([\s\S]*)/);

      if (!idMatch) return;
      const id = idMatch[1].trim();
      const type = typeMatch ? typeMatch[1].trim() : "MCQ";

      let qData = {
        id, type,
        topic: topicMatch ? topicMatch[1].trim() : "General",
        explanation: explanationMatch ? explanationMatch[1].trim() : ""
      };

      if (type === "MCQ") {
        const promptMatch = block.match(/\[Prompt\]([\s\S]*?)(?:\[Options\]|\[Answer\]|\[Explanation\])/);
        const optionsMatch = block.match(/\[Options\]([\s\S]*?)\[Answer\]/);
        const answerMatch = block.match(/\[Answer\]\s*([A-Za-z]+)/); 
        qData.prompt = promptMatch ? promptMatch[1].trim() : "未知题干";
        qData.options = optionsMatch ? optionsMatch[1].trim().split('\n').map(opt => opt.trim()).filter(opt => opt !== '') : [];
        qData.answer = answerMatch ? answerMatch[1].trim().toUpperCase() : "";
      } 
      else if (type === "MATH") {
        const promptMatch = block.match(/\[Prompt\]([\s\S]*?)(?:\[Answer\]|\[Explanation\])/);
        const answerMatch = block.match(/\[Answer\]([\s\S]*?)(?:\n\[Explanation\]|$)/);
        qData.prompt = promptMatch ? promptMatch[1].trim() : "未知题干";
        qData.answer = answerMatch ? answerMatch[1].trim() : "";
      }
      else if (type === "INTERACTIVE_EDA") {
        // 🚀 战役二进阶：真正基于网表的题型解析
        const promptMatch = block.match(/\[Prompt\]([\s\S]*?)(?:\[Background\]|\[Nodes\]|\[Components\]|\[Netlist\]|\[Explanation\])/);
        const bgMatch = block.match(/\[Background\]\s*(.*)/);
        const nodesMatch = block.match(/\[Nodes\]([\s\S]*?)(?:\[Components\]|\[Netlist\]|\[Explanation\])/);
        const compMatch = block.match(/\[Components\]([\s\S]*?)(?:\[Netlist\]|\[Explanation\])/);
        const netlistMatch = block.match(/\[Netlist\]([\s\S]*?)(?:\n\[Explanation\]|$)/);

        qData.prompt = promptMatch ? promptMatch[1].trim() : "请完成电路连线。";
        qData.background = bgMatch ? bgMatch[1].trim() : "";
        
        try {
          qData.nodes = nodesMatch ? JSON.parse(nodesMatch[1].trim()) : [];
          qData.components = compMatch ? JSON.parse(compMatch[1].trim()) : [];
          qData.targetNetlist = netlistMatch ? JSON.parse(netlistMatch[1].trim()) : [];
        } catch (e) {
          console.error(`❌ [格式错误] 题目 ${id} 的 EDA JSON 解析失败！请检查数组格式。`);
          qData.nodes = []; qData.components = []; qData.targetNetlist = [];
        }
      }

      questionsPool[id] = qData;
    });

    const campaignRaw = fs.readFileSync('./campaign.json', 'utf-8');
    const campaignData = JSON.parse(campaignRaw);
    let errorCount = 0;
    campaignData.forEach(node => {
      if (node.type === 'LESSON' && node.questions) {
        node.questions.forEach(qId => {
          if (!questionsPool[qId]) { console.error(`❌ 找不到题号: "${qId}"`); errorCount++; }
        });
      }
    });

    if (errorCount > 0) return;

    const campaignString = JSON.stringify(campaignData);
    const campaignHash = crypto.createHash('md5').update(campaignString).digest('hex');
    console.log(`🔒 地图哈希: [${campaignHash}]`);

    fs.writeFileSync('../frontend/src/gameData.json', JSON.stringify({ campaignHash, pool: questionsPool, campaign: campaignData }, null, 2), 'utf-8');
    console.log("🎉 编译成功！全网表连线 EDA 引擎支持已就绪！\n");

  } catch (error) { console.error("❌ 发生错误:", error.message); }
}

buildData();

if (process.argv.includes('--watch')) {
  fs.watch('.', (eventType, filename) => {
    if (filename === 'questions.md' || filename === 'campaign.json') {
      console.log(`\n📄 ${filename} 已修改，热更新...`);
      buildData();
    }
  });
}