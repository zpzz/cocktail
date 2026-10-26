package com.cocktail.menu.domain;

import java.time.Instant;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/** 用户保存的酒单头表 {@code saved_menu}。 */
@Data
@TableName("saved_menu")
public class SavedMenu {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private String title;

    /** 来源：cabinet=用库存生成 */
    private String source = "cabinet";

    private int recipeCount;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Instant updatedAt;
}
