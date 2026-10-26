package com.cocktail.ingredient.mapper;

import org.apache.ibatis.annotations.Mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cocktail.ingredient.domain.KbIngredient;

/** 只读查 kb_ingredient。 */
@Mapper
public interface KbIngredientMapper extends BaseMapper<KbIngredient> {
}
