// progress-sample/client/progress.ts

import { Connection, Client } from '@temporalio/client';
import { userConditionSignal } from '../workflows';

async function main() {
  // process.argv[2] → workflowId
  // process.argv[3] → progress (number)
  const args = process.argv.slice(2);
  console.log(`[DEBUG] Parsing arguments: ${args}`);
  if (args.length < 2) {
    console.error(`
        ERROR: Insufficient arguments.

        Usage:
        yarn update-progress <WORKFLOW_ID> <CONDITION>

        Example:
        yarn update-progress myWorkflow123 50

        <WORKFLOW_ID> is the ID of the workflow you started earlier.
        <CONDITION> is a number (e.g., 10, 50, 90).
    `);
    process.exit(1);
  }

  const [workflowId, request] = args;

  console.log(`[DEBUG] Parsed workflowId: ${workflowId}, condition: ${request}`);

  // Temporalサーバに接続
  console.log("[DEBUG] Connecting to Temporal server...");
  const connection = await Connection.connect();
  const client = new Client({ connection });

  // すでに起動中のワークフローを取得
  console.log(`[DEBUG] Getting workflow handle for ID: ${workflowId}`);
  const handle = client.workflow.getHandle(workflowId);
  
  // 途中経過シグナルを送る (例: progress=50)
  console.log(`[DEBUG] Sent update signal to workflow: ${workflowId} with progress=${request}`);
  await handle.signal(userConditionSignal, { request });
  console.log(`[DEBUG] Signal sent to workflow: ${workflowId} with progress=${request}`);


  console.log(`[DEBUG] Workflow ${workflowId} is still running...`);
  await connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
