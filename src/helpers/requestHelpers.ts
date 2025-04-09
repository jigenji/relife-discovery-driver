/**
 * requestHelpers.ts
 *
 * (1) その場で完了を待つ
 * (2) 終わったら連絡 (王道)
 * (6) 途中経過を都度連絡 (進捗は内部に保持・返却しない)
 *
 * 「仕事を依頼する際の共通ヘルパー集」をイメージできるファイル名。
 * それぞれのパターンで使うシグナルやActivityを注入する形で、
 * 柔軟に再利用できます。
 */

import { setHandler, condition } from '@temporalio/workflow';
import type { SignalDefinition } from '@temporalio/workflow';

/**
 * (1) その場で完了を待つ
 * ------------------------------------------------------------------
 * [概要]
 *   - 短時間で終わるActivityを、同期的に呼び出して完了を待つパターン。
 *   - Activityの戻り値をワークフローに返せる。
 *   - 長時間には不向きだが、処理がすぐ終わるならシンプルに書ける。
 *
 * [使い方の例]
 *   // 1) ワークフロー内でヘルパー関数生成
 *   const shortRequest = createSyncWaitRequest(someShortActivity);
 *   
 *   // 2) 実行するとActivityを同期的に呼んで完了を待ち、返り値を受け取る
 *   const result = await shortRequest(arg1, arg2, ...);
 *
 * [引数]
 *   - activityFn: (...args => Promise<T>)
 *       → 実際に呼び出したいActivity関数。短時間で終わる想定
 * 
 * [戻り値]
 *   - T: Activityの返り値の型
 */
export function createSyncWaitRequest<
  T,
  Args extends any[]
>(
  activityFn: (...args: Args) => Promise<T>
) {
  return async function syncWait(...args: Args): Promise<T> {
    // 同期的にActivity呼び出し→完了まで待って結果を返す
    return await activityFn(...args);
  };
}

/**
 * (2) 終わったら連絡（王道）
 * ------------------------------------------------------------------
 * [概要]
 *   - 外部ジョブを開始するActivityを呼んで、"done"シグナルを待機するパターン。
 *   - シグナルが届くまでワークフローは一時停止し、完了連絡を受けたら再開。
 *   - Activityの戻り値(例: jobId)をワークフローに返せる。
 *
 * [使い方の例]
 *   // 1) シグナル定義をワークフロー内などで用意
 *   export const doneSignal = defineSignal('done');
 *
 *   // 2) ヘルパー関数を生成
 *   const waitForDone = createWaitForDoneRequest(startJobActivity, doneSignal);
 *
 *   // 3) 実行すると「Activity呼び出し→doneシグナル待機→結果返却」フロー
 *   const jobResult = await waitForDone(arg1, arg2, ...);
 *
 * [引数]
 *   - startActivity: (...args => Promise<T>)
 *       → 外部ジョブを開始するActivity
 *   - doneSignalDef: SignalDefinition<[]>
 *       → "完了"を知らせるシグナルの定義 (引数なし)
 *
 * [戻り値]
 *   - T: Activityの返り値 (例: jobId)
 */
export function createWaitForDoneRequest<
  T,
  Args extends any[],
  Final,     // 完了シグナルで送る最終結果

>(
  startActivity: (...args: Args) => Promise<T>,
  doneSignalDef: SignalDefinition<[Final]>
) {
  return async function waitForDone(...activityArgs: Args): Promise<T> {
    let isDone = false;

    // シグナルを受信したら isDone = true
    setHandler(doneSignalDef, () => {
      isDone = true;
    });

    // Activityを呼び出して外部ジョブ開始
    const result = await startActivity(...activityArgs);

    // シグナルが来るまで待機
    await condition(() => isDone);

    return result;
  };
}

/**
 * (3) 繰り返し提出 (Iterative Loop)
 * ------------------------------------------------------------------
 * [概要]
 *   - 外部が何度も「提出シグナル」を送ってきて、
 *     ワークフロー側はそれを受け取り、レビュー等を行う。
 *   - 最終的に「finishシグナル」が届いたらループ終了。
 *   - 何度でも再提出/修正を繰り返すイメージ。
 *
 * [使い方の例]
 *   // 1) シグナル定義
 *   export const submissionSignal = defineSignal<[MySubmission]>('submission');
 *   export const finishSignal = defineSignal('finish');
 *
 *   // 2) ヘルパー関数を生成
 *   const iterativeReq = createIterativeLoopRequest(
 *     submissionSignal, finishSignal,
 *     (sub) => { console.log('New submission:', sub); }
 *   );
 *
 *   // 3) 実行
 *   await iterativeReq();
 *   // ループを抜けたら finish とみなす
 *
 * [引数]
 *   - submissionSignalDef: SignalDefinition<[Submission]>
 *       → 外部が都度提出物を渡してくるシグナル
 *   - finishSignalDef: SignalDefinition<[]>
 *       → もう作業完了して良い場合に呼ばれるシグナル
 *   - onSubmission?: (sub: Submission) => void
 *       → 提出が来るたびに行いたい処理 (レビューActivity呼び出し等)
 *
 * [戻り値]
 *   - void: ループを抜ければ終了
 */
