package com.cocktail.user.api;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthDtos {

    private AuthDtos() {
    }

    @Schema(description = "注册请求")
    public record RegisterRequest(
            @NotBlank @Size(min = 3, max = 64)
            @Schema(description = "登录用户名", example = "alice", requiredMode = Schema.RequiredMode.REQUIRED)
            String username,
            @NotBlank @Size(min = 6, max = 72)
            @Schema(description = "密码（至少 6 位）", example = "secret12", requiredMode = Schema.RequiredMode.REQUIRED)
            String password,
            @Size(max = 64)
            @Schema(description = "昵称；不传则用用户名")
            String nickname
    ) {
    }

    @Schema(description = "登录请求")
    public record LoginRequest(
            @NotBlank
            @Schema(description = "用户名", requiredMode = Schema.RequiredMode.REQUIRED)
            String username,
            @NotBlank
            @Schema(description = "密码", requiredMode = Schema.RequiredMode.REQUIRED)
            String password
    ) {
    }

    @Schema(description = "刷新令牌请求")
    public record RefreshRequest(
            @NotBlank
            @Schema(description = "登录时返回的 refreshToken", requiredMode = Schema.RequiredMode.REQUIRED)
            String refreshToken
    ) {
    }

    @Schema(description = "用户信息")
    public record UserResponse(
            @Schema(description = "用户 ID") Long userId,
            @Schema(description = "用户名") String username,
            @Schema(description = "昵称") String nickname
    ) {
    }

    @Schema(description = "令牌响应（登录/刷新）")
    public record TokenResponse(
            @Schema(description = "Access Token（JWT），也可写入 Cookie ACCESS_TOKEN") String accessToken,
            @Schema(description = "Refresh Token（随机串，存库）") String refreshToken,
            @Schema(description = "令牌类型，固定 Bearer") String tokenType,
            @Schema(description = "Access Token 有效秒数") long expiresIn
    ) {
    }
}
