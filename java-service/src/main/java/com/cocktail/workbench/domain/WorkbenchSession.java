package com.cocktail.workbench.domain;

import java.time.Instant;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/**
 * 调配工作台一局草稿。
 * sessionId = 给前端的 UUID；id = 数据库主键（材料表 session_pk 指向它）。
 */
@Data
@TableName("workbench_session")
public class WorkbenchSession {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String sessionId;

    private Long userId;

    private String status = "draft";

    private String glassCode;

    private Integer capacityMl;

    private String method;

    private String iceType;

    private String garnishes;

    private String feeling;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Instant updatedAt;
}