export function createIterativeLoopRequest<
  Args extends any[],
  Submission,  // 提出物の型
  Final,     // 完了シグナルで送る最終結果
>(
  submissionSignalDef: SignalDefinition<[Submission]>,
  finishSignalDef: SignalDefinition<[Final]>,
  onSubmission?: (sub: Submission) => void
) {
  return async function iterativeLoop(..._args: Args): Promise<void> {
    let isDone = false;
    let lastSubmission: Submission | undefined;

    // finishSignal 受信時には done=true
    setHandler(finishSignalDef, () => {
      isDone = true;
    });

    // submissionSignal 受信時に submissionデータを保存
    setHandler(submissionSignalDef, (sub) => {
      lastSubmission = sub;
      if (onSubmission) {
        onSubmission(sub);
      }
    });

    // 何度でも再提出を受け取れるループ
    while (!isDone) {
      // 提出 or finish が来るまで待つ
      await condition(() => lastSubmission !== undefined || isDone);
      if (isDone) break;

      // 提出物があれば consume
      lastSubmission = undefined;
      // ここでレビューActivityを呼ぶ等の処理も書ける
      // 例: const reviewResult = await reviewActivity(sub);

      // また次の提出やfinishを待つためにループに戻る
    }
  };
}


/**
 * (6) 途中経過を都度連絡（＋完了時に最終結果を受け取り、Activity結果も利用可能）
 * ------------------------------------------------------------------
 * [概要]
 *   - Activityで長い処理を開始し、その戻り値(AResult)を使って何か追加処理が必要なときに
 *     "onStarted" コールバックを呼び出せる仕組みを加えた拡張版
 *   - 途中経過シグナル(Progress)を複数回受信→onProgress
 *   - 完了シグナル(引数: Final)で終了→ return Final
 *
 * [使い方の例]
 *   // 1) シグナル定義
 *   //    const updateSignal = defineSignal<[Progress]>('progressUpdate');
 *   //    const completeSignal = defineSignal<[Final]>('completeWithFinal');
 *
 *   // 2) ファクトリ呼び出し
 *   const progressReq = createProgressReportingRequestWithFinalAndStarted(
 *     startLongJobActivity,
 *     updateSignal,
 *     completeSignal,
 *     (progressData) => { console.log('progress:', progressData); },
 *     (activityRes) => { console.log('started job, got result:', activityRes); }
 *   );
 *
 *   // 3) 実行: const finalResult = await progressReq(...args);
 *      // 途中経過を onProgress で受け取り、完了で finalResult を返す。
 *      // onStarted で activityResult を使って別処理を呼び出す等も可能。
 */
export function createProgressReportingRequest<
  AResult,   // Activityの戻り値
  AArgs extends any[],
  Progress,  // 途中経過を受け取るシグナル (Progress型)
  Final,     // 完了シグナルで送る最終結果
>(
  startLongJobActivity: (...args: AArgs) => Promise<AResult>,

  /**
   * 途中経過を受け取るシグナル (Progress型)
   */
  updateSignalDef: SignalDefinition<[Progress]>,

  /**
   * 完了シグナル (Final型を含む)
   */
  completeSignalDef: SignalDefinition<[Final]>,

  /**
   * Activityの戻り値(AResult)を使って何かしたい場合のコールバック(任意)
   * 例: jobIdをDBに記録、さらなるActivity呼び出しなど
   */
  onStarted?: (activityResult: AResult) => void,

  /**
   * 途中経過シグナルを受け取るたびに呼ぶコールバック(任意)
   */
  onProgress?: (progressData: Progress) => void,


) {
  return async function progressRequest(...activityArgs: AArgs): Promise<Final> {
    // 完了シグナルが来たかを示すフラグ
    let isDone = false;

    // 完了シグナルの引数を格納する変数
    let finalData: Final | undefined;

    // 途中経過シグナルを受信
    setHandler(updateSignalDef, (progressValue: Progress) => {
      if(!isDone) onProgress?.(progressValue);
    });

    // 完了シグナル(最終結果)
    setHandler(completeSignalDef, (finalVal: Final) => {
      if(!isDone) {
        finalData = finalVal;
        isDone = true;
      }
    });

    // (1) Activityで長時間処理を開始
    const activityResult: AResult = await startLongJobActivity(...activityArgs);

    // (1b) Activity戻り値をコールバックで扱いたい場合はここで
    if (onStarted) {
      onStarted(activityResult);
    }

    // (2) 完了シグナルが来るまで待機(外部が途中経過シグナルを複数回送れる)
    await condition(() => isDone);

    // (3) 完了シグナルに含まれた finalData を返す
    return finalData!;
  };
}


