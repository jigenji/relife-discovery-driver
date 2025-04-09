// progress-sample/client/start.ts

import { Connection, Client } from '@temporalio/client';
import { relifeResearchWorkflow } from '../workflows';
import { TASK_QUEUE_NAME } from '../shared';

async function main() {
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
