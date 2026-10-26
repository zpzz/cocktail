package com.cocktail.user.domain;

import java.time.Instant;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/** 长时效刷新令牌；用过后应 revoked=true，防止重复使用。 */
@Data
@TableName("refresh_token")
public class RefreshToken {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private String token;

    private Instant expiresAt;

    private boolean revoked;

    @TableField(fill = FieldFill.INSERT)
    private Instant createdAt;
}
