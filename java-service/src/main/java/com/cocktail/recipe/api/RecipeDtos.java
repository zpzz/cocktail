package com.cocktail.recipe.api;

import java.util.List;

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
}
