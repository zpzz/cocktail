package com.cocktail.recipe.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.cocktail.recipe.api.RecipeDtos.RecipeSummary;
import com.cocktail.recipe.domain.RecipeService;
import com.cocktail.shared.web.ApiResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "配方目录", description = "只读 kb_recipe，供首页今日推荐等（不依赖 AI 服务）")
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
}
