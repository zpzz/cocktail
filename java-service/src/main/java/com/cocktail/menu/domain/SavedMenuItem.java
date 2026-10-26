package com.cocktail.menu.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/** 酒单中的一条配方快照 {@code saved_menu_item}。 */
@Data
@TableName("saved_menu_item")
public class SavedMenuItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long menuId;

    /** kb_recipe.id（无 FK，知识库归 Python） */
    private Long recipeId;

    private String name;

    private String nameEn;

    private String category;

    private String baseSpirit;

    private String glass;

    private String method;

    private String imageUrl;

    private String matchType;

    /** JSON 数组字符串 */
    private String missingJson;

    /** JSON 数组字符串 */
    private String substitutesJson;

    /** 做法步骤全文 */
    private String instructions;

    /** 材料用量 JSON 数组 */
    private String ingredientsJson;

    private int orderIndex = 1;
}
