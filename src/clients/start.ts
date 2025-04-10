// progress-sample/client/start.ts

import { Connection, Client } from '@temporalio/client';
import { relifeResearchWorkflow } from '../workflows';
import { TASK_QUEUE_NAME } from '../shared';

async function main() {
const args = process.argv.slice(2);
if (args.length < 1) {
    console.error(`
    ERROR: Insufficient arguments.

    Usage:
        yarn workflow-start <CHAT_SESSION_ID>

    <CHAT_SESSION_ID> is the ID of the chat session.
`);
    process.exit(1);
}

const [chatSessionId] = args;

  console.log('[DEBUG] Connecting to Temporal server...');
  const connection = await Connection.connect();
  const client = new Client({ connection });

  // 例: 時刻を用いてユニークなWorkflowIdを作成
  const timestamp = Date.now(); // ミリ秒単位のタイムスタンプ
  const workflowId = `async-progress-workflow-${timestamp}`;

  // ワークフロー開始
  console.log(`[DEBUG] Starting asyncProgressWorkflow with ID: ${workflowId}`);
await client.workflow.start(relifeResearchWorkflow, {
    taskQueue: TASK_QUEUE_NAME,
    workflowId,
    args: [chatSessionId],
  });

  console.log('[DEBUG] Workflow started with ID:', workflowId);

// ここで handle.result() は呼ばない。
  // 後続で別のコードがシグナルを送るまでワークフローは待機し続ける

  await connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
