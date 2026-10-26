package com.cocktail;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

import com.cocktail.config.DotEnvLoader;

/**
 * Java 业务服务入口。
 * <p>
 * 负责：用户认证、酒柜、材料目录、调配工作台；AI 能力通过 {@code AiServiceClient} 调 Python。
 */
@SpringBootApplication(exclude = {
        // 关掉默认「随机密码内存用户」，我们用 JWT，不需要那个告警
        UserDetailsServiceAutoConfiguration.class
})
@ConfigurationPropertiesScan // 扫描 cocktail.* 配置（JWT、AI 地址等）
public class CocktailApplication {

    public static void main(String[] args) {
        // 与 Python 共用仓库根目录 .env（POSTGRES_HOST 等），避免默认连 127.0.0.1 失败
        DotEnvLoader.load();
        SpringApplication.run(CocktailApplication.class, args);
    }
}
