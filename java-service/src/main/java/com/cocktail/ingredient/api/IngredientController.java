package com.cocktail.ingredient.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.cocktail.ingredient.api.IngredientDtos.CategoriesResponse;
import com.cocktail.ingredient.api.IngredientDtos.SearchResponse;
import com.cocktail.ingredient.domain.IngredientService;
import com.cocktail.shared.web.ApiResponse;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;

/** 材料分类与搜索，GET 可匿名。 */
@Tag(name = "材料目录", description = "只读知识库 kb_ingredient，供酒柜加料与工作台选料")
@RestController
@RequestMapping("/api/ingredients")
public class IngredientController {

    private final IngredientService ingredientService;

    public IngredientController(IngredientService ingredientService) {
        this.ingredientService = ingredientService;
    }

    @Operation(summary = "材料分类树", description = "一级分类 + 基酒下的二级（金酒/伏特加等）")
    @GetMapping("/categories")
    public ApiResponse<CategoriesResponse> categories() {
        return ApiResponse.ok(ingredientService.categories());
    }

    @Operation(summary = "模糊搜索材料", description = "匹配中英文名/品牌；不传 category 则全库搜索")
    @GetMapping("/search")
    public ApiResponse<SearchResponse> search(
            @Parameter(description = "关键词") @RequestParam(required = false) String q,
            @Parameter(description = "一级分类") @RequestParam(required = false) String category,
            @Parameter(description = "二级分类") @RequestParam(required = false) String subCategory,
            @Parameter(description = "页码，从 1 开始") @RequestParam(defaultValue = "1") int page,
            @Parameter(description = "每页条数") @RequestParam(defaultValue = "20") int size
    ) {
        return ApiResponse.ok(ingredientService.search(q, category, subCategory, page, size));
    }
}
