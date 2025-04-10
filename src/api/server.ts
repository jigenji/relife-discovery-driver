import express, { Request, Response } from 'express';
import { Connection, Client } from '@temporalio/client';

/**
 * ワークフローやシグナルに必要な定義群をインポート
 * - relifeResearchWorkflow (ワークフロー本体)
 * - userConditionSignal, userConvincedSignal, searchProgressSignal, searchCompleteSignal
 * - 型(PropertyCondition, SearchProgress, SearchResult)
 */
import {
  relifeResearchWorkflow,
  userConditionSignal,
  userConvincedSignal,
  searchProgressSignal,
  searchCompleteSignal,
  SearchProgress,
  SearchResult,
} from '../workflows';

import { PropertyCondition } from '../activities/types';
import { TASK_QUEUE_NAME } from '../shared';

const app = express();
app.use(express.json());

// Temporalクライアントをサーバ起動時に1回生成して使い回す
let connection: Connection;
let client: Client;

async function initTemporal() {
  connection = await Connection.connect();
  client = new Client({ connection });
}

// 1) ワークフロー開始
app.post('/workflow/start', async (req: Request, res: Response) => {
  try {
    // リクエストボディを想定 { workflowId: string, condition: { request: string } }
    const { chatSessionId } = req.body;

    if (!chatSessionId) {
        res.status(400).json({ error: 'Missing chatSessionId' });
        return;
    }

    // workflowIdをユニークにする（例：タイムスタンプ利用）
    const workflowId = `relifeResearchWorkflow-${Date.now()}`;

    // TaskQueueはワークフローが待ち受けているキュー名
    // あるいは "some-queue" など自分で定義
    const taskQueue = TASK_QUEUE_NAME;
    

    // ワークフロー開始
    await client.workflow.start(relifeResearchWorkflow, {
      workflowId,
      taskQueue,
      args: [chatSessionId],
    });

    res.json({ workflowId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// 2) ユーザーの調査依頼リクエスト(userConditionSignal)
app.post('/workflow/request-research', async (req: Request, res: Response) => {
  try {
    // リクエストボディを想定 { workflowId: string, condition: { request: string } }
    const { workflowId, condition } = req.body;

    if (!workflowId || !condition?.request) {
      res.status(400).json({ error: 'Missing workflowId or condition.request' });
      return;
    }

    // ワークフローを特定
    const handle = client.workflow.getHandle(workflowId);

    // シグナル送信
    const cond: PropertyCondition = condition;
    await handle.signal(userConditionSignal, cond);

    res.json({ message: 'Condition signal sent', condition: cond });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// 3) 調査Agentの途中結果送信(searchProgressSignal)
app.post('/workflow/submit-research-progress', async (req: Request, res: Response) => {
  try {
    // リクエストボディ { workflowId: string, partialList: any[], message?: string }
    const { workflowId, message } = req.body;
    if (!workflowId || !message) {
        res.status(400).json({ error: 'Missing workflowId or message' });
        return;
    }

    // ワークフローを特定
    const handle = client.workflow.getHandle(workflowId);

    // 途中進捗オブジェクト
    const progress: SearchProgress = {
      message: message || 'Partial search result',
    };

    // シグナル送信
    await handle.signal(searchProgressSignal, progress);

    res.json({ message: 'Progress signal sent', progress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// 4) 調査Agentの最終結果送信(searchCompleteSignal)
app.post('/workflow/submit-research-result', async (req, res) => {
  try {
    // リクエストボディ { workflowId: string, finalList: any[], summary: string }
    const { workflowId, summary } = req.body;
    if (!workflowId || !summary) {
      res.status(400).json({ error: 'Missing workflowId, finalList, or summary' });
      return;
    }

    // ワークフローを特定
    const handle = client.workflow.getHandle(workflowId);

    // 最終結果オブジェクト
    const result: SearchResult = {
      summary,
    };

    // シグナル送信
    await handle.signal(searchCompleteSignal, result);

    res.json({ message: 'Complete signal sent', finalResult: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// 5) ユーザーの完了リクエスト(userConvincedSignal)
app.post('/workflow/convinced', async (req, res) => {
  try {
    // リクエストボディ { workflowId: string, finishMsg?: string }
    const { workflowId, finishMsg } = req.body;
    if (!workflowId) {
      res.status(400).json({ error: 'Missing workflowId' });
      return;
    }

    // ワークフローを特定
    const handle = client.workflow.getHandle(workflowId);

    // userConvincedSignalは [string] の想定
    const msg: string = finishMsg || 'User decided to finish';

    // シグナル送信
    await handle.signal(userConvincedSignal, msg);

    res.json({ message: 'Finish signal sent', finishMsg: msg });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});


// サーバ起動
const PORT = 3000;
initTemporal().then(() => {
  app.listen(PORT, () => {
    console.log(`Express server listening on port ${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to init Temporal:', err);
  process.exit(1);
});
