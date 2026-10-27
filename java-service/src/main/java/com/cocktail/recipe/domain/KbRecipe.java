package com.cocktail.recipe.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/**
 * 只读映射 Python 维护的 kb_recipe。
 * Java 只查不改；表结构变更归 ai-service。
 */
@Data
@TableName("kb_recipe")
public class KbRecipe {

    @TableId
    private Long id;

    private String name;

    private String nameEn;

    private String category;

    private String baseSpirit;

    private String glass;

    private String method;

    /** 展示用技法文案，如「Shake 摇荡」 */
    private String methodLabel;

    private String iceType;

    private String garnish;

    private String abvRange;

    private String description;

    /** JSON 数组字符串，如 ["清爽","酸甜"] */
    private String flavorTags;

    private String instructions;

    private String imageUrl;
}
