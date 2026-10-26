package com.cocktail.shared.security;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;

import javax.crypto.SecretKey;

import org.springframework.stereotype.Service;

import com.cocktail.config.CocktailProperties;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

/**
 * Access Token 的签发与解析（HS256）。
 * <p>
 * APP 场景默认不过期：{@code access-ttl-minutes <= 0} 时不写 {@code exp}。
 * Refresh Token 不走 JWT，是随机串存在 {@code refresh_token} 表，见 {@code AuthService}。
 */
@Service
public class JwtService {

    private final SecretKey key;
    /** <=0 表示 Access Token 永不过期。 */
    private final long accessTtlMinutes;

    public JwtService(CocktailProperties properties) {
        // jjwt 要求 HMAC 密钥至少 256 bit；开发环境密钥偏短时补齐，生产请用足够长的 JWT_SECRET
        byte[] bytes = properties.jwt().secret().getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            byte[] padded = new byte[32];
            System.arraycopy(bytes, 0, padded, 0, Math.min(bytes.length, 32));
            bytes = padded;
        }
        this.key = Keys.hmacShaKeyFor(bytes);
        this.accessTtlMinutes = properties.jwt().accessTtlMinutes();
    }

    /** 登录成功后签发 Access Token；subject = 用户 id。 */
    public String createAccessToken(Long userId, String username) {
        Instant now = Instant.now();
        var builder = Jwts.builder()
                .subject(String.valueOf(userId))
                .claim("username", username)
                .issuedAt(Date.from(now));
        if (accessTtlMinutes > 0) {
            builder.expiration(Date.from(now.plusSeconds(accessTtlMinutes * 60)));
        }
        return builder.signWith(key).compact();
    }

    /** 解析并校验签名/过期；失败抛异常。 */
    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /** 给前端的 expiresIn（秒）；0 表示不过期。 */
    public long accessExpiresInSeconds() {
        return accessTtlMinutes > 0 ? accessTtlMinutes * 60 : 0;
    }
}
