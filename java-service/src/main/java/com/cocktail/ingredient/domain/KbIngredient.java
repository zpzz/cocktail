package com.cocktail.ingredient.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/**
 * 只读映射 Python 维护的 kb_ingredient。
 * Java 只查不改；表结构变更归 ai-service。
 */
@Data
@TableName("kb_ingredient")
public class KbIngredient {

    @TableId
    private Long id;

    private String name;

    private String nameEn;

    private String slug;

    private String category;

    private String primaryUnit;

    private String imageUrl;
}
