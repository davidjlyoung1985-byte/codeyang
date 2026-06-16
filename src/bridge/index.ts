/**
 * Bridge — CodeYang ↔ Claude Code 通信桥接模块
 *
 * 快速开始:
 *
 *   # 终端 1: 启动桥接服务器
 *   npx tsx src/bridge/server.ts
 *
 *   # 终端 2: 在 Claude Code 中运行代理
 *   set BRIDGE_TOKEN=<上一步获取的 token>
 *   npx tsx src/bridge/claude-agent.ts
 *
 *   # 现在 CodeYang 可以使用 claude_code 工具与 Claude Code 通信
 */

export type { BridgeTask, BridgeMessage, BridgeConfig, AgentId, WsEvent } from './types.js';
export { startBridgeServer } from './server.js';
export {
  configureBridge,
  checkBridgeHealth,
  sendTaskToClaude,
  sendMessageToClaude,
  getMessagesFromClaude,
  writeSharedFile,
  readSharedFile,
  getBridgeToken,
} from './client.js';
