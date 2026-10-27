package com.cocktail.user.domain;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import com.cocktail.config.CocktailProperties;
import com.cocktail.shared.exception.BusinessException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 调用微信小程序 {@code jscode2session}，用前端 {@code wx.login} 的 code 换 openid。
 * <p>
 * 微信常返回 {@code Content-Type: text/plain}，不能直接按 JSON MediaType 反序列化，
 * 因此先读字符串再 {@link ObjectMapper} 解析。
 */
@Component
public class WechatMpClient {

    private static final Logger log = LoggerFactory.getLogger(WechatMpClient.class);
    private static final String CODE2SESSION =
            "https://api.weixin.qq.com/sns/jscode2session";

    private final CocktailProperties.WechatMp wechatMp;
    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public WechatMpClient(CocktailProperties properties, ObjectMapper objectMapper) {
        this.wechatMp = properties.wechatMp();
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(8_000);
        requestFactory.setReadTimeout(12_000);
        this.restClient = RestClient.builder().requestFactory(requestFactory).build();
        this.objectMapper = objectMapper;
    }

    public SessionInfo code2Session(String jsCode) {
        if (wechatMp == null
                || !StringUtils.hasText(wechatMp.appId())
                || !StringUtils.hasText(wechatMp.appSecret())) {
            throw new BusinessException(
                    "WECHAT_NOT_CONFIGURED",
                    "未配置微信小程序 AppId/AppSecret",
                    HttpStatus.SERVICE_UNAVAILABLE
            );
        }
        String url = UriComponentsBuilder.fromUriString(CODE2SESSION)
                .queryParam("appid", wechatMp.appId())
                .queryParam("secret", wechatMp.appSecret())
                .queryParam("js_code", jsCode)
                .queryParam("grant_type", "authorization_code")
                .toUriString();

        String raw;
        try {
            raw = restClient.get()
                    .uri(url)
                    .accept(MediaType.APPLICATION_JSON, MediaType.TEXT_PLAIN, MediaType.ALL)
                    .retrieve()
                    .body(String.class);
        } catch (Exception ex) {
            log.warn("WeChat jscode2session request failed: {}", ex.toString());
            throw new BusinessException(
                    "WECHAT_API_ERROR",
                    "无法连接微信登录服务，请检查服务器网络",
                    HttpStatus.BAD_GATEWAY
            );
        }
        if (!StringUtils.hasText(raw)) {
            throw new BusinessException(
                    "WECHAT_API_ERROR",
                    "微信登录无响应",
                    HttpStatus.BAD_GATEWAY
            );
        }

        Code2SessionResponse body;
        try {
            body = objectMapper.readValue(raw, Code2SessionResponse.class);
        } catch (Exception ex) {
            log.warn("WeChat jscode2session parse failed: body={}", raw);
            throw new BusinessException(
                    "WECHAT_API_ERROR",
                    "微信登录响应解析失败",
                    HttpStatus.BAD_GATEWAY
            );
        }
        if (body.errcode() != null && body.errcode() != 0) {
            log.info("WeChat jscode2session errcode={} errmsg={}", body.errcode(), body.errmsg());
            throw new BusinessException(
                    "WECHAT_LOGIN_FAILED",
                    mapWechatError(body.errcode(), body.errmsg()),
                    HttpStatus.UNAUTHORIZED
            );
        }
        if (!StringUtils.hasText(body.openid())) {
            throw new BusinessException(
                    "WECHAT_LOGIN_FAILED",
                    "微信未返回 openid",
                    HttpStatus.UNAUTHORIZED
            );
        }
        return new SessionInfo(body.openid(), body.unionid(), body.sessionKey());
    }

    private static String mapWechatError(Integer errcode, String errmsg) {
        if (errcode == null) {
            return errmsg != null ? errmsg : "微信登录失败";
        }
        return switch (errcode) {
            case 40029 -> "登录码无效或已过期，请重试";
            case 40163 -> "登录码已使用，请重试";
            case 40013 -> "AppId 无效，请检查配置";
            case 40125 -> "AppSecret 无效，请检查配置";
            case 45011 -> "请求过于频繁，请稍后再试";
            case -1 -> "微信系统繁忙，请稍后再试";
            default -> errmsg != null && !errmsg.isBlank() ? errmsg : ("微信登录失败(" + errcode + ")");
        };
    }

    public record SessionInfo(String openid, String unionid, String sessionKey) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record Code2SessionResponse(
            String openid,
            @JsonProperty("session_key") String sessionKey,
            String unionid,
            Integer errcode,
            String errmsg
    ) {
    }
}
