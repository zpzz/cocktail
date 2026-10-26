package com.cocktail.workbench.domain;

import java.math.BigDecimal;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/** 工作台草稿里已选的一种材料及用量。 */
@Data
@TableName("workbench_session_item")
public class WorkbenchSessionItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 外键 → workbench_session.id（不是 UUID 那个 session_id） */
    private Long sessionPk;

    private Long ingredientId;

    private String name;

    private BigDecimal amount;

    private String unit;

    private int orderIndex = 1;
}
