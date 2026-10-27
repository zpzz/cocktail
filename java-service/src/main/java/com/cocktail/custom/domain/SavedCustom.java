package com.cocktail.custom.domain;

import java.time.Instant;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/** 工作台特调成品 {@code saved_custom}。 */
@Data
@TableName("saved_custom")
public class SavedCustom {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private String workbenchSessionId;

    private String name;

    private String nameEn;

    private String glass;

    private String method;

    private String iceType;

    private String garnishesJson;

    private String feeling;

    private String flavorSummary;

    private String abvRange;

    private String difficulty;

    private String taste;

    /** 风味雷达六维 JSON */
    private String flavorProfileJson;

    private String ingredientsJson;

    private String stepsJson;

    private String instructions;

    private String imageUrl;

    private String source = "workbench";

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Instant updatedAt;
}
