import { defineSignal } from '@temporalio/workflow';

// ユーザーが提出する検索条件


// 調査Agentが検索中に送る途中経過
export interface SearchProgress {
  message: string;
}

// 調査Agentの最終検索結果
export interface SearchResult {
  summary: string;
}

// シグナル:
// (3) 用
export const userConditionSignal = defineSignal<[PropertyCondition]>('condition');
export const userConvincedSignal = defineSignal<[string]>('finish');

// (6) 用
export const searchProgressSignal = defineSignal<[SearchProgress]>('searchProgress');
export const searchCompleteSignal = defineSignal<[SearchResult]>('searchComplete');

// 仮のActivity (実際には外部検索を開始する)
import { proxyActivities } from '@temporalio/workflow';
import { createIterativeLoopRequest, createProgressReportingRequest } from './helpers/requestHelpers';
import { PropertyCondition } from './activities/types';
import { TASK_QUEUE_NAME } from './shared';

// python側のworkerで実行されるActivityの型定義
interface PythonActivities {
  // Activity の型定義
  startSearchActivity(condition: PropertyCondition): Promise<string>;
}


const { startSearchActivity } = proxyActivities<PythonActivities>({
  taskQueue: "PYTHON_TASKQUEUE",
  startToCloseTimeout: '10 minutes',
});

interface TypescriptActivities {
  // Activity の型定義
  postChatMessage(
    chatSessionId: string,
    message: string
  ): Promise<string>
}

const {postChatMessage} = proxyActivities<TypescriptActivities>({
  taskQueue: TASK_QUEUE_NAME,
  startToCloseTimeout: '10 minute',
});



/**
 * factoryPatternWorkflow:
 * - ユーザーが (3) の繰り返し提出 ＝ `conditionSignal` / `finishSignal`
 * - 調査Agentの検索は (6) 途中経過(Progress)を都度連絡し、完了時にFinalを返す拡張版
 * - Activityの戻り値(AResult) も onStartedコールバックで扱える
 */
export async function relifeResearchWorkflow(chatSessionId: string): Promise<void> {
  console.log('[DEBUG] relifeResearchWorkflow start with chatSessionId:', chatSessionId);
  await postChatMessage(chatSessionId, "[😎マネージャーのコメント] 調査員が賃貸を探せるように待機しています 🙋‍♂️")

  /**
   * (6) 途中経過 + 完了時にFinalを受け取り、さらに「Activityの戻り値(AResult)をonStartedで使う」版。
   *
   * ここでは:
   * - AResult = string (仮に "JobID" と想定)
   * - AArgs   = [PropertyCondition] (Activity引数)
   * - Progress= SearchProgress (途中経過)
   * - Final   = SearchResult (外部から完了時に渡される最終リスト)
   */
  const progressReq = createProgressReportingRequest<
    string,         // AResult: Activity戻り値
    [PropertyCondition], // AArgs: Activityに渡す引数
    SearchProgress,  // 途中経過シグナルの型
    SearchResult   // Final   : 完了シグナルで渡す最終結果
  >(
    // Activityで長時間処理開始
    startSearchActivity,

    // 途中経過シグナル
    searchProgressSignal,

    // 完了シグナル(Finalを含む)
    searchCompleteSignal,


    // onStarted: Activity戻り値(AResult)を活用する箇所
    async (jobId) => {
      await postChatMessage(chatSessionId, "[👩‍💼 マネージャーのコメント] 調査員が賃貸を探しています 👍")
      console.log('[DEBUG] Search job started. jobId:', jobId);

      // 必要なら DB記録したり他のActivityを呼んだり...
    }, 

    // onProgress: 途中経過が来るたびに呼ぶ
    async (prog) => {
      console.log('[DEBUG] Partial search result:', prog.message);
      await postChatMessage(chatSessionId, `[🧑‍💻 調査員のコメント] ${prog.message}`)
    },

  );

  /**
   * (3) 繰り返し提出用ファクトリ:
   * - ユーザーの conditionSignal(新しい検索条件) を受け取る
   * - finishSignal で終わり
   * - onSubmission で progressReq(...) を呼んで実際に検索させる
   */
  const iterativeReq = createIterativeLoopRequest(

    // ユーザーが提出する検索条件
    userConditionSignal,

    // ユーザーが納得した検索結果
    userConvincedSignal,

    // 調査条件を受け取った時に実行する処理
    async (cond) => {
      // 新しい検索条件を受け取ったら
      console.log('[DEBUG] New condition submitted:', {request: cond.request});

      // (6) の検索を実行。完了シグナルで受け取る最終結果を得る
      const finalRes = await progressReq({request: cond.request});
      await postChatMessage(chatSessionId, "[🧑‍💻 調査員のコメント] 一旦調査が完了しました、調査結果を確認してください😆")
      await postChatMessage(chatSessionId, "[👩‍💼 マネージャーのコメント] 調査結果: " + finalRes.summary)

      console.log('[DEBUG] Final search result from agent:', finalRes);
      // ここでユーザーへ結果を提示など...
    }
  );

  // (3) のループ実行 → ユーザーがfinishSignal送るまで継続
  console.log('[DEBUG] relifeResearchWorkflow start');
  console.log('[DEBUG] relifeResearchWorkflow: waiting for conditionSignal...');

  await iterativeReq();
  await postChatMessage(chatSessionId, "[👩‍💼 マネージャーのコメント] そちらの物件をみてみたいのですね、手配しますね！")

  console.log('[DEBUG] relifeResearchWorkflow: finishSignal received, done.');
}