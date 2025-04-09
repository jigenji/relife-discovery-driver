// progress-sample/client/done.ts

import { Connection, Client } from '@temporalio/client';
import { userConvincedSignal } from '../workflows';

async function main() {
  // 引数を取得
  // process.argv[2] → workflowId
  // 引数の数が足りない場合はエラーメッセージを表示
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error(`
      ERROR: Insufficient arguments.

      Usage:
        yarn update-progress <WORKFLOW_ID>

      Example:
        yarn update-progress myWorkflow123

      <WORKFLOW_ID> is the ID of the workflow you started earlier.
  `);
    process.exit(1);
  }

  const [workflowId] = args;

  // Temporalサーバに接続
  console.log("[DEBUG] Connecting to Temporal server...");
  const connection = await Connection.connect();
  const client = new Client({ connection });

  // すでに起動中のワークフローを取得
  console.log(`[DEBUG] Getting workflow handle for ID: ${workflowId}`);
  const handle = client.workflow.getHandle(workflowId);

  // 完了シグナル送信
  console.log(`[DEBUG] Sent done signal to workflow: ${workflowId}`);
  await handle.signal(userConvincedSignal, "物件ID1234");
  console.log(`[DEBUG] Signal sent to workflow: ${workflowId}`);

  // ワークフローが終了するまで待つ場合は(このsignalがworkflowの終了条件の場合):
  // await handle.result();

  console.log(`[DEBUG] Workflow ${workflowId} is still running...`);
  await connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
