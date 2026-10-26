package com.cocktail.shared.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import com.cocktail.shared.web.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Security 层 401/403 也走统一 {@link ApiResponse}，避免 Swagger 里看到空 body。
 * <p>
 * 未登录访问受保护接口时，Spring 常以匿名身份触发 AccessDenied(403)，这里统一成 401 + JSON。
 */
@Component
public class RestAuthEntryPoint implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final ObjectMapper objectMapper;

    public RestAuthEntryPoint(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** 完全未认证 */
    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authException
    ) throws IOException {
        write(response, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "未登录或 Token 无效");
    }

    /** 已认证但无权限，或匿名用户撞到需登录接口 */
    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException accessDeniedException
    ) throws IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean anonymous = auth == null
                || !auth.isAuthenticated()
                || auth instanceof AnonymousAuthenticationToken;
        if (anonymous) {
            write(response, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "未登录或 Token 无效，请先调用 /api/cocktail/auth/login");
        } else {
            write(response, HttpStatus.FORBIDDEN, "FORBIDDEN", "无权限访问该接口");
        }
    }

    private void write(HttpServletResponse response, HttpStatus httpStatus, String code, String message)
            throws IOException {
        response.setStatus(httpStatus.value());
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(
                response.getOutputStream(),
                ApiResponse.fail(httpStatus, code, message)
        );
    }
}
