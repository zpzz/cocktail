package com.cocktail.recipe.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import com.cocktail.recipe.domain.KbRecipeIngredientRow;

/** 只读查配方材料用量。 */
@Mapper
public interface KbRecipeIngredientMapper {

    @Select("""
            SELECT i.name AS name,
                   i.name_en AS name_en,
                   ri.amount AS amount,
                   ri.unit AS unit,
                   ri.order_index AS order_index,
                   i.image_url AS image_url
            FROM kb_recipe_ingredient ri
            INNER JOIN kb_ingredient i ON i.id = ri.ingredient_id
            WHERE ri.recipe_id = #{recipeId}
            ORDER BY ri.order_index ASC, ri.id ASC
            """)
    List<KbRecipeIngredientRow> selectByRecipeId(@Param("recipeId") long recipeId);
}
