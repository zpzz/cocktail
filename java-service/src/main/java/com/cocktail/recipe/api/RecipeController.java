package com.cocktail.recipe.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.cocktail.recipe.api.RecipeDtos.RecipeDetail;
import com.cocktail.recipe.api.RecipeDtos.RecipeEnrich;
import com.cocktail.recipe.api.RecipeDtos.RecipeSummary;
import com.cocktail.recipe.domain.RecipeService;
import com.cocktail.shared.web.ApiResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "配方目录", description = "只读 kb_recipe；详情材料/步骤查库，风味等可 AI 补全")
@RestController
@RequestMapping("/api/cocktail/recipes")
public class RecipeController {

    private final RecipeService recipeService;

    public RecipeController(RecipeService recipeService) {
        this.recipeService = recipeService;
    }

    @Operation(summary = "随机一条配方", description = "直接查库；默认优先返回带配图的配方")
    @GetMapping("/random")
    public ApiResponse<RecipeSummary> random(
            @Parameter(description = "是否优先带图") @RequestParam(defaultValue = "true") boolean preferImage
    ) {
        return ApiResponse.ok(recipeService.random(preferImage));
    }

    @Operation(summary = "配方详情", description = "材料与步骤来自知识库，不含 AI 风味字段")
    @GetMapping("/{id}")
    public ApiResponse<RecipeDetail> detail(
            @Parameter(description = "配方 ID") @PathVariable long id
    ) {
        return ApiResponse.ok(recipeService.detail(id));
    }

    @Operation(summary = "AI 补全风味", description = "根据材料/做法生成风味摘要、口感、难度、六维画像")
    @PostMapping("/{id}/enrich")
    public ApiResponse<RecipeEnrich> enrich(
            @Parameter(description = "配方 ID") @PathVariable long id
    ) {
        return ApiResponse.ok(recipeService.enrich(id));
    }
}
