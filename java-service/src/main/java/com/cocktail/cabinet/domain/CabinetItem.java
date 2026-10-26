package com.cocktail.cabinet.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/**
 * 酒柜库存表 {@code cabinet_item}（库内实体，接口对外看 {@code CabinetDtos}）。
 */
@Data
@TableName("cabinet_item")
public class CabinetItem {

    /** 主键 */
    @TableId(type = IdType.AUTO)
    private Long id;

    /** 所属用户 ID */
    private Long userId;

    /** 知识库材料 ID（kb_ingredient.id） */
    private Long ingredientId;

    /** 材料中文名（加入时从知识库拷贝） */
    private String name;

    /** 材料英文名 / 品牌 */
    private String nameEn;

    /** 一级分类，如：基酒、利口酒、糖浆 */
    private String category;

    /** 二级分类，如：金酒、伏特加（基酒下） */
    private String subCategory;

    /** 库存数量；余量未知时可为空 */
    private BigDecimal quantity;

    /** 单位，如 ml、瓶 */
    private String unit;

    /** 是否已知余量；false 时前端可显示「余量未知」 */
    private boolean quantityKnown = true;

    /** 开瓶日期（P1，可空） */
    private LocalDate openedAt;

    /** 创建时间 */
    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;

    /** 更新时间 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Instant updatedAt;
}
