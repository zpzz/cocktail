package com.cocktail.user.api;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.cocktail.shared.security.AuthCookieSupport;
import com.cocktail.shared.web.ApiResponse;
import com.cocktail.user.api.AuthDtos.LoginRequest;
import com.cocktail.user.api.AuthDtos.RefreshRequest;
import com.cocktail.user.api.AuthDtos.RegisterRequest;
import com.cocktail.user.api.AuthDtos.TokenResponse;
import com.cocktail.user.api.AuthDtos.UserResponse;
import com.cocktail.user.domain.AuthService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

/**
 * 认证接口：注册、登录、刷新、退出。
 * <p>
 * 登录/刷新会 {@code Set-Cookie: ACCESS_TOKEN}，Swagger 同源调试可直接带 Cookie 调需登录接口。
 */
@Tag(name = "认证", description = "注册 / 登录 / 刷新 / 退出；登录会写入 Cookie ACCESS_TOKEN 便于 Swagger 调试")
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final AuthCookieSupport authCookieSupport;

    public AuthController(AuthService authService, AuthCookieSupport authCookieSupport) {
        this.authService = authService;
        this.authCookieSupport = authCookieSupport;
    }

    @Operation(summary = "注册")
    @PostMapping("/register")
    public ApiResponse<UserResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ApiResponse.ok(authService.register(request));
    }

    @Operation(summary = "登录", description = "成功后写入 Cookie ACCESS_TOKEN，并在 body 返回 accessToken / refreshToken")
    @PostMapping("/login")
    public ApiResponse<TokenResponse> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletResponse response
    ) {
        TokenResponse tokens = authService.login(request);
        authCookieSupport.writeAccessToken(response, tokens.accessToken());
        return ApiResponse.ok(tokens);
    }

    @Operation(summary = "刷新令牌", description = "同样会刷新 Cookie ACCESS_TOKEN")
    @PostMapping("/refresh")
    public ApiResponse<TokenResponse> refresh(
            @Valid @RequestBody RefreshRequest request,
            HttpServletResponse response
    ) {
        TokenResponse tokens = authService.refresh(request.refreshToken());
        authCookieSupport.writeAccessToken(response, tokens.accessToken());
        return ApiResponse.ok(tokens);
    }

    @Operation(summary = "退出登录", description = "清除 ACCESS_TOKEN Cookie（Swagger 调试后可点这个清状态）")
    @PostMapping("/logout")
    public ApiResponse<Void> logout(HttpServletResponse response) {
        authCookieSupport.clearAccessToken(response);
        return ApiResponse.ok();
    }
}
