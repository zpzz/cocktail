package com.cocktail.recipe.api;

import java.util.List;
import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;

public final class RecipeDtos {

    private RecipeDtos() {
    }

    @Schema(description = "知识库配方摘要（首页推荐等）")
    public record RecipeSummary(
            @Schema(description = "配方 ID") Long id,
            @Schema(description = "中文名") String name,
            @Schema(description = "英文名") String nameEn,
            @Schema(description = "品类") String category,
            @Schema(description = "基酒") String baseSpirit,
            @Schema(description = "杯型") String glass,
            @Schema(description = "技法") String method,
            @Schema(description = "风味标签") List<String> flavorTags,
            @Schema(description = "配图 URL") String imageUrl
    ) {
    }

    @Schema(description = "配方材料用量")
    public record RecipeIngredient(
            @Schema(description = "材料名") String name,
            @Schema(description = "英文名") String nameEn,
            @Schema(description = "用量") Double amount,
            @Schema(description = "单位") String unit,
            @Schema(description = "材料图") String imageUrl
    ) {
    }

    @Schema(description = "配方步骤")
    public record RecipeStep(
            @Schema(description = "顺序，从 1 起") int order,
            @Schema(description = "步骤文案") String text
    ) {
    }

    @Schema(description = "知识库配方详情（材料/步骤来自库；风味等可由 AI enrich）")
    public record RecipeDetail(
            @Schema(description = "配方 ID") Long id,
            @Schema(description = "中文名") String name,
            @Schema(description = "英文名") String nameEn,
            @Schema(description = "品类") String category,
            @Schema(description = "基酒") String baseSpirit,
            @Schema(description = "杯型") String glass,
            @Schema(description = "技法编码") String method,
            @Schema(description = "技法展示文案") String methodLabel,
            @Schema(description = "冰型") String iceType,
            @Schema(description = "装饰") String garnish,
            @Schema(description = "酒精度，如「约 12%」") String abvRange,
            @Schema(description = "简介") String description,
            @Schema(description = "风味标签") List<String> flavorTags,
            @Schema(description = "做法全文") String instructions,
            @Schema(description = "配图 URL") String imageUrl,
            @Schema(description = "材料列表") List<RecipeIngredient> ingredients,
            @Schema(description = "分步步骤（由 instructions 拆分）") List<RecipeStep> steps
    ) {
    }

    @Schema(description = "AI 补全的风味等展示字段")
    public record RecipeEnrich(
            @Schema(description = "风味摘要") String flavorSummary,
            @Schema(description = "酒精度（库内为空时由 AI 估）") String abvRange,
            @Schema(description = "难度：简单/中等/进阶") String difficulty,
            @Schema(description = "口感标签") String taste,
            @Schema(description = "六维风味画像 0~1") Map<String, Object> flavorProfile
    ) {
    }
}
