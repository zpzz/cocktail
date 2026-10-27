package com.cocktail.user.domain;

import java.time.Instant;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cocktail.config.CocktailProperties;
import com.cocktail.shared.exception.BusinessException;
import com.cocktail.shared.security.JwtService;
import org.springframework.web.multipart.MultipartFile;

import com.cocktail.shared.security.SecurityUtils;
import com.cocktail.user.api.AuthDtos.LoginRequest;
import com.cocktail.user.api.AuthDtos.RegisterRequest;
import com.cocktail.user.api.AuthDtos.TokenResponse;
import com.cocktail.user.api.AuthDtos.UpdateProfileRequest;
import com.cocktail.user.api.AuthDtos.UserResponse;
import com.cocktail.user.api.AuthDtos.WechatLoginRequest;
import com.cocktail.user.mapper.AppUserMapper;
import com.cocktail.user.mapper.RefreshTokenMapper;

/**
 * 注册 / 登录 / 微信登录 / 刷新令牌。
 * <p>
 * Access Token = JWT（内存校验）；Refresh Token = 随机串入库，用一次作废再发新的。
 */
@Service
public class AuthService {

    private final AppUserMapper userMapper;
    private final RefreshTokenMapper refreshTokenMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final WechatMpClient wechatMpClient;
    private final UserAvatarStorage avatarStorage;
    private final long refreshTtlDays;

    public AuthService(
            AppUserMapper userMapper,
            RefreshTokenMapper refreshTokenMapper,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            WechatMpClient wechatMpClient,
            UserAvatarStorage avatarStorage,
            CocktailProperties properties
    ) {
        this.userMapper = userMapper;
        this.refreshTokenMapper = refreshTokenMapper;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.wechatMpClient = wechatMpClient;
        this.avatarStorage = avatarStorage;
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
        return toUserResponse(user);
    }

    /** 登录成功返回 access + refresh。 */
    @Transactional
    public TokenResponse login(LoginRequest request) {
        AppUser user = userMapper.selectOne(new LambdaQueryWrapper<AppUser>()
                .eq(AppUser::getUsername, request.username().trim()));
        if (user == null
                || !StringUtils.hasText(user.getPasswordHash())
                || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new BusinessException("INVALID_CREDENTIALS", "用户名或密码错误", HttpStatus.UNAUTHORIZED);
        }
        return issueTokens(user);
    }

    /**
     * 微信小程序登录：code → openid；可选写入 getUserProfile 的昵称/头像。
     */
    @Transactional
    public TokenResponse loginWithWechat(WechatLoginRequest request) {
        WechatMpClient.SessionInfo session = wechatMpClient.code2Session(request.code().trim());
        String openid = session.openid();

        AppUser user = userMapper.selectOne(new LambdaQueryWrapper<AppUser>()
                .eq(AppUser::getWxOpenid, openid));
        boolean dirty = false;
        if (user == null) {
            user = new AppUser();
            user.setWxOpenid(openid);
            user.setUsername(buildWechatUsername(openid));
            user.setNickname(resolveNickname(request.nickname(), null));
            user.setAvatarUrl(blankToNull(request.avatarUrl()));
            user.setPasswordHash(null);
            userMapper.insert(user);
        } else {
            if (StringUtils.hasText(request.nickname())
                    && !request.nickname().trim().equals(user.getNickname())) {
                user.setNickname(request.nickname().trim());
                dirty = true;
            }
            if (StringUtils.hasText(request.avatarUrl())
                    && !request.avatarUrl().trim().equals(user.getAvatarUrl())) {
                user.setAvatarUrl(request.avatarUrl().trim());
                dirty = true;
            }
            if (dirty) {
                userMapper.updateById(user);
            }
        }
        return issueTokens(user);
    }

    /** 更新当前用户昵称 / 头像 URL。 */
    @Transactional
    public UserResponse updateProfile(UpdateProfileRequest request) {
        Long userId = SecurityUtils.currentUserId();
        AppUser user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException("USER_NOT_FOUND", "用户不存在", HttpStatus.NOT_FOUND);
        }
        if (StringUtils.hasText(request.nickname())) {
            user.setNickname(request.nickname().trim());
        }
        if (StringUtils.hasText(request.avatarUrl())) {
            user.setAvatarUrl(request.avatarUrl().trim());
        }
        userMapper.updateById(user);
        return toUserResponse(user);
    }

    /** 上传头像文件并写入 avatar_url。 */
    @Transactional
    public UserResponse uploadAvatar(MultipartFile file) {
        Long userId = SecurityUtils.currentUserId();
        AppUser user = userMapper.selectById(userId);
        if (user == null) {
            throw new BusinessException("USER_NOT_FOUND", "用户不存在", HttpStatus.NOT_FOUND);
        }
        String url = avatarStorage.store(userId, file);
        user.setAvatarUrl(url);
        userMapper.updateById(user);
        return toUserResponse(user);
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

    private TokenResponse issueTokens(AppUser user) {
        String access = jwtService.createAccessToken(user.getId(), user.getUsername());
        String refresh = UUID.randomUUID() + UUID.randomUUID().toString().replace("-", "");
        RefreshToken entity = new RefreshToken();
        entity.setUserId(user.getId());
        entity.setToken(refresh);
        entity.setExpiresAt(Instant.now().plusSeconds(refreshTtlDays * 24 * 3600));
        entity.setRevoked(false);
        refreshTokenMapper.insert(entity);
        return new TokenResponse(
                access,
                refresh,
                "Bearer",
                jwtService.accessExpiresInSeconds(),
                user.getUsername(),
                user.getNickname() != null ? user.getNickname() : user.getUsername(),
                user.getAvatarUrl()
        );
    }

    private static UserResponse toUserResponse(AppUser user) {
        return new UserResponse(
                user.getId(),
                user.getUsername(),
                user.getNickname(),
                user.getAvatarUrl()
        );
    }

    private static String resolveNickname(String fromProfile, String existing) {
        if (StringUtils.hasText(fromProfile)) {
            return fromProfile.trim();
        }
        if (StringUtils.hasText(existing)) {
            return existing.trim();
        }
        return "微信用户";
    }

    private static String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static String buildWechatUsername(String openid) {
        String suffix = openid.length() <= 28 ? openid : openid.substring(openid.length() - 28);
        return "wx_" + suffix;
    }
}
