/** 登录成功时递增，作废进行中的 hydrate，避免空结果冲掉登录态 */
let hydrateEpoch = 0;

export function nextHydrateEpoch(): number {
  return ++hydrateEpoch;
}

export function currentHydrateEpoch(): number {
  return hydrateEpoch;
}

export function bumpAuthEpoch() {
  hydrateEpoch += 1;
}
