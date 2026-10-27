package com.cocktail.user.api;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.cocktail.shared.security.AuthCookieSupport;
import com.cocktail.shared.web.ApiResponse;
import com.cocktail.user.api.AuthDtos.LoginRequest;
import com.cocktail.user.api.AuthDtos.RefreshRequest;
import com.cocktail.user.api.AuthDtos.RegisterRequest;
import com.cocktail.user.api.AuthDtos.TokenResponse;
import com.cocktail.user.api.AuthDtos.UpdateProfileRequest;
import com.cocktail.user.api.AuthDtos.UserResponse;
import com.cocktail.user.api.AuthDtos.WechatLoginRequest;
import com.cocktail.user.domain.AuthService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

/**
 * 认证接口：注册、登录、微信登录、刷新、退出。
 * <p>
 * 登录/刷新会 {@code Set-Cookie: ACCESS_TOKEN}，Swagger 同源调试可直接带 Cookie 调需登录接口。
 */
@Tag(name = "认证", description = "注册 / 密码登录 / 微信登录 / 刷新 / 退出；登录会写入 Cookie ACCESS_TOKEN 便于 Swagger 调试")
@RestController
@RequestMapping("/api/cocktail/auth")
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

    @Operation(
            summary = "微信小程序登录",
            description = "传入 wx.login 的 code，以及 getUserProfile 的昵称/头像；按 openid 查找或自动注册并更新资料"
    )
    @PostMapping("/wechat")
    public ApiResponse<TokenResponse> wechatLogin(
            @Valid @RequestBody WechatLoginRequest request,
            HttpServletResponse response
    ) {
        TokenResponse tokens = authService.loginWithWechat(request);
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

    @Operation(summary = "更新资料", description = "更新当前登录用户的昵称 / 头像 URL，需 Bearer Token")
    @PatchMapping("/profile")
    public ApiResponse<UserResponse> updateProfile(@Valid @RequestBody UpdateProfileRequest request) {
        return ApiResponse.ok(authService.updateProfile(request));
    }

    @Operation(summary = "上传头像", description = "multipart 字段名 file；需 Bearer Token")
    @PostMapping(value = "/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<UserResponse> uploadAvatar(@RequestPart("file") MultipartFile file) {
        return ApiResponse.ok(authService.uploadAvatar(file));
    }
}
