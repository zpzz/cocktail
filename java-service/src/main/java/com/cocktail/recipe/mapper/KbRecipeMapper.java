package com.cocktail.recipe.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cocktail.recipe.domain.KbRecipe;

/** 只读查 kb_recipe。 */
@Mapper
public interface KbRecipeMapper extends BaseMapper<KbRecipe> {

    @Select("""
            SELECT id, name, name_en, category, base_spirit, glass, method, flavor_tags, image_url
            FROM kb_recipe
            WHERE image_url IS NOT NULL AND TRIM(image_url) <> ''
            ORDER BY RANDOM()
            LIMIT 1
            """)
    KbRecipe selectRandomWithImage();

    @Select("""
            SELECT id, name, name_en, category, base_spirit, glass, method, flavor_tags, image_url
            FROM kb_recipe
            ORDER BY RANDOM()
            LIMIT 1
            """)
    KbRecipe selectRandomAny();
}
