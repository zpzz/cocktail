package com.cocktail.shared.security;

import java.io.IOException;

import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * JWT 鉴权过滤器：每个请求执行一次。
 * <p>
 * Token 来源（优先顺序）：
 * <ol>
 *   <li>{@code Authorization: Bearer <token>}（APP / 手动 Authorize）</li>
 *   <li>Cookie {@code ACCESS_TOKEN}（Swagger 登录后浏览器自动带）</li>
 * </ol>
 * <p>
 * SSE（{@code SseEmitter}）会走 ASYNC 二次派发；默认 {@link OncePerRequestFilter}
 * 会跳过 async，导致 SecurityContext 丢失、对话接口固定 401。因此 async/error
 * 派发也要重新解析 Token。
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final AuthCookieSupport authCookieSupport;

    public JwtAuthenticationFilter(JwtService jwtService, AuthCookieSupport authCookieSupport) {
        this.jwtService = jwtService;
        this.authCookieSupport = authCookieSupport;
    }

    /** SSE / DeferredResult 异步派发时仍需带上登录态 */
    @Override
    protected boolean shouldNotFilterAsyncDispatch() {
        return false;
    }

    @Override
    protected boolean shouldNotFilterErrorDispatch() {
        return false;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String token = resolveToken(request);
        if (token != null) {
            try {
                Claims claims = jwtService.parse(token);
                Long userId = Long.valueOf(claims.getSubject());
                String username = claims.get("username", String.class);
                UserPrincipal principal = new UserPrincipal(userId, username);
                UsernamePasswordAuthenticationToken auth =
                        new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
                auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (Exception ignored) {
                SecurityContextHolder.clearContext();
            }
        }
        filterChain.doFilter(request, response);
    }

    private String resolveToken(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7).trim();
        }
        return authCookieSupport.readAccessToken(request);
    }
}
