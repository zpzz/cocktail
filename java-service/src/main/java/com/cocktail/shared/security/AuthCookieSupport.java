package com.cocktail.shared.security;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import com.cocktail.config.CocktailProperties;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 把 Access Token 放进 Cookie，方便 Swagger 同源调试。
 * <p>
 * 本地将 Cookie 设为可读（非 HttpOnly），配合 {@code /swagger-auth.js} 自动加 Bearer，
 * 解决 Swagger 调 SSE 时既不带 Cookie 又不带 Authorize 头的问题。
 * APP 正式环境仍应使用 {@code Authorization: Bearer}。
 */
@Component
public class AuthCookieSupport {

    public static final String COOKIE_NAME = "ACCESS_TOKEN";

    private final long accessTtlSeconds;

    public AuthCookieSupport(CocktailProperties properties) {
        this.accessTtlSeconds = properties.jwt().accessTtlMinutes() * 60;
    }

    /** 登录/刷新成功后写入 Cookie。 */
    public void writeAccessToken(HttpServletResponse response, String accessToken) {
        // 非 HttpOnly：Swagger 脚本可读 document.cookie 并注入 Authorization
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, accessToken)
                .httpOnly(false)
                .secure(false)
                .path("/")
                .maxAge(accessTtlSeconds)
                .sameSite("Lax")
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    /** 退出：清空 Cookie。 */
    public void clearAccessToken(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, "")
                .httpOnly(false)
                .secure(false)
                .path("/")
                .maxAge(0)
                .sameSite("Lax")
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    /** 从请求 Cookie 读取 token；没有则 null。 */
    public String readAccessToken(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (COOKIE_NAME.equals(cookie.getName()) && cookie.getValue() != null && !cookie.getValue().isBlank()) {
                return cookie.getValue();
            }
        }
        return null;
    }
}
