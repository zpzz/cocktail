import type {
  IngredientItem,
  RecognizeMatched,
  RecognizeResponse,
} from '../types/api';

export function matchedToIngredientCandidates(
  hits: RecognizeMatched[],
): IngredientItem[] {
  return hits.map((h) => ({
    id: h.ingredientId,
    name: h.name,
    nameEn: h.nameEn,
    category: h.category,
    subCategory: h.subCategory,
    imageUrl: h.imageUrl,
  }));
}

export type RecognizeUiSummary = {
  candidates: IngredientItem[];
  keywords: string[];
  unmatchedLabels: string[];
  keywordText: string;
  alertTitle: string;
  alertMessage: string;
};

/** 识图结果 → 候选列表 + 提示文案（不自动勾选） */
export function summarizeRecognizeResult(
  res: RecognizeResponse,
): RecognizeUiSummary {
  const hits = res.matched ?? [];
  const keywords = (res.keywords ?? []).map((k) => k.trim()).filter(Boolean);
  const unmatchedLabels = (res.unmatched ?? [])
    .map((u) => u.rawLabel)
    .filter(Boolean);
  const candidates = matchedToIngredientCandidates(hits);
  const keywordText = keywords.length > 0 ? keywords.join('、') : '';

  let alertMessage: string;
  if (hits.length === 0) {
    alertMessage =
      unmatchedLabels.length > 0
        ? `识别到：${unmatchedLabels.join('、')}，但目录中没有匹配材料，可手动搜索添加`
        : '没有识别出可用品牌，请换一张更清晰的酒瓶正面照，或手动搜索添加';
  } else {
    const parts = [
      keywords.length > 0 ? `识别到「${keywords.join('、')}」` : '识别完成',
      `已筛出 ${hits.length} 项候选，请勾选要加入酒柜的材料`,
    ];
    if (unmatchedLabels.length > 0) {
      parts.push(`未匹配：${unmatchedLabels.join('、')}`);
    }
    alertMessage = parts.join('\n');
  }

  return {
    candidates,
    keywords,
    unmatchedLabels,
    keywordText,
    alertTitle: '识别完成',
    alertMessage,
  };
}
