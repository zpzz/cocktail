package com.cocktail.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 绑定 application.yml 里 {@code cocktail.*} 配置。
 *
 * @param jwt       Access / Refresh 时效与密钥
 * @param ai        Python AI 服务地址与各接口 path
 * @param workbench 工作台业务限制（如材料上限）
 * @param wechatMp  微信小程序（jscode2session）
 */
@ConfigurationProperties(prefix = "cocktail")
public record CocktailProperties(
        Jwt jwt,
        Ai ai,
        Workbench workbench,
        WechatMp wechatMp,
        /** 用户头像落盘目录，默认 ./data/avatars */
        String avatarDir
) {
    public record Jwt(
            String secret,
            long accessTtlMinutes,
            long refreshTtlDays
    ) {
    }

    public record Ai(
            String baseUrl,
            String chatPath,
            String resumePath,
            String recognizePath,
            String cabinetMenuPath,
            String workbenchAnalyzePath,
            String workbenchGeneratePath
    ) {
    }

    public record Workbench(int maxIngredients) {
    }

    /** 小程序 AppId / AppSecret；未配置时微信登录接口会报错 */
    public record WechatMp(
            String appId,
            String appSecret
    ) {
    }
}
