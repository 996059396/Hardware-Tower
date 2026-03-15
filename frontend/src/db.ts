import Dexie from 'dexie';

export interface PlayerStats {
  id?: number; 
  xp: number;
  hearts: number;
  // 🚀 核心升级：不再使用单一的 currentLevel
  // currentLevel?: number; 
  // 变成一个大字典：{ "哈希值A": 进度3, "哈希值B": 进度0 }
  campaignProgress?: Record<string, number>; 
}

export interface ErrorRecord {
  questionId: string;
  topic: string;
  failCount: number;      
  lastFailedAt: number;   
}

export class HardwareQuizDB extends Dexie {
  playerStats!: Dexie.Table<PlayerStats, number>;
  errorBook!: Dexie.Table<ErrorRecord, string>;

  constructor() {
    super('HardwareQuizDatabase');
    this.version(1).stores({
      playerStats: '++id', 
      errorBook: 'questionId, topic' 
    });
  }
}

export const db = new HardwareQuizDB();

export async function initPlayerStats() {
  const stats = await db.playerStats.toArray();
  if (stats.length === 0) {
    // 初始化时给一个空的进度字典
    await db.playerStats.add({ xp: 0, hearts: 5, campaignProgress: {} });
  }
}