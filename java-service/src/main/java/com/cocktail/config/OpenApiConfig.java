package com.cocktail.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.cocktail.shared.security.AuthCookieSupport;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;

/**
 * Swagger / OpenAPI 文档。
 * <p>
 * 推荐调试方式：在 Swagger 里调 {@code POST /api/cocktail/auth/login} → 响应会 Set-Cookie
 * {@code ACCESS_TOKEN} → 后续 Try it out 同源自动带 Cookie，无需每次粘贴 Token。
 * <p>
 * 也可点右上角 Authorize，用 Bearer 粘贴 accessToken（适合非浏览器客户端对照）。
 */
@Configuration
public class OpenApiConfig {

    @Bean
    OpenAPI cocktailOpenApi() {
        final String bearer = "bearerAuth";
        final String cookie = "cookieAuth";

        return new OpenAPI()
                .info(new Info()
                        .title("Cocktail Java API")
                        .description("""
                                业务后端：认证 / 酒柜 / 材料 / 工作台 / 对话代理。

                                **Swagger 登录用法**
                                1. 先调 `POST /api/cocktail/auth/register`（如无账号）
                                2. 再调 `POST /api/cocktail/auth/login`
                                3. 浏览器会收到 Cookie `ACCESS_TOKEN`，后续接口自动带上
                                4. 需要退出时调 `POST /api/cocktail/auth/logout`

                                也可用右上角 Authorize → Bearer JWT（粘贴登录返回的 accessToken）。
                                """)
                        .version("0.1.0")
                        .contact(new Contact().name("cocktail")))
                // 文档上标记：两种鉴权满足其一即可
                .addSecurityItem(new SecurityRequirement().addList(cookie))
                .addSecurityItem(new SecurityRequirement().addList(bearer))
                .components(new Components()
                        .addSecuritySchemes(cookie, new SecurityScheme()
                                .name(AuthCookieSupport.COOKIE_NAME)
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.COOKIE)
                                .description("登录接口写入的 ACCESS_TOKEN；Swagger 同源会自动发送"))
                        .addSecuritySchemes(bearer, new SecurityScheme()
                                .name("Authorization")
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("手动：登录响应里的 accessToken")));
    }
}
