package com.cocktail.recipe.domain;

import lombok.Data;

/**
 * 配方材料行（kb_recipe_ingredient JOIN kb_ingredient），只读。
 */
@Data
public class KbRecipeIngredientRow {

    private String name;

    private String nameEn;

    private Double amount;

    private String unit;

    private Integer orderIndex;

    private String imageUrl;
}
