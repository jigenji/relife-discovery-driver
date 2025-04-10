/**
 * 🌐 カスタマーサービスにチャットの送信
 * @param string 検索条件
 */
export async function postChatMessage(
  chatSessionId: string,
  message: string
): Promise<string> {
  console.log('[DEBUG] postChatMessage start with chatSessionId:', chatSessionId);

  const endpoint = `http://localhost:8000/string-echo/${chatSessionId}`;
  console.log('[DEBUG] postChatMessage endpoint:', endpoint);
 

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fetch = require('node-fetch');
  
  console.log('[DEBUG] postChatMessage request with message:', message);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: message,
  });
  console.log('[DEBUG] postChatMessage response:', response);

  if (!response.ok) {
    throw new Error(`API call failed: ${response.status} ${response.statusText}`);
  }

  const response_json = (await response.json()) as {result: string};
  console.log('[DEBUG] postChatMessage response_json:', response_json);
  
  return response_json.result;
}
