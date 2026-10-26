package com.cocktail.ingredient.api;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

public final class IngredientDtos {

    private IngredientDtos() {
    }

    @Schema(description = "二级分类")
    public record CategoryChild(
            @Schema(description = "分类编码", example = "金酒") String code,
            @Schema(description = "展示名", example = "金酒") String name
    ) {
    }

    @Schema(description = "一级分类（可含子分类）")
    public record CategoryNode(
            @Schema(description = "分类编码", example = "基酒") String code,
            @Schema(description = "展示名", example = "基酒") String name,
            @Schema(description = "二级分类列表；基酒下有威士忌/金酒等") List<CategoryChild> children
    ) {
    }

    @Schema(description = "材料分类树响应")
    public record CategoriesResponse(
            @Schema(description = "分类列表") List<CategoryNode> categories
    ) {
    }

    @Schema(description = "知识库材料条目")
    public record IngredientItem(
            @Schema(description = "材料 ID") Long id,
            @Schema(description = "中文名") String name,
            @Schema(description = "英文名/品牌") String nameEn,
            @Schema(description = "一级分类") String category,
            @Schema(description = "二级分类（启发式推断，可空）") String subCategory,
            @Schema(description = "主单位", example = "ml") String primaryUnit,
            @Schema(description = "图片 URL") String imageUrl
    ) {
    }

    @Schema(description = "材料搜索分页结果")
    public record SearchResponse(
            @Schema(description = "材料列表") List<IngredientItem> items,
            @Schema(description = "总条数") long total,
            @Schema(description = "当前页") int page,
            @Schema(description = "每页大小") int size
    ) {
    }
}
