package com.cocktail.user.domain;

import java.time.Instant;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cocktail.config.CocktailProperties;
import com.cocktail.shared.exception.BusinessException;
import com.cocktail.shared.security.JwtService;
import com.cocktail.user.api.AuthDtos.LoginRequest;
import com.cocktail.user.api.AuthDtos.RegisterRequest;
import com.cocktail.user.api.AuthDtos.TokenResponse;
import com.cocktail.user.api.AuthDtos.UserResponse;
import com.cocktail.user.mapper.AppUserMapper;
import com.cocktail.user.mapper.RefreshTokenMapper;

/**
 * 注册 / 登录 / 刷新令牌。
 * <p>
 * Access Token = JWT（内存校验）；Refresh Token = 随机串入库，用一次作废再发新的。
 */
@Service
public class AuthService {

    private final AppUserMapper userMapper;
    private final RefreshTokenMapper refreshTokenMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final long refreshTtlDays;

    public AuthService(
            AppUserMapper userMapper,
            RefreshTokenMapper refreshTokenMapper,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            CocktailProperties properties
    ) {
        this.userMapper = userMapper;
        this.refreshTokenMapper = refreshTokenMapper;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.refreshTtlDays = properties.jwt().refreshTtlDays();
    }

    /** 注册：用户名唯一，密码 BCrypt 后写入 app_user。 */
    @Transactional
    public UserResponse register(RegisterRequest request) {
        Long count = userMapper.selectCount(new LambdaQueryWrapper<AppUser>()
                .eq(AppUser::getUsername, request.username().trim()));
        if (count != null && count > 0) {
            throw new BusinessException("USERNAME_TAKEN", "用户名已存在", HttpStatus.CONFLICT);
        }
        AppUser user = new AppUser();
        user.setUsername(request.username().trim());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setNickname(request.nickname() == null || request.nickname().isBlank()
                ? request.username()
                : request.nickname().trim());
        userMapper.insert(user);
        return new UserResponse(user.getId(), user.getUsername(), user.getNickname());
    }

    /** 登录成功返回 access + refresh。 */
    @Transactional
    public TokenResponse login(LoginRequest request) {
        AppUser user = userMapper.selectOne(new LambdaQueryWrapper<AppUser>()
                .eq(AppUser::getUsername, request.username().trim()));
        if (user == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new BusinessException("INVALID_CREDENTIALS", "用户名或密码错误", HttpStatus.UNAUTHORIZED);
        }
        return issueTokens(user);
    }

    /** 用 refresh 换新一对令牌；旧 refresh 标记 revoked。 */
    @Transactional
    public TokenResponse refresh(String refreshTokenValue) {
        RefreshToken stored = refreshTokenMapper.selectOne(new LambdaQueryWrapper<RefreshToken>()
                .eq(RefreshToken::getToken, refreshTokenValue));
        if (stored == null || stored.isRevoked() || stored.getExpiresAt().isBefore(Instant.now())) {
            throw new BusinessException("INVALID_REFRESH", "刷新令牌已失效", HttpStatus.UNAUTHORIZED);
        }
        stored.setRevoked(true);
        refreshTokenMapper.updateById(stored);

        AppUser user = userMapper.selectById(stored.getUserId());
        if (user == null) {
            throw new BusinessException("INVALID_REFRESH", "用户不存在", HttpStatus.UNAUTHORIZED);
        }
        return issueTokens(user);
    }

    /** 同时签发 JWT access 与入库的 refresh。 */
    private TokenResponse issueTokens(AppUser user) {
        String access = jwtService.createAccessToken(user.getId(), user.getUsername());
        String refresh = UUID.randomUUID() + UUID.randomUUID().toString().replace("-", "");
        RefreshToken entity = new RefreshToken();
        entity.setUserId(user.getId());
        entity.setToken(refresh);
        entity.setExpiresAt(Instant.now().plusSeconds(refreshTtlDays * 24 * 3600));
        entity.setRevoked(false);
        refreshTokenMapper.insert(entity);
        return new TokenResponse(access, refresh, "Bearer", jwtService.accessExpiresInSeconds());
    }
}
