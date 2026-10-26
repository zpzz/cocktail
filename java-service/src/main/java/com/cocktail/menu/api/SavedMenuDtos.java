package com.cocktail.menu.api;

import java.time.Instant;
import java.util.List;

import com.cocktail.cabinet.api.CabinetDtos.MenuRecipe;

import io.swagger.v3.oas.annotations.media.Schema;

public final class SavedMenuDtos {

    private SavedMenuDtos() {
    }

    @Schema(description = "酒单列表项")
    public record SavedMenuSummary(
            @Schema(description = "酒单 ID") Long id,
            @Schema(description = "标题") String title,
            @Schema(description = "来源") String source,
            @Schema(description = "配方数量") int recipeCount,
            @Schema(description = "创建时间") Instant createdAt
    ) {
    }

    @Schema(description = "酒单详情")
    public record SavedMenuDetail(
            @Schema(description = "酒单 ID") Long id,
            @Schema(description = "标题") String title,
            @Schema(description = "来源") String source,
            @Schema(description = "配方数量") int recipeCount,
            @Schema(description = "创建时间") Instant createdAt,
            @Schema(description = "配方列表") List<MenuRecipe> recipes
    ) {
    }

    @Schema(description = "手动保存酒单请求（生成接口也会自动保存）")
    public record SaveMenuRequest(
            @Schema(description = "标题；不传则自动生成") String title,
            @Schema(description = "配方列表", requiredMode = Schema.RequiredMode.REQUIRED)
            List<MenuRecipe> recipes
    ) {
    }
}
