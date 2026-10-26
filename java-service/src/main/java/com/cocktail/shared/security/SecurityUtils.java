package com.cocktail.shared.security;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import com.cocktail.shared.exception.BusinessException;

/**
 * 从当前请求的 SecurityContext 取登录用户。
 * <p>
 * 依赖 {@link JwtAuthenticationFilter} 已把 {@link UserPrincipal} 放进上下文。
 */
public final class SecurityUtils {

    private SecurityUtils() {
    }

    /** 当前登录用户；未登录抛 401。 */
    public static UserPrincipal currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof UserPrincipal principal)) {
            throw new BusinessException("UNAUTHORIZED", "未登录", HttpStatus.UNAUTHORIZED);
        }
        return principal;
    }

    /** 当前用户主键，写酒柜/工作台时常用。 */
    public static Long currentUserId() {
        return currentUser().id();
    }
}
