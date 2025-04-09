export interface PropertyCondition {
  request: string;
}

// Add Activity Definitions here.
export async function startSearchActivity(condition: PropertyCondition): Promise<string> {
  return `Start search with condition = ${condition.request}!`;
}
