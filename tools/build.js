import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

console.log("=========================================================");
console.log("🚀 硬件学院智能编译器 V7.2 (新增综合应用题 COMPREHENSIVE)");
console.log("=========================================================");

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
        const promptMatch = block.match(/\[Prompt\]([\s\S]*?)(?:\[Options\]|\[Answer\]|\[Explanation\]|$)/);
        const optionsMatch = block.match(/\[Options\]([\s\S]*?)\[Answer\]/);
        const answerMatch = block.match(/\[Answer\]\s*([A-Za-z]+)/); 
        qData.prompt = promptMatch ? promptMatch[1].trim() : "未知题干";
        qData.options = optionsMatch ? optionsMatch[1].trim().split('\n').map(opt => opt.trim()).filter(opt => opt !== '') : [];
        qData.answer = answerMatch ? answerMatch[1].trim().toUpperCase() : "";
      } 
      else if (type === "MATH") {
        const promptMatch = block.match(/\[Prompt\]([\s\S]*?)(?:\[Answer\]|\[Explanation\]|$)/);
        const answerMatch = block.match(/\[Answer\]([\s\S]*?)(?:\n\[Explanation\]|$)/);
        qData.prompt = promptMatch ? promptMatch[1].trim() : "未知题干";
        qData.answer = answerMatch ? answerMatch[1].trim() : "";
      }
      else if (type === "INTERACTIVE_EDA") {
        const promptMatch = block.match(/\[Prompt\]([\s\S]*?)(?:\[Background\]|\[Nodes\]|\[Components\]|\[Netlist\]|\[Explanation\]|$)/);
        const bgMatch = block.match(/\[Background\]\s*(.*)/);
        const nodesMatch = block.match(/\[Nodes\]([\s\S]*?)(?:\[Components\]|\[Netlist\]|\[Explanation\]|$)/);
        const compMatch = block.match(/\[Components\]([\s\S]*?)(?:\[Netlist\]|\[Explanation\]|$)/);
        const netlistMatch = block.match(/\[Netlist\]([\s\S]*?)(?:\n\[Explanation\]|$)/);

        qData.prompt = promptMatch ? promptMatch[1].trim() : "请完成电路连线。";
        qData.background = bgMatch ? bgMatch[1].trim() : "";
        try {
          qData.nodes = nodesMatch && nodesMatch[1].trim() ? JSON.parse(nodesMatch[1].trim()) : [];
          qData.components = compMatch && compMatch[1].trim() ? JSON.parse(compMatch[1].trim()) : [];
          qData.targetNetlist = netlistMatch && netlistMatch[1].trim() ? JSON.parse(netlistMatch[1].trim()) : [];
        } catch (e) {
          qData.nodes = []; qData.components = []; qData.targetNetlist = [];
        }
      }
      else if (type === "BLANK_FILL") {
        const promptMatch = block.match(/\[Prompt\]([\s\S]*?)(?:\[Options\]|\[Answer\]|\[Explanation\]|$)/);
        const optionsMatch = block.match(/\[Options\]([\s\S]*?)(?:\[Answer\]|\[Explanation\]|$)/);
        const answerMatch = block.match(/\[Answer\]([\s\S]*?)(?:\n\[Explanation\]|$)/);
        qData.prompt = promptMatch ? promptMatch[1].trim() : "未知填空题干";
        try {
          qData.options = optionsMatch && optionsMatch[1].trim() ? JSON.parse(optionsMatch[1].trim()) : [];
          qData.answer = answerMatch && answerMatch[1].trim() ? JSON.parse(answerMatch[1].trim()) : [];
        } catch (e) {
          qData.options = []; qData.answer = [];
        }
      }
      // 🌟 新增：综合应用题 (COMPREHENSIVE)
      else if (type === "COMPREHENSIVE") {
        const promptMatch = block.match(/\[Prompt\]([\s\S]*?)(?:\[Keywords\]|\[Answer\]|\[Explanation\]|$)/);
        const keywordsMatch = block.match(/\[Keywords\]([\s\S]*?)(?:\[Answer\]|\[Explanation\]|$)/);
        const answerMatch = block.match(/\[Answer\]([\s\S]*?)(?:\n\[Explanation\]|$)/);
        
        qData.prompt = promptMatch ? promptMatch[1].trim() : "未知综合题干";
        qData.answer = answerMatch ? answerMatch[1].trim() : ""; // 这里的 answer 用于喂给大模型做参考
        try {
          qData.keywords = keywordsMatch && keywordsMatch[1].trim() ? JSON.parse(keywordsMatch[1].trim()) : [];
        } catch (e) {
          console.error(`❌ [COMPREHENSIVE 格式错误] 题目 ${id} 的 Keywords JSON 解析失败！`);
          qData.keywords = [];
        }
      }

      questionsPool[id] = qData;
    });

    const campaignRaw = fs.readFileSync('./campaign.json', 'utf-8');
    const campaignData = JSON.parse(campaignRaw);
    fs.writeFileSync('../frontend/src/gameData.json', JSON.stringify({ campaignHash: crypto.createHash('md5').update(JSON.stringify(campaignData)).digest('hex'), pool: questionsPool, campaign: campaignData }, null, 2), 'utf-8');
    console.log("🎉 编译成功！所有硬核题型已部署至前端！\n");

  } catch (error) { console.error("❌ 发生致命错误:", error.message); }
}

buildData();
if (process.argv.includes('--watch')) fs.watch('.', (eventType, filename) => { if (filename === 'questions.md' || filename === 'campaign.json') buildData(); });